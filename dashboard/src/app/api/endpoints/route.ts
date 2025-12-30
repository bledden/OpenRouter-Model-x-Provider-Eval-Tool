import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export interface ProviderEndpoint {
  name: string;
  modelName: string;
  contextLength: number;
  pricing: { prompt: string; completion: string };
  providerName: string;
  tag: string;
  quantization: string;
  maxCompletionTokens: number | null;
  supportedParameters: string[];
  status: number;
  uptimeLast30m: number;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const modelId = searchParams.get("model");

  if (!modelId) {
    return NextResponse.json(
      { error: "Model ID required" },
      { status: 400 }
    );
  }

  if (!OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://openrouter.ai/api/v1/models/${encodeURIComponent(modelId)}/endpoints`,
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Model not found" },
          { status: 404 }
        );
      }
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Transform endpoints
    const endpoints = data.data.endpoints.map((ep: {
      name: string;
      model_name: string;
      context_length: number;
      pricing: { prompt: string; completion: string };
      provider_name: string;
      tag: string;
      quantization: string;
      max_completion_tokens: number | null;
      supported_parameters: string[];
      status: number;
      uptime_last_30m: number;
    }) => ({
      name: ep.name,
      modelName: ep.model_name,
      contextLength: ep.context_length,
      pricing: {
        input: parseFloat(ep.pricing.prompt) * 1_000_000,
        output: parseFloat(ep.pricing.completion) * 1_000_000,
      },
      providerName: ep.provider_name,
      tag: ep.tag,
      quantization: ep.quantization,
      maxCompletionTokens: ep.max_completion_tokens,
      supportedParameters: ep.supported_parameters,
      status: ep.status,
      uptimeLast30m: ep.uptime_last_30m,
    }));

    return NextResponse.json({
      model: modelId,
      endpoints,
    });
  } catch (error) {
    console.error("Error fetching endpoints:", error);
    return NextResponse.json(
      { error: "Failed to fetch endpoints" },
      { status: 500 }
    );
  }
}
