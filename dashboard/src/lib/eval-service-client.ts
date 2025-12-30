/**
 * Client for the Python Eval Service (FastAPI + Inspect AI)
 *
 * This client connects to the external eval service for running evaluations
 * with proper benchmark scoring using Inspect AI.
 */

const EVAL_SERVICE_URL = process.env.NEXT_PUBLIC_EVAL_SERVICE_URL || "http://localhost:8000";

export interface Benchmark {
  id: string;
  name: string;
  description: string;
  category: string;
  inspect_task: string;
}

export interface EvalRequest {
  model: string;
  benchmark: string;
  provider?: string;
  limit?: number;
  temperature?: number;
  max_tokens?: number;
}

export interface EvalResult {
  model: string;
  benchmark: string;
  score: number;
  total_samples: number;
  correct: number;
  duration_seconds: number;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface StreamEvent {
  type: "start" | "progress" | "result" | "complete" | "error";
  data: Record<string, unknown>;
}

/**
 * Check if the eval service is available
 */
export async function checkEvalService(): Promise<boolean> {
  try {
    const response = await fetch(`${EVAL_SERVICE_URL}/`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get available benchmarks from the eval service
 */
export async function getBenchmarks(category?: string): Promise<Benchmark[]> {
  const params = category ? `?category=${category}` : "";
  const response = await fetch(`${EVAL_SERVICE_URL}/benchmarks${params}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch benchmarks: ${response.status}`);
  }

  const data = await response.json();
  return data.benchmarks;
}

/**
 * Run an evaluation (non-streaming)
 */
export async function runEvaluation(request: EvalRequest): Promise<EvalResult> {
  const response = await fetch(`${EVAL_SERVICE_URL}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || `Evaluation failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Run an evaluation with streaming progress
 */
export async function* streamEvaluation(
  request: EvalRequest,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  const response = await fetch(`${EVAL_SERVICE_URL}/run/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || `Evaluation failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE messages
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          yield {
            type: data.type,
            data,
          };
        } catch {
          // Ignore parse errors
        }
      }
    }
  }
}

/**
 * Get benchmark categories
 */
export async function getCategories(): Promise<string[]> {
  const response = await fetch(`${EVAL_SERVICE_URL}/benchmarks`);

  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.status}`);
  }

  const data = await response.json();
  return data.categories;
}

/**
 * Get details for a specific benchmark
 */
export async function getBenchmarkDetails(benchmarkId: string): Promise<Benchmark> {
  const response = await fetch(`${EVAL_SERVICE_URL}/benchmarks/${benchmarkId}`);

  if (!response.ok) {
    throw new Error(`Benchmark not found: ${benchmarkId}`);
  }

  return response.json();
}
