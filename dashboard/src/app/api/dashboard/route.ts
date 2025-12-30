import { NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  top_provider?: {
    is_moderated?: boolean;
  };
}

interface EndpointData {
  name: string;
  status: number;
  uptime_30d: number;
  latency_ms: number;
}

interface EndpointsResponse {
  data: {
    model_id: string;
    endpoints: EndpointData[];
  };
}

async function fetchModelEndpoints(modelId: string): Promise<EndpointData[] | null> {
  try {
    const response = await fetch(
      `https://openrouter.ai/api/v1/models/${encodeURIComponent(modelId)}/endpoints`,
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        next: { revalidate: 60 },
      }
    );

    if (!response.ok) return null;

    const data: EndpointsResponse = await response.json();
    return data.data?.endpoints || [];
  } catch {
    return null;
  }
}

export async function GET() {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 500 }
    );
  }

  try {
    // Fetch all models from OpenRouter
    const modelsResponse = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 300 },
    });

    if (!modelsResponse.ok) {
      throw new Error("Failed to fetch models");
    }

    const modelsData = await modelsResponse.json();
    const models: OpenRouterModel[] = modelsData.data || [];

    // Count unique providers (model creators)
    const modelProviders = new Set(models.map((m) => m.id.split("/")[0]));

    // Group models by provider to sample for endpoint data
    const modelsByProvider: Map<string, OpenRouterModel[]> = new Map();
    for (const model of models) {
      const provider = model.id.split("/")[0];
      const existing = modelsByProvider.get(provider) || [];
      existing.push(model);
      modelsByProvider.set(provider, existing);
    }

    // Sample models from each provider to get endpoint/uptime data
    // Take 1-2 popular models per provider to keep API calls reasonable
    const modelsToCheck: string[] = [];
    for (const [, providerModels] of modelsByProvider) {
      // Sort by popularity indicators and take top 2
      const sorted = providerModels.sort((a, b) => {
        const aScore = (a.id.includes("instruct") ? 10 : 0) +
          (a.id.includes("70b") ? 5 : 0) +
          (a.id.includes("chat") ? 3 : 0) +
          (a.context_length > 32000 ? 2 : 0);
        const bScore = (b.id.includes("instruct") ? 10 : 0) +
          (b.id.includes("70b") ? 5 : 0) +
          (b.id.includes("chat") ? 3 : 0) +
          (b.context_length > 32000 ? 2 : 0);
        return bScore - aScore;
      });
      modelsToCheck.push(...sorted.slice(0, 2).map((m) => m.id));
    }

    // Fetch endpoint health data in parallel (with limit to avoid overwhelming)
    const batchSize = 20;
    const allEndpointResults: { modelId: string; endpoints: EndpointData[] | null }[] = [];

    for (let i = 0; i < modelsToCheck.length; i += batchSize) {
      const batch = modelsToCheck.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (modelId) => {
          const endpoints = await fetchModelEndpoints(modelId);
          return { modelId, endpoints };
        })
      );
      allEndpointResults.push(...batchResults);

      // Add a small delay between batches to be nice to the API
      if (i + batchSize < modelsToCheck.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Calculate average uptime from all endpoints
    let totalUptime = 0;
    let uptimeCount = 0;
    const allEndpointProviders = new Set<string>();
    const providerUptimes: Map<string, number[]> = new Map();

    for (const { endpoints } of allEndpointResults) {
      if (endpoints) {
        for (const ep of endpoints) {
          totalUptime += ep.uptime_30d;
          uptimeCount++;
          allEndpointProviders.add(ep.name);

          // Track per-provider uptimes
          const uptimes = providerUptimes.get(ep.name) || [];
          uptimes.push(ep.uptime_30d);
          providerUptimes.set(ep.name, uptimes);
        }
      }
    }

    const avgUptime = uptimeCount > 0 ? (totalUptime / uptimeCount) * 100 : 99.0;

    // Calculate provider health summary
    let healthyProviders = 0;
    let warningProviders = 0;
    let errorProviders = 0;

    for (const [, uptimes] of providerUptimes) {
      const avgProviderUptime = uptimes.reduce((a, b) => a + b, 0) / uptimes.length;
      if (avgProviderUptime >= 0.99) healthyProviders++;
      else if (avgProviderUptime >= 0.95) warningProviders++;
      else errorProviders++;
    }

    return NextResponse.json({
      totalModels: models.length,
      activeProviders: modelProviders.size,
      uniqueEndpoints: allEndpointProviders.size,
      avgUptime: Math.round(avgUptime * 10) / 10,
      providerHealth: {
        healthy: healthyProviders,
        warning: warningProviders,
        error: errorProviders,
      },
      modelsChecked: modelsToCheck.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard statistics" },
      { status: 500 }
    );
  }
}
