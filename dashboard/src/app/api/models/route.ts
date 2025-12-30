import { NextRequest, NextResponse } from "next/server";
import { applyCapabilityOverrides } from "@/lib/capability-overrides";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  architecture?: {
    modality: string;
    tokenizer: string;
    instruct_type?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  per_request_limits?: {
    prompt_tokens?: string;
    completion_tokens?: string;
  };
  supported_parameters?: string[];
}

export interface TransformedModel {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  pricing: { input: number; output: number };
  capabilities: string[];
  modality?: string;
  isModerated?: boolean;
}

export interface ModelCategory {
  id: string;
  name: string;
  count: number;
}

// Detect model capabilities from OpenRouter API data and heuristics
function detectCapabilities(model: OpenRouterModel): string[] {
  const capabilities: string[] = [];
  const id = model.id.toLowerCase();
  const name = model.name.toLowerCase();
  const desc = model.description?.toLowerCase() || "";
  const params = model.supported_parameters || [];
  const inputModalities = model.architecture?.input_modalities || [];

  // === CAPABILITIES FROM OPENROUTER API DATA ===

  // Function calling - from supported_parameters
  if (params.includes("tools") || params.includes("tool_choice")) {
    capabilities.push("function_calling");
  }

  // Reasoning - from supported_parameters
  if (params.includes("reasoning") || params.includes("include_reasoning")) {
    capabilities.push("reasoning");
  }

  // Vision - from input_modalities
  if (inputModalities.includes("image")) {
    capabilities.push("vision");
  }

  // Audio - from input_modalities
  if (inputModalities.includes("audio")) {
    capabilities.push("audio");
  }

  // Chat - from instruct_type or text modality (baseline for text models)
  if (model.architecture?.instruct_type || inputModalities.includes("text")) {
    capabilities.push("chat");
  }

  // === CAPABILITIES FROM HEURISTICS (name/description patterns) ===

  // Vision (additional heuristics if not already detected)
  if (!capabilities.includes("vision")) {
    if (
      model.architecture?.modality?.includes("image") ||
      id.includes("vision") ||
      id.includes("-vl") ||
      name.includes("vision") ||
      desc.includes("vision") ||
      desc.includes("image understanding")
    ) {
      capabilities.push("vision");
    }
  }

  // Coding capability
  if (
    id.includes("code") ||
    id.includes("coder") ||
    id.includes("codestral") ||
    id.includes("deepseek-coder") ||
    id.includes("starcoder") ||
    id.includes("wizardcoder") ||
    id.includes("phind") ||
    desc.includes("coding") ||
    desc.includes("programming") ||
    desc.includes("code generation")
  ) {
    capabilities.push("coding");
  }

  // Reasoning (additional heuristics if not already detected)
  if (!capabilities.includes("reasoning")) {
    if (
      id.includes("thinking") ||
      id.includes("reason") ||
      id.includes("/o1") ||
      id.includes("/o3") ||
      id.includes("qwq") ||
      id.includes("-r1") ||
      id.includes("deepseek-r1") ||
      desc.includes("reasoning") ||
      desc.includes("chain of thought") ||
      desc.includes("step-by-step")
    ) {
      capabilities.push("reasoning");
    }
  }

  // Chat (additional heuristics if not already detected)
  if (!capabilities.includes("chat")) {
    if (
      id.includes("instruct") ||
      id.includes("chat") ||
      id.includes("turbo") ||
      desc.includes("instruction following") ||
      desc.includes("conversational")
    ) {
      capabilities.push("chat");
    }
  }

  // Roleplay capability
  if (
    id.includes("mytho") ||
    id.includes("roleplay") ||
    id.includes("story") ||
    id.includes("nous") ||
    id.includes("dolphin") ||
    id.includes("hermes") ||
    id.includes("openchat") ||
    id.includes("airoboros") ||
    id.includes("synthia") ||
    id.includes("goliath") ||
    id.includes("lumimaid") ||
    id.includes("fimbul") ||
    id.includes("cinematika") ||
    id.includes("magnum") ||
    id.includes("euryale") ||
    id.includes("stheno") ||
    desc.includes("roleplay") ||
    desc.includes("character") ||
    desc.includes("storytelling") ||
    desc.includes("narrative generation")
  ) {
    capabilities.push("roleplay");
  }

  // Creative writing
  if (
    id.includes("writer") ||
    id.includes("novel") ||
    id.includes("creative") ||
    desc.includes("creative writing") ||
    desc.includes("creative") ||
    desc.includes("narrative") ||
    desc.includes("fiction")
  ) {
    capabilities.push("creative");
  }

  // Function calling (additional heuristics if not already detected)
  if (!capabilities.includes("function_calling")) {
    if (
      desc.includes("function calling") ||
      desc.includes("tool use") ||
      desc.includes("tool calling") ||
      desc.includes("agentic")
    ) {
      capabilities.push("function_calling");
    }
  }

  // Long context
  if (model.context_length >= 100000) {
    capabilities.push("long_context");
  }

  // Free tier
  if (
    parseFloat(model.pricing.prompt) === 0 &&
    parseFloat(model.pricing.completion) === 0
  ) {
    capabilities.push("free");
  }

  return [...new Set(capabilities)]; // Remove duplicates
}

// Get provider display name
function getProviderName(providerId: string): string {
  const names: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    "meta-llama": "Meta",
    google: "Google",
    mistralai: "Mistral AI",
    cohere: "Cohere",
    deepseek: "DeepSeek",
    qwen: "Qwen",
    "x-ai": "xAI",
    amazon: "Amazon",
    nvidia: "NVIDIA",
    microsoft: "Microsoft",
    databricks: "Databricks",
    perplexity: "Perplexity",
    "01-ai": "01.AI",
    "nousresearch": "Nous Research",
    "teknium": "Teknium",
    "cognitivecomputations": "Cognitive Computations",
  };
  return names[providerId] || providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const provider = searchParams.get("provider");
  const capability = searchParams.get("capability");
  const search = searchParams.get("search");
  const limit = parseInt(searchParams.get("limit") || "0");
  const sortBy = searchParams.get("sort") || "name"; // name, context, price

  if (!OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      // Cache for 5 minutes
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const rawModels: OpenRouterModel[] = data.data || [];

    // Transform models
    let models: TransformedModel[] = rawModels.map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.id.split("/")[0],
      contextLength: model.context_length,
      pricing: {
        input: parseFloat(model.pricing.prompt) * 1_000_000,
        output: parseFloat(model.pricing.completion) * 1_000_000,
      },
      capabilities: applyCapabilityOverrides(model.id, detectCapabilities(model)),
      modality: model.architecture?.modality,
      isModerated: model.top_provider?.is_moderated,
    }));

    // Filter by provider
    if (provider) {
      models = models.filter((m) => m.provider === provider);
    }

    // Filter by capability
    if (capability) {
      const caps = capability.split(",");
      models = models.filter((m) =>
        caps.some((cap) => m.capabilities.includes(cap))
      );
    }

    // Filter by search term
    if (search) {
      const searchLower = search.toLowerCase();
      models = models.filter(
        (m) =>
          m.id.toLowerCase().includes(searchLower) ||
          m.name.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    switch (sortBy) {
      case "context":
        models.sort((a, b) => b.contextLength - a.contextLength);
        break;
      case "price":
        models.sort((a, b) => a.pricing.input - b.pricing.input);
        break;
      case "name":
      default:
        models.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Get provider categories with counts
    const providerCounts: Record<string, number> = {};
    for (const model of models) {
      providerCounts[model.provider] = (providerCounts[model.provider] || 0) + 1;
    }
    const categories: ModelCategory[] = Object.entries(providerCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([id, count]) => ({
        id,
        name: getProviderName(id),
        count,
      }));

    // Get capability counts
    const capabilityCounts: Record<string, number> = {};
    for (const model of models) {
      for (const cap of model.capabilities) {
        capabilityCounts[cap] = (capabilityCounts[cap] || 0) + 1;
      }
    }

    // Apply limit
    const total = models.length;
    if (limit > 0) {
      models = models.slice(0, limit);
    }

    return NextResponse.json({
      models,
      categories,
      capabilities: capabilityCounts,
      total,
      returned: models.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching models from OpenRouter:", error);

    // Try fallback to static file
    try {
      const fallbackResponse = await fetch(
        new URL("/data/openrouter_models_list.json", request.url).toString()
      );

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        console.log(`Using fallback: ${fallbackData.length} models from static file`);

        // Transform fallback models to match our format
        let models: TransformedModel[] = fallbackData.map((model: {
          id: string;
          name: string;
          provider: string;
          context: number;
          free: boolean;
          input_price: number;
          output_price: number;
        }) => ({
          id: model.id,
          name: model.name,
          provider: model.provider,
          contextLength: model.context,
          pricing: {
            input: model.input_price * 1_000_000,
            output: model.output_price * 1_000_000,
          },
          capabilities: model.free ? ["free"] : [],
          modality: "text->text",
          isModerated: false,
        }));

        // Apply filters
        if (provider) {
          models = models.filter((m) => m.provider === provider);
        }
        if (search) {
          const searchLower = search.toLowerCase();
          models = models.filter(
            (m) =>
              m.id.toLowerCase().includes(searchLower) ||
              m.name.toLowerCase().includes(searchLower)
          );
        }

        const total = models.length;
        if (limit > 0) {
          models = models.slice(0, limit);
        }

        // Get provider categories
        const providerCounts: Record<string, number> = {};
        for (const model of models) {
          providerCounts[model.provider] = (providerCounts[model.provider] || 0) + 1;
        }
        const categories: ModelCategory[] = Object.entries(providerCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([id, count]) => ({
            id,
            name: getProviderName(id),
            count,
          }));

        return NextResponse.json({
          models,
          categories,
          capabilities: {},
          total,
          returned: models.length,
          source: "fallback",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (fallbackError) {
      console.error("Fallback also failed:", fallbackError);
    }

    return NextResponse.json(
      { error: "Failed to fetch models from OpenRouter and fallback" },
      { status: 500 }
    );
  }
}
