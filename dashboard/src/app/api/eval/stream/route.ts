import { NextRequest } from "next/server";

const EVAL_SERVICE_URL = process.env.NEXT_PUBLIC_EVAL_SERVICE_URL || "http://localhost:8000";

/**
 * Transform eval service message format to our expected format.
 * The eval service returns data in two formats:
 * - Some messages have properties at top level (e.g., start: {type, model, limit, ...})
 * - Some messages have a nested data object (e.g., result: {type, data: {question, correct, ...}})
 */
function transformEvalServiceMessage(raw: Record<string, unknown>): { type: string; data: Record<string, unknown> } {
  // Extract the actual data - it may be at top level or nested in a 'data' property
  const nested = raw.data as Record<string, unknown> | undefined;

  switch (raw.type) {
    case "start":
      // Start message has data at top level
      return {
        type: "start",
        data: {
          model: raw.model,
          provider: raw.provider || "openrouter",
          totalQuestions: raw.limit,
          timestamp: new Date().toISOString(),
        },
      };
    case "progress":
      // Progress can have data at top level or nested
      const progressMsg = nested?.message || raw.message;
      return {
        type: "progress",
        data: {
          currentQuestion: nested?.currentQuestion || raw.question || 0,
          totalQuestions: nested?.total || raw.total || 0,
          status: "running",
          message: progressMsg,
        },
      };
    case "result":
      // Result message has data nested in 'data' property
      if (!nested) {
        return { type: "result", data: {} };
      }
      const latencyMs = (nested.latencyMs || nested.latency_ms || 0) as number;
      return {
        type: "result",
        data: {
          questionIndex: ((nested.question as number) || 1) - 1,
          question: `Question ${nested.question}`,
          expected: nested.expected as string,
          predicted: nested.predicted as string,
          correct: nested.correct as boolean,
          latencyMs: latencyMs,
          subject: "eval-service",
          runningScore: (nested.runningScore || nested.running_score) as number,
          runningAvgLatency: latencyMs, // Use same value for running average
        },
      };
    case "complete":
      // Complete message has data nested in 'data' property
      if (!nested) {
        return { type: "complete", data: {} };
      }
      const total = (nested.total as number) || 1;
      const durationSeconds = (nested.duration_seconds as number) || 0;
      return {
        type: "complete",
        data: {
          model: nested.model,
          provider: nested.provider || "openrouter",
          score: nested.score,
          correctCount: nested.correct,
          totalQuestions: total,
          avgLatencyMs: (durationSeconds * 1000) / total,
          totalLatencyMs: durationSeconds * 1000,
          results: [],
          timestamp: nested.timestamp,
        },
      };
    case "error":
      const errorMsg = nested?.error || raw.error;
      return {
        type: "error",
        data: { error: errorMsg },
      };
    default:
      return { type: raw.type as string, data: nested || raw };
  }
}

// Valid providers that the Python eval service accepts
const VALID_PROVIDERS = ["openrouter", "openai", "anthropic", "google", "together", "fireworks"];


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const model = searchParams.get("model");
  const providerParam = searchParams.get("provider") || undefined;
  const limit = parseInt(searchParams.get("limit") || "10");
  const benchmark = searchParams.get("benchmark") || "mmlu";
  const seed = searchParams.get("seed") ? parseInt(searchParams.get("seed")!) : undefined;
  const epochs = parseInt(searchParams.get("epochs") || "1");

  if (!model) {
    return new Response("Model required", { status: 400 });
  }

  // Normalize the provider parameter
  // The frontend may pass OpenRouter provider tags (e.g., "atlas-cloud/fp8")
  // but the Python service only accepts backend providers (openrouter, openai, etc.)
  // For OpenRouter models, we always use "openrouter" as the backend
  let provider: string | undefined;
  if (providerParam) {
    const lowerProvider = providerParam.toLowerCase();
    if (VALID_PROVIDERS.includes(lowerProvider)) {
      provider = lowerProvider;
    } else {
      // If it's not a recognized backend provider, assume it's an OpenRouter provider tag
      // and use "openrouter" as the backend
      provider = "openrouter";
    }
  }

  // Build request body with optional parameters
  const requestBody: Record<string, unknown> = {
    model,
    benchmark,
    limit,
  };
  if (provider) requestBody.provider = provider;
  if (seed !== undefined) requestBody.seed = seed;
  if (epochs > 1) requestBody.epochs = epochs;

  // NOTE: Don't set reasoning_effort here - let the backend handle it
  // The backend automatically sets reasoning_effort=none for OpenAI reasoning models
  // via OpenRouter to get parseable text responses (reasoning is encrypted otherwise)

  // Call the Python eval service
  // Use a long timeout for evals - reasoning models can take 30+ seconds per question
  // For 100 questions at 30s each = 50 minutes max
  const timeoutMs = Math.max(600000, limit * 60000); // At least 10 min, or 1 min per question
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${EVAL_SERVICE_URL}/run/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to connect to eval service:", errorMessage);
    return new Response(
      JSON.stringify({
        error: `Failed to connect to eval service at ${EVAL_SERVICE_URL}. ${errorMessage}. Make sure the eval service is running (cd benchmark-service && ./start.sh)`,
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(
      JSON.stringify({
        error: `Eval service error: ${response.status} - ${errorText}. Make sure the eval service is running (cd benchmark-service && ./start.sh)`,
      }),
      {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // Stream and transform the response
  const reader = response.body?.getReader();
  if (!reader) {
    return new Response("No response body from eval service", { status: 500 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                // Transform eval service format to our expected format
                const transformed = transformEvalServiceMessage(data);
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify(transformed)}\n\n`)
                );
              } catch {
                // Pass through as-is if can't parse
                controller.enqueue(new TextEncoder().encode(line + "\n"));
              }
            }
          }
        }
        controller.close();
      } catch (error) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: "error", data: { error: String(error) } })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
