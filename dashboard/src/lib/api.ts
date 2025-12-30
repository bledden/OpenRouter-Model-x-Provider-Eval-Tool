// API client utilities for the eval dashboard

export interface Model {
  id: string;
  name: string;
  contextLength: number;
  pricing: {
    input: number;
    output: number;
  };
}

export interface ProviderEndpoint {
  name: string;
  modelName: string;
  contextLength: number;
  pricing: {
    input: number;
    output: number;
  };
  providerName: string;
  tag: string;
  quantization: string;
  maxCompletionTokens: number | null;
  supportedParameters: string[];
  status: number;
  uptimeLast30m: number;
}

export interface EvalResult {
  model: string;
  provider: string;
  benchmark: string;
  score: number;
  samplesEvaluated: number;
  correctCount: number;
  durationMs: number;
  avgLatencyMs: number;
  results: Array<{
    question: string;
    expected: string;
    predicted: string;
    correct: boolean;
    latencyMs: number;
  }>;
  timestamp: string;
}

export async function fetchModels(): Promise<Model[]> {
  const response = await fetch("/api/models");
  if (!response.ok) {
    throw new Error("Failed to fetch models");
  }
  const data = await response.json();
  return data.models;
}

export async function fetchEndpoints(modelId: string): Promise<ProviderEndpoint[]> {
  const response = await fetch(`/api/endpoints?model=${encodeURIComponent(modelId)}`);
  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new Error("Failed to fetch endpoints");
  }
  const data = await response.json();
  return data.endpoints;
}

export async function runEvaluation(params: {
  model: string;
  provider?: string;
  benchmark: string;
  limit?: number;
}): Promise<EvalResult> {
  const response = await fetch("/api/eval", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Evaluation failed");
  }

  return response.json();
}

export async function runProviderComparison(params: {
  model: string;
  benchmark: string;
  limit?: number;
}): Promise<EvalResult[]> {
  // First, get all endpoints for the model
  const endpoints = await fetchEndpoints(params.model);

  // Filter active endpoints
  const activeEndpoints = endpoints.filter((ep) => ep.status === 0);

  // Run evaluations in parallel
  const results = await Promise.all(
    activeEndpoints.map((ep) =>
      runEvaluation({
        model: params.model,
        provider: ep.providerName,
        benchmark: params.benchmark,
        limit: params.limit,
      }).catch((error) => ({
        model: params.model,
        provider: ep.providerName,
        benchmark: params.benchmark,
        score: 0,
        samplesEvaluated: 0,
        correctCount: 0,
        durationMs: 0,
        avgLatencyMs: 0,
        results: [],
        timestamp: new Date().toISOString(),
        error: error.message,
      }))
    )
  );

  return results;
}

// Format score as percentage
export function formatScore(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}

// Format price per million tokens
export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

// Get score color class
export function getScoreColor(score: number): string {
  if (score >= 0.85) return "text-[var(--signal-green)]";
  if (score >= 0.7) return "text-[var(--signal-blue)]";
  if (score >= 0.5) return "text-[var(--signal-amber)]";
  return "text-[var(--signal-red)]";
}

// Get status color class
export function getStatusClass(status: number): string {
  return status === 0 ? "healthy" : "error";
}
