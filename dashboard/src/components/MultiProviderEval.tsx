"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Play,
  Square,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  ChevronRight,
} from "lucide-react";

interface ProviderResult {
  provider: string;
  providerName: string;
  status: "pending" | "running" | "complete" | "error";
  score?: number;
  totalQuestions?: number;
  durationMs?: number;
  error?: string;
}

interface MultiProviderEvalProps {
  model: string;
  providers: Array<{ tag: string; name: string }>;
  benchmark?: string;
  limit?: number;
  onComplete?: (results: ProviderResult[]) => void;
}

export default function MultiProviderEval({
  model,
  providers,
  benchmark = "mmlu",
  limit = 10,
  onComplete,
}: MultiProviderEvalProps) {
  const [providerResults, setProviderResults] = useState<ProviderResult[]>(
    providers.map((p) => ({
      provider: p.tag,
      providerName: p.name,
      status: "pending",
    }))
  );
  const [currentProviderIndex, setCurrentProviderIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const runSingleProviderEval = useCallback(
    async (providerTag: string, providerName: string): Promise<ProviderResult> => {
      const controller = new AbortController();
      setAbortController(controller);

      try {
        const params = new URLSearchParams({
          model,
          benchmark,
          limit: limit.toString(),
          provider: providerTag,
        });

        const response = await fetch(`/api/eval/stream?${params}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          let errorMessage = `Failed to start evaluation (${response.status})`;
          try {
            const errorBody = await response.json();
            if (errorBody.error) {
              errorMessage = errorBody.error;
            }
          } catch {
            // If response isn't JSON, use status text
            errorMessage = `Failed: ${response.status} ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let finalResult: ProviderResult = {
          provider: providerTag,
          providerName,
          status: "running",
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const message = JSON.parse(line.slice(6));

                if (message.type === "complete") {
                  const data = message.data || message;
                  finalResult = {
                    provider: providerTag,
                    providerName,
                    status: "complete",
                    score: data.score,
                    totalQuestions: data.total,
                    durationMs: (data.duration_seconds || 0) * 1000,
                  };
                } else if (message.type === "error") {
                  const data = message.data || message;
                  finalResult = {
                    provider: providerTag,
                    providerName,
                    status: "error",
                    error: data.error || data.message || "Unknown error",
                  };
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        return finalResult.status === "running"
          ? { ...finalResult, status: "error", error: "Evaluation did not complete" }
          : finalResult;
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return {
            provider: providerTag,
            providerName,
            status: "pending",
          };
        }
        return {
          provider: providerTag,
          providerName,
          status: "error",
          error: String(error),
        };
      }
    },
    [model, benchmark, limit]
  );

  const startAllEvals = useCallback(async () => {
    setIsRunning(true);
    const results: ProviderResult[] = [...providerResults];

    for (let i = 0; i < providers.length; i++) {
      setCurrentProviderIndex(i);

      // Update status to running
      results[i] = { ...results[i], status: "running" };
      setProviderResults([...results]);

      // Run the eval
      const result = await runSingleProviderEval(
        providers[i].tag,
        providers[i].name
      );

      // Update with result
      results[i] = result;
      setProviderResults([...results]);

      // If aborted, stop
      if (result.status === "pending") {
        break;
      }
    }

    setIsRunning(false);
    setCurrentProviderIndex(-1);

    // Call onComplete with all results
    if (onComplete) {
      onComplete(results.filter((r) => r.status === "complete"));
    }
  }, [providers, providerResults, runSingleProviderEval, onComplete]);

  const stopEval = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setIsRunning(false);
  }, [abortController]);

  // Auto-start on mount
  useEffect(() => {
    if (!isRunning && currentProviderIndex === -1) {
      startAllEvals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completedCount = providerResults.filter((r) => r.status === "complete").length;
  const errorCount = providerResults.filter((r) => r.status === "error").length;

  return (
    <div className="space-y-4">
      {/* Progress Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-[var(--text-primary)]">
            Multi-Provider Comparison
          </h4>
          <p className="text-sm text-[var(--text-muted)]">
            Testing {model} across {providers.length} providers
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isRunning ? (
            <button
              onClick={stopEval}
              className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-2"
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          ) : completedCount < providers.length ? (
            <button
              onClick={startAllEvals}
              className="btn-primary px-3 py-1.5 text-sm flex items-center gap-2"
            >
              <Play className="w-3 h-3" />
              Resume
            </button>
          ) : null}
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
          <span>
            {completedCount} of {providers.length} complete
            {errorCount > 0 && ` (${errorCount} failed)`}
          </span>
          <span>{Math.round((completedCount / providers.length) * 100)}%</span>
        </div>
        <div className="progress-bar h-2">
          <div
            className="progress-bar-fill"
            style={{ width: `${(completedCount / providers.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Provider List */}
      <div className="space-y-2">
        {providerResults.map((result, index) => (
          <div
            key={result.provider}
            className={`p-3 rounded-lg border transition-all ${
              result.status === "running"
                ? "border-[var(--signal-blue)] bg-[var(--signal-blue-dim)]"
                : result.status === "complete"
                ? "border-[var(--signal-green-dim)] bg-[var(--surface-elevated)]"
                : result.status === "error"
                ? "border-[var(--signal-red-dim)] bg-[var(--surface-elevated)]"
                : "border-[var(--border)] bg-[var(--surface)]"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Status Icon */}
                {result.status === "pending" && (
                  <div className="w-5 h-5 rounded-full border-2 border-[var(--border)]" />
                )}
                {result.status === "running" && (
                  <Loader2 className="w-5 h-5 text-[var(--signal-blue)] animate-spin" />
                )}
                {result.status === "complete" && (
                  <CheckCircle className="w-5 h-5 text-[var(--signal-green)]" />
                )}
                {result.status === "error" && (
                  <XCircle className="w-5 h-5 text-[var(--signal-red)]" />
                )}

                {/* Provider Name */}
                <div>
                  <div className="font-medium text-[var(--text-primary)]">
                    {result.providerName}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] font-mono">
                    {result.provider}
                  </div>
                </div>
              </div>

              {/* Results */}
              <div className="flex items-center gap-4">
                {result.status === "complete" && result.score !== undefined && (
                  <>
                    <div className="text-right">
                      <div
                        className={`font-mono font-bold ${
                          result.score >= 0.8
                            ? "text-[var(--signal-green)]"
                            : result.score >= 0.6
                            ? "text-[var(--signal-blue)]"
                            : "text-[var(--signal-amber)]"
                        }`}
                      >
                        {(result.score * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">Score</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[var(--text-primary)]">
                        {((result.durationMs || 0) / 1000).toFixed(1)}s
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">Time</div>
                    </div>
                  </>
                )}
                {result.status === "error" && (
                  <div className="text-sm text-[var(--signal-red)] max-w-[200px] truncate">
                    {result.error}
                  </div>
                )}
                {result.status === "running" && (
                  <div className="text-sm text-[var(--signal-blue)]">
                    Evaluating...
                  </div>
                )}
                {result.status === "pending" && index > currentProviderIndex && (
                  <div className="text-sm text-[var(--text-muted)]">Waiting...</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary when complete */}
      {!isRunning && completedCount > 0 && (
        <div className="p-4 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)]">
          <h5 className="font-semibold text-[var(--text-primary)] mb-2">
            Comparison Complete
          </h5>
          {(() => {
            const completed = providerResults.filter((r) => r.status === "complete");
            const best = completed.reduce(
              (a, b) => ((a.score || 0) > (b.score || 0) ? a : b),
              completed[0]
            );
            const fastest = completed.reduce(
              (a, b) => ((a.durationMs || Infinity) < (b.durationMs || Infinity) ? a : b),
              completed[0]
            );

            return (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[var(--text-muted)]">Highest Score</div>
                  <div className="font-medium text-[var(--signal-green)]">
                    {best?.providerName} ({((best?.score || 0) * 100).toFixed(1)}%)
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Fastest</div>
                  <div className="font-medium text-[var(--signal-blue)]">
                    {fastest?.providerName} ({((fastest?.durationMs || 0) / 1000).toFixed(1)}s)
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
