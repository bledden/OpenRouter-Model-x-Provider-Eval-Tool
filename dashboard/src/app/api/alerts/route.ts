import { NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export interface Alert {
  id: string;
  type: "error" | "warning" | "info";
  title: string;
  message: string;
  provider?: string;
  model?: string;
  timestamp: string;
  severity: number; // 1 = critical, 2 = warning, 3 = info
}

interface EndpointData {
  name: string;
  status: number; // 0 = offline, 1 = degraded, 2 = online
  uptime_30d: number;
  latency_ms: number;
  throughput_tokens_per_second: number;
}

interface ModelEndpointsResponse {
  data: {
    model_id: string;
    endpoints: EndpointData[];
  };
}

// Fetch endpoint health for a model
async function fetchModelEndpoints(modelId: string): Promise<EndpointData[] | null> {
  try {
    const response = await fetch(
      `https://openrouter.ai/api/v1/models/${encodeURIComponent(modelId)}/endpoints`,
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        next: { revalidate: 60 }, // Cache for 1 minute
      }
    );

    if (!response.ok) {
      return null;
    }

    const data: ModelEndpointsResponse = await response.json();
    return data.data?.endpoints || [];
  } catch {
    return null;
  }
}

// Get list of popular models to monitor
const MONITORED_MODELS = [
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3-opus",
  "google/gemini-2.0-flash-exp",
  "google/gemini-pro-1.5",
  "meta-llama/llama-3.3-70b-instruct",
  "meta-llama/llama-3.1-405b-instruct",
  "mistralai/mistral-large",
  "deepseek/deepseek-chat",
  "deepseek/deepseek-r1",
  "x-ai/grok-2",
  "x-ai/grok-4",
  "cohere/command-r-plus",
  "qwen/qwen-2.5-72b-instruct",
];

export async function GET() {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 500 }
    );
  }

  const alerts: Alert[] = [];
  const now = new Date();

  // Fetch endpoint data for monitored models in parallel
  const endpointPromises = MONITORED_MODELS.map(async (modelId) => {
    const endpoints = await fetchModelEndpoints(modelId);
    return { modelId, endpoints };
  });

  const results = await Promise.all(endpointPromises);

  for (const { modelId, endpoints } of results) {
    if (!endpoints) {
      // API error - couldn't fetch data
      continue;
    }

    const provider = modelId.split("/")[0];
    const modelName = modelId.split("/")[1];

    for (const endpoint of endpoints) {
      // Check for offline endpoints
      if (endpoint.status === 0) {
        alerts.push({
          id: `offline-${modelId}-${endpoint.name}`,
          type: "error",
          title: "Provider Offline",
          message: `${endpoint.name} endpoint for ${modelName} is currently offline`,
          provider: provider,
          model: modelId,
          timestamp: now.toISOString(),
          severity: 1,
        });
      }
      // Check for degraded endpoints
      else if (endpoint.status === 1) {
        alerts.push({
          id: `degraded-${modelId}-${endpoint.name}`,
          type: "warning",
          title: "Provider Degraded",
          message: `${endpoint.name} endpoint for ${modelName} is experiencing degraded performance`,
          provider: provider,
          model: modelId,
          timestamp: now.toISOString(),
          severity: 2,
        });
      }

      // Check for low uptime
      if (endpoint.uptime_30d < 0.95 && endpoint.status !== 0) {
        alerts.push({
          id: `uptime-${modelId}-${endpoint.name}`,
          type: "warning",
          title: "Low Uptime",
          message: `${endpoint.name} has ${(endpoint.uptime_30d * 100).toFixed(1)}% uptime over 30 days`,
          provider: provider,
          model: modelId,
          timestamp: now.toISOString(),
          severity: 2,
        });
      }

      // Check for high latency (> 5 seconds)
      if (endpoint.latency_ms > 5000 && endpoint.status === 2) {
        alerts.push({
          id: `latency-${modelId}-${endpoint.name}`,
          type: "info",
          title: "High Latency",
          message: `${endpoint.name} for ${modelName} has ${(endpoint.latency_ms / 1000).toFixed(1)}s average latency`,
          provider: provider,
          model: modelId,
          timestamp: now.toISOString(),
          severity: 3,
        });
      }

      // Check for low throughput (< 10 tokens/sec)
      if (endpoint.throughput_tokens_per_second < 10 && endpoint.status === 2) {
        alerts.push({
          id: `throughput-${modelId}-${endpoint.name}`,
          type: "info",
          title: "Low Throughput",
          message: `${endpoint.name} for ${modelName} has ${endpoint.throughput_tokens_per_second.toFixed(1)} tokens/sec throughput`,
          provider: provider,
          model: modelId,
          timestamp: now.toISOString(),
          severity: 3,
        });
      }
    }
  }

  // Sort alerts by severity (most critical first)
  alerts.sort((a, b) => a.severity - b.severity);

  // Get summary stats
  const criticalCount = alerts.filter((a) => a.severity === 1).length;
  const warningCount = alerts.filter((a) => a.severity === 2).length;
  const infoCount = alerts.filter((a) => a.severity === 3).length;

  return NextResponse.json({
    alerts,
    summary: {
      total: alerts.length,
      critical: criticalCount,
      warnings: warningCount,
      info: infoCount,
    },
    monitoredModels: MONITORED_MODELS.length,
    timestamp: now.toISOString(),
  });
}
