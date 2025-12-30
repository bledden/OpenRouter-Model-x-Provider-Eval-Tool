"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Play,
  Square,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Target,
  Zap,
  FileSpreadsheet,
  FileText,
  FileDown,
} from "lucide-react";
import { exportResults, type ExportableEvalData } from "@/lib/export-utils";

interface EvalResult {
  question: string;
  expected: string;
  predicted: string;
  correct: boolean;
  latencyMs: number;
  subject: string;
}

interface EvalState {
  status: "idle" | "running" | "complete" | "error";
  model: string;
  provider: string;
  currentQuestion: number;
  totalQuestions: number;
  results: EvalResult[];
  score: number;
  avgLatency: number;
  correctCount?: number; // From complete message when no individual results
  error?: string;
}

interface EvalProgressProps {
  model: string;
  provider?: string;
  benchmark?: string;
  limit?: number;
  onComplete?: (results: EvalState) => void;
  autoStart?: boolean;
}

export default function EvalProgress({
  model,
  provider,
  benchmark = "mmlu",
  limit = 10,
  onComplete,
  autoStart = false,
}: EvalProgressProps) {
  const [state, setState] = useState<EvalState>({
    status: "idle",
    model,
    provider: provider ?? "default",
    currentQuestion: 0,
    totalQuestions: limit,
    results: [],
    score: 0,
    avgLatency: 0,
  });

  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const hasStartedRef = useRef(false);

  const startEval = useCallback(async () => {
    const controller = new AbortController();
    setAbortController(controller);

    setState((prev) => ({
      ...prev,
      status: "running",
      currentQuestion: 0,
      results: [],
      score: 0,
      avgLatency: 0,
      error: undefined,
    }));

    try {
      const params = new URLSearchParams({
        model,
        benchmark,
        limit: limit.toString(),
      });
      if (provider) {
        params.set("provider", provider);
      }

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
          errorMessage = `Failed to start evaluation: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
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
              const message = JSON.parse(line.slice(6));
              handleMessage(message);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setState((prev) => ({ ...prev, status: "idle" }));
      } else {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: String(error),
        }));
      }
    }
  }, [model, provider, benchmark, limit]);

  // Auto-start eval when component mounts if autoStart is true
  // Use ref to prevent double-starting from React strict mode or re-renders
  useEffect(() => {
    if (autoStart && state.status === "idle" && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startEval();
    }
  }, [autoStart, startEval, state.status]);

  const handleMessage = (message: { type: string; data: Record<string, unknown> }) => {
    switch (message.type) {
      case "start":
        setState((prev) => ({
          ...prev,
          totalQuestions: message.data.totalQuestions as number,
        }));
        break;

      case "progress":
        setState((prev) => ({
          ...prev,
          currentQuestion: message.data.currentQuestion as number,
        }));
        break;

      case "result":
        setState((prev) => {
          const newResult = message.data as unknown as EvalResult;
          const newResults = [...prev.results, newResult];
          // Calculate running average latency across all results
          const totalLatency = newResults.reduce((sum, r) => sum + (r.latencyMs || 0), 0);
          const avgLatency = newResults.length > 0 ? totalLatency / newResults.length : 0;
          return {
            ...prev,
            results: newResults,
            score: message.data.runningScore as number,
            avgLatency: avgLatency,
          };
        });
        break;

      case "complete":
        console.log("[EvalProgress] Received complete message:", message);
        setState((prev) => {
          const finalState: EvalState = {
            status: "complete",
            model,
            provider: provider ?? "default",
            currentQuestion: message.data.totalQuestions as number,
            totalQuestions: message.data.totalQuestions as number,
            // Keep accumulated results from 'result' messages, don't overwrite with empty array
            results: prev.results,
            score: message.data.score as number,
            avgLatency: message.data.avgLatencyMs as number,
            // Store correctCount from complete message for display when no individual results
            correctCount: message.data.correctCount as number,
          };
          // Call onComplete outside of setState to avoid React warning
          // Use setTimeout to defer the callback until after render
          setTimeout(() => {
            console.log("[EvalProgress] Calling onComplete with:", finalState);
            onComplete?.(finalState);
          }, 0);
          return finalState;
        });
        break;

      case "error":
        setState((prev) => ({
          ...prev,
          status: "error",
          error: message.data.error as string,
        }));
        break;
    }
  };

  const stopEval = () => {
    abortController?.abort();
    setAbortController(null);
  };

  const progress = state.totalQuestions > 0
    ? (state.currentQuestion / state.totalQuestions) * 100
    : 0;

  return (
    <div className="card p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-[var(--text-primary)]">
            Live Evaluation
          </h3>
          <p className="text-sm text-[var(--text-muted)]">
            {model} {provider ? `via ${provider}` : ""}
          </p>
        </div>

        {state.status === "idle" && (
          <button
            onClick={startEval}
            className="btn-primary flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Start Eval
          </button>
        )}

        {state.status === "running" && (
          <button
            onClick={stopEval}
            className="btn-secondary flex items-center gap-2"
          >
            <Square className="w-4 h-4" />
            Stop
          </button>
        )}

        {state.status === "complete" && (
          <button
            onClick={startEval}
            className="btn-secondary flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Run Again
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {state.status === "running" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-secondary)]">
              Question {state.currentQuestion} of {state.totalQuestions}
            </span>
            <span className="text-[var(--text-muted)]">{progress.toFixed(0)}%</span>
          </div>
          <div className="progress-bar h-2">
            <div
              className="progress-bar-fill transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Live Stats */}
      {(state.status === "running" || state.status === "complete") && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-[var(--text-muted)] mb-2">
              <Target className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider">Score</span>
            </div>
            <div
              className={`font-mono text-2xl font-bold ${
                (state.score ?? 0) >= 0.8
                  ? "text-[var(--signal-green)]"
                  : (state.score ?? 0) >= 0.6
                  ? "text-[var(--signal-blue)]"
                  : "text-[var(--signal-amber)]"
              }`}
            >
              {((state.score ?? 0) * 100).toFixed(1)}%
            </div>
          </div>

          <div className="card p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-[var(--text-muted)] mb-2">
              <Clock className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider">Avg Latency</span>
            </div>
            <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
              {(state.avgLatency ?? 0).toFixed(0)}ms
            </div>
          </div>

          <div className="card p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-[var(--text-muted)] mb-2">
              <Zap className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider">Correct</span>
            </div>
            <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
              {state.results.length > 0
                ? `${state.results.filter((r) => r.correct).length}/${state.results.length}`
                : `${state.correctCount ?? 0}/${state.totalQuestions}`
              }
            </div>
          </div>
        </div>
      )}

      {/* Completion Summary when no individual results */}
      {state.status === "complete" && state.results.length === 0 && (
        <div className="p-4 rounded-lg bg-[var(--signal-green-dim)] border border-[var(--signal-green)]">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-[var(--signal-green)]" />
            <span className="font-semibold text-[var(--text-primary)]">Evaluation Complete</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Scored {state.correctCount ?? 0} out of {state.totalQuestions} questions correctly ({((state.score ?? 0) * 100).toFixed(1)}%)
          </p>
        </div>
      )}

      {/* Export Buttons - Show when complete */}
      {state.status === "complete" && (
        <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
          <span className="text-sm text-[var(--text-muted)] mr-2">Export:</span>
          <button
            onClick={() => {
              const exportData: ExportableEvalData = {
                model: state.model,
                provider: state.provider,
                benchmark,
                score: state.score,
                totalQuestions: state.totalQuestions,
                correctCount: state.results.length > 0
                  ? state.results.filter(r => r.correct).length
                  : (state.correctCount ?? 0),
                avgLatency: state.avgLatency,
                results: state.results,
                timestamp: new Date().toISOString(),
              };
              exportResults(exportData, "csv");
            }}
            className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-1.5"
            title="Export as CSV spreadsheet"
          >
            <FileSpreadsheet className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={() => {
              const exportData: ExportableEvalData = {
                model: state.model,
                provider: state.provider,
                benchmark,
                score: state.score,
                totalQuestions: state.totalQuestions,
                correctCount: state.results.length > 0
                  ? state.results.filter(r => r.correct).length
                  : (state.correctCount ?? 0),
                avgLatency: state.avgLatency,
                results: state.results,
                timestamp: new Date().toISOString(),
              };
              exportResults(exportData, "txt");
            }}
            className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-1.5"
            title="Export as plain text"
          >
            <FileText className="w-4 h-4" />
            TXT
          </button>
          <button
            onClick={() => {
              const exportData: ExportableEvalData = {
                model: state.model,
                provider: state.provider,
                benchmark,
                score: state.score,
                totalQuestions: state.totalQuestions,
                correctCount: state.results.length > 0
                  ? state.results.filter(r => r.correct).length
                  : (state.correctCount ?? 0),
                avgLatency: state.avgLatency,
                results: state.results,
                timestamp: new Date().toISOString(),
              };
              exportResults(exportData, "md");
            }}
            className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-1.5"
            title="Export as Markdown"
          >
            <FileDown className="w-4 h-4" />
            MD
          </button>
        </div>
      )}

      {/* Results List */}
      {state.results.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {state.results.map((result, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                result.correct
                  ? "bg-[var(--signal-green-dim)] border-[var(--signal-green)]"
                  : "bg-[var(--signal-red-dim)] border-[var(--signal-red)]"
              }`}
            >
              {result.correct ? (
                <CheckCircle className="w-5 h-5 text-[var(--signal-green)] flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-[var(--signal-red)] flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--text-primary)] truncate">
                  {result.question}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  Expected: {result.expected} | Got: {result.predicted} |{" "}
                  {result.latencyMs}ms
                </div>
              </div>
              <div className="text-xs text-[var(--text-muted)] bg-[var(--surface)] px-2 py-1 rounded">
                {result.subject}
              </div>
            </div>
          ))}

          {state.status === "running" && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
              <Loader2 className="w-5 h-5 text-[var(--signal-blue)] animate-spin flex-shrink-0" />
              <div className="text-sm text-[var(--text-secondary)]">
                Evaluating next question...
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {state.status === "error" && (
        <div className="p-4 rounded-lg bg-[var(--signal-red-dim)] border border-[var(--signal-red)]">
          <div className="text-sm text-[var(--signal-red)]">
            Error: {state.error}
          </div>
        </div>
      )}
    </div>
  );
}
