import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export interface ProviderEndpoint {
  name: string;
  provider_name: string;
  tag: string;
  status: number; // 0 = offline, 1 = degraded, 2 = online
  uptime_last_30m: number;
  quantization: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export interface TransformedProvider {
  name: string;
  tag: string;
  status: "healthy" | "warning" | "error";
  quantization: string;
  uptime: number;
  latencyP50: number;
  latencyP95: number;
  pricing: { input: number; output: number };
  modelCount: number;
  modelsChecked: string[];
}

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
}

async function fetchAllModels(): Promise<OpenRouterModel[]> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.data || [];
  } catch {
    return [];
  }
}

async function fetchModelEndpoints(modelId: string): Promise<ProviderEndpoint[] | null> {
  try {
    // Don't encode the model ID - the API expects the slash as-is
    const url = `https://openrouter.ai/api/v1/models/${modelId}/endpoints`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return null;
    }

    const json = await response.json();
    return json.data?.endpoints || [];
  } catch {
    return null;
  }
}

function getProviderStatus(status: number, uptime: number): "healthy" | "warning" | "error" {
  if (status === 0 && uptime < 50) return "error";
  if (status === 0 || uptime < 95) return "warning";
  return "healthy";
}

function extractQuantization(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("bf16")) return "BF16";
  if (lower.includes("fp16")) return "FP16";
  if (lower.includes("fp8")) return "FP8";
  if (lower.includes("int8")) return "INT8";
  if (lower.includes("int4") || lower.includes("awq") || lower.includes("gptq")) return "INT4";
  return "FP16";
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const specificModel = searchParams.get("model");
  const maxModelsPerProvider = parseInt(searchParams.get("samplesPerProvider") || "3");

  if (!OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 500 }
    );
  }

  try {
    // If a specific model is requested, just get its endpoints
    if (specificModel) {
      const endpoints = await fetchModelEndpoints(specificModel);

      if (!endpoints || endpoints.length === 0) {
        return NextResponse.json({
          providers: [],
          model: specificModel,
          message: "No endpoints found for this model",
          timestamp: new Date().toISOString(),
        });
      }

      const providers: TransformedProvider[] = endpoints.map((ep) => ({
        name: ep.provider_name || ep.name.split(" | ")[0],
        tag: ep.tag || ep.name.toLowerCase().replace(/\s+/g, "-"),
        status: getProviderStatus(ep.status, ep.uptime_last_30m),
        quantization: ep.quantization !== "unknown" ? ep.quantization.toUpperCase() : extractQuantization(ep.name),
        uptime: Math.round(ep.uptime_last_30m * 10) / 10,
        latencyP50: 0, // Not available in endpoints API
        latencyP95: 0,
        pricing: {
          input: parseFloat(ep.pricing?.prompt || "0") * 1_000_000,
          output: parseFloat(ep.pricing?.completion || "0") * 1_000_000,
        },
        modelCount: 1,
        modelsChecked: [specificModel],
      }));

      providers.sort((a, b) => b.uptime - a.uptime);

      return NextResponse.json({
        providers,
        model: specificModel,
        timestamp: new Date().toISOString(),
      });
    }

    // Fetch all models to discover hosting providers by sampling endpoints
    const allModels = await fetchAllModels();

    if (allModels.length === 0) {
      return NextResponse.json({
        providers: [],
        error: "Could not fetch models from OpenRouter",
        timestamp: new Date().toISOString(),
      });
    }

    // Sample popular models to discover hosting providers
    // We need to check endpoints to find actual hosting providers (Together, Fireworks, etc.)
    const popularModels = allModels
      .filter(m =>
        m.id.includes("llama") ||
        m.id.includes("mixtral") ||
        m.id.includes("qwen") ||
        m.id.includes("gemma") ||
        m.id.includes("deepseek")
      )
      .sort((a, b) => {
        // Prefer instruct models and larger sizes
        const aScore = (a.id.includes("instruct") ? 10 : 0) +
                       (a.id.includes("70b") ? 5 : 0) +
                       (a.id.includes("chat") ? 3 : 0);
        const bScore = (b.id.includes("instruct") ? 10 : 0) +
                       (b.id.includes("70b") ? 5 : 0) +
                       (b.id.includes("chat") ? 3 : 0);
        return bScore - aScore;
      })
      .slice(0, Math.min(maxModelsPerProvider * 5, 15)); // Sample up to 15 models

    // Aggregate hosting providers across sampled models
    const hostingProviderData: Map<string, {
      name: string;
      tag: string;
      endpoints: ProviderEndpoint[];
      modelsServed: string[];
      totalUptime: number;
      uptimeCount: number;
      pricing: { input: number; output: number };
      pricingCount: number;
    }> = new Map();

    const fetchPromises: Promise<void>[] = [];

    for (const model of popularModels) {
      fetchPromises.push(
        fetchModelEndpoints(model.id).then((endpoints) => {
          if (endpoints && endpoints.length > 0) {
            for (const ep of endpoints) {
              // Use the tag as the unique identifier for hosting providers
              const providerTag = ep.tag || ep.name.toLowerCase().replace(/\s+/g, "-");
              const providerName = ep.provider_name || ep.name.split(" | ")[0];

              const existing = hostingProviderData.get(providerTag) || {
                name: providerName,
                tag: providerTag,
                endpoints: [],
                modelsServed: [],
                totalUptime: 0,
                uptimeCount: 0,
                pricing: { input: 0, output: 0 },
                pricingCount: 0,
              };

              // Add this endpoint if not already tracked
              if (!existing.endpoints.find(e => e.name === ep.name)) {
                existing.endpoints.push(ep);
              }

              // Track which models this provider serves
              if (!existing.modelsServed.includes(model.id)) {
                existing.modelsServed.push(model.id);
              }

              // Aggregate uptime
              existing.totalUptime += ep.uptime_last_30m;
              existing.uptimeCount += 1;

              // Aggregate pricing
              const inputPrice = parseFloat(ep.pricing?.prompt || "0") * 1_000_000;
              const outputPrice = parseFloat(ep.pricing?.completion || "0") * 1_000_000;
              if (inputPrice > 0 || outputPrice > 0) {
                existing.pricing.input = (existing.pricing.input * existing.pricingCount + inputPrice) / (existing.pricingCount + 1);
                existing.pricing.output = (existing.pricing.output * existing.pricingCount + outputPrice) / (existing.pricingCount + 1);
                existing.pricingCount += 1;
              }

              hostingProviderData.set(providerTag, existing);
            }
          }
        })
      );
    }

    // Wait for all fetches (with a timeout)
    await Promise.race([
      Promise.all(fetchPromises),
      new Promise((resolve) => setTimeout(resolve, 15000)), // 15 second timeout
    ]);

    // Build provider list from aggregated hosting provider data
    const providers: TransformedProvider[] = [];

    for (const [, data] of hostingProviderData) {
      if (data.endpoints.length === 0) continue;

      const avgUptime = data.uptimeCount > 0 ? data.totalUptime / data.uptimeCount : 0;
      const worstStatus = Math.min(...data.endpoints.map((ep) => ep.status));

      // Get the most common quantization
      const quantizations = data.endpoints.map((ep) =>
        ep.quantization !== "unknown" ? ep.quantization.toUpperCase() : extractQuantization(ep.name)
      );
      const quantization = quantizations.sort((a, b) =>
        quantizations.filter((q) => q === b).length - quantizations.filter((q) => q === a).length
      )[0] || "FP16";

      providers.push({
        name: data.name,
        tag: data.tag,
        status: getProviderStatus(worstStatus, avgUptime),
        quantization,
        uptime: Math.round(avgUptime * 10) / 10,
        latencyP50: 0,
        latencyP95: 0,
        pricing: {
          input: Math.round(data.pricing.input * 100) / 100,
          output: Math.round(data.pricing.output * 100) / 100,
        },
        modelCount: data.modelsServed.length,
        modelsChecked: data.modelsServed,
      });
    }

    // Sort by model count (more models = more useful provider), then by uptime
    providers.sort((a, b) => {
      if (b.modelCount !== a.modelCount) return b.modelCount - a.modelCount;
      return b.uptime - a.uptime;
    });

    return NextResponse.json({
      providers,
      totalHostingProviders: providers.length,
      modelsSampled: popularModels.length,
      totalModels: allModels.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching providers:", error);
    return NextResponse.json(
      { error: "Failed to fetch provider data" },
      { status: 500 }
    );
  }
}
