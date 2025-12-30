"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Trophy,
  Clock,
  Target,
  ChevronDown,
  ChevronUp,
  Download,
  Share2,
  BarChart3,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  Trash2,
  Loader2,
} from "lucide-react";

// API calls now routed through Next.js API route at /api/eval/stream

interface BenchmarkResult {
  model: string;
  provider?: string;
  score: number;
  correct: number;
  total: number;
  duration_seconds: number;
  status: string;
}

interface BenchmarkRun {
  id: string;
  benchmark: string;
  timestamp: string;
  config?: {
    samples: number;
    seed: number | null;
    epochs: number;
    comparisonMode: string;
    provider: string | null;
  };
  results: BenchmarkResult[];
  summary: {
    total_models: number;
    successful: number;
    best_score: number;
    best_model: string;
  };
}

// Load runs from localStorage
function loadRunsFromStorage(): BenchmarkRun[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem("benchmark_runs");
    return stored ? JSON.parse(stored) : [];
  } catch {
    console.error("Failed to load runs from localStorage");
    return [];
  }
}

// Save runs to localStorage
function saveRunsToStorage(runs: BenchmarkRun[]) {
  try {
    localStorage.setItem("benchmark_runs", JSON.stringify(runs));
  } catch (e) {
    console.error("Failed to save runs to localStorage:", e);
  }
}

// Delete a run from localStorage
function deleteRunFromStorage(runId: string) {
  const runs = loadRunsFromStorage();
  const filtered = runs.filter(r => r.id !== runId);
  saveRunsToStorage(filtered);
  return filtered;
}

// Update a run in localStorage
function updateRunInStorage(updatedRun: BenchmarkRun) {
  const runs = loadRunsFromStorage();
  const index = runs.findIndex(r => r.id === updatedRun.id);
  if (index >= 0) {
    runs[index] = updatedRun;
    saveRunsToStorage(runs);
  }
  return runs;
}

// Loading fallback for Suspense
function ResultsLoading() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-[var(--signal-blue)] animate-spin mx-auto mb-4" />
        <p className="text-[var(--text-muted)]">Loading results...</p>
      </div>
    </div>
  );
}

// Main export wrapped in Suspense for useSearchParams
export default function ResultsPage() {
  return (
    <Suspense fallback={<ResultsLoading />}>
      <ResultsPageContent />
    </Suspense>
  );
}

function ResultsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedRunId = searchParams.get("run");

  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<BenchmarkRun | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load runs from localStorage on mount
  useEffect(() => {
    const storedRuns = loadRunsFromStorage();
    setRuns(storedRuns);

    // Select run from URL parameter or first run
    if (selectedRunId) {
      const run = storedRuns.find(r => r.id === selectedRunId);
      if (run) {
        setSelectedRun(run);
        setExpandedRun(run.id);
      }
    } else if (storedRuns.length > 0) {
      setSelectedRun(storedRuns[0]);
      setExpandedRun(storedRuns[0].id);
    }

    setIsLoading(false);
  }, [selectedRunId]);

  const handleSelectRun = (run: BenchmarkRun) => {
    setSelectedRun(run);
    router.push(`/benchmarks/results?run=${run.id}`, { scroll: false });
  };

  const handleDeleteRun = (runId: string) => {
    const confirmed = window.confirm("Are you sure you want to delete this run?");
    if (!confirmed) return;

    const updatedRuns = deleteRunFromStorage(runId);
    setRuns(updatedRuns);

    if (selectedRun?.id === runId) {
      const newSelected = updatedRuns.length > 0 ? updatedRuns[0] : null;
      setSelectedRun(newSelected);
      if (newSelected) {
        router.push(`/benchmarks/results?run=${newSelected.id}`, { scroll: false });
      } else {
        router.push("/benchmarks/results", { scroll: false });
      }
    }
  };

  const handleExport = () => {
    if (!selectedRun) return;

    const exportData = {
      ...selectedRun,
      exportedAt: new Date().toISOString(),
      source: "OpenRouter Benchmark Service",
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedRun.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (!selectedRun) return;

    const headers = ["Rank", "Model", "Provider", "Score", "Correct", "Total", "Duration (s)", "Status"];
    const sortedResults = [...selectedRun.results].sort((a, b) => b.score - a.score);
    const rows = sortedResults.map((r, i) => [
      i + 1,
      r.model,
      r.provider || "openrouter",
      (r.score * 100).toFixed(1) + "%",
      r.correct,
      r.total,
      r.duration_seconds.toFixed(1),
      r.status,
    ]);

    const csvContent = [
      `# Benchmark: ${selectedRun.benchmark}`,
      `# Date: ${selectedRun.timestamp}`,
      `# Winner: ${selectedRun.summary.best_model} (${(selectedRun.summary.best_score * 100).toFixed(1)}%)`,
      "",
      headers.join(","),
      ...rows.map(row => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedRun.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (!selectedRun) return;

    const sortedResults = [...selectedRun.results].sort((a, b) => b.score - a.score);
    const medals = ["🥇", "🥈", "🥉"];

    const shareText = [
      `📊 ${selectedRun.benchmark.toUpperCase()} Benchmark Results`,
      ``,
      ...sortedResults.slice(0, 5).map((r, i) =>
        `${medals[i] || `${i+1}.`} ${r.model.split("/")[1]}: ${(r.score * 100).toFixed(1)}%`
      ),
      ``,
      `⏱️ ${new Date(selectedRun.timestamp).toLocaleDateString()}`,
      `🔗 Powered by OpenRouter Benchmark Service`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(shareText);
      setShareMessage("Copied to clipboard!");
      setTimeout(() => setShareMessage(null), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = shareText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setShareMessage("Copied to clipboard!");
      setTimeout(() => setShareMessage(null), 2000);
    }
  };

  const handleRetryComplete = (updatedRun: BenchmarkRun) => {
    const updatedRuns = updateRunInStorage(updatedRun);
    setRuns(updatedRuns);
    setSelectedRun(updatedRun);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-[var(--text-muted)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/benchmarks")}
                className="p-2 hover:bg-[var(--surface-elevated)] rounded-lg transition-colors"
                aria-label="Back to benchmarks"
              >
                <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                  Benchmark Results
                </h1>
                <p className="text-[var(--text-muted)] mt-1">
                  {runs.length} runs saved • View and compare results
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 relative">
              <div className="relative group">
                <button
                  onClick={handleExport}
                  disabled={!selectedRun}
                  className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                  aria-label="Export results"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
                {/* Export dropdown */}
                <div className="absolute right-0 mt-1 w-32 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                  <button
                    onClick={handleExport}
                    className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] rounded-t-lg"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] rounded-b-lg"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
              <button
                onClick={handleShare}
                disabled={!selectedRun}
                className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                aria-label="Share results"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
              {shareMessage && (
                <div className="absolute -bottom-8 right-0 px-3 py-1 bg-[var(--signal-green)] text-white text-xs rounded-lg">
                  {shareMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {runs.length === 0 ? (
          <div className="card p-12 text-center">
            <BarChart3 className="w-16 h-16 mx-auto text-[var(--text-muted)] mb-4" />
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              No Results Yet
            </h2>
            <p className="text-[var(--text-muted)] mb-6">
              Run a benchmark to see results here. Results are automatically saved.
            </p>
            <button
              onClick={() => router.push("/benchmarks")}
              className="px-4 py-2 rounded-lg bg-[var(--signal-blue)] text-white hover:opacity-90 transition-colors"
            >
              Browse Benchmarks
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-8">
            {/* Sidebar - Run List */}
            <div className="col-span-4">
              <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
                Recent Runs ({runs.length})
              </h2>
              <div className="space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto">
                {runs.map((run) => (
                  <RunCard
                    key={run.id}
                    run={run}
                    isSelected={selectedRun?.id === run.id}
                    isExpanded={expandedRun === run.id}
                    onSelect={() => handleSelectRun(run)}
                    onToggle={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                    onDelete={() => handleDeleteRun(run.id)}
                  />
                ))}
              </div>
            </div>

            {/* Main Content - Detailed Results */}
            <div className="col-span-8">
              {selectedRun ? (
                <DetailedResults
                  run={selectedRun}
                  onRetryComplete={handleRetryComplete}
                />
              ) : (
                <div className="card p-8 text-center">
                  <BarChart3 className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
                  <p className="text-[var(--text-muted)]">Select a run to view results</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function RunCard({
  run,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
  onDelete,
}: {
  run: BenchmarkRun;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const date = new Date(run.timestamp);
  const sortedResults = [...run.results].sort((a, b) => b.score - a.score);

  return (
    <div
      className={`card p-4 cursor-pointer transition-all ${
        isSelected ? "border-[var(--signal-blue)] bg-[var(--surface-elevated)]" : ""
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--text-primary)] uppercase">
              {run.benchmark}
            </span>
            {run.summary.successful === run.summary.total_models ? (
              <span className="text-xs px-2 py-0.5 rounded bg-[var(--signal-green-dim)] text-[var(--signal-green)]">
                {run.summary.successful}/{run.summary.total_models} complete
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded bg-[var(--signal-red-dim)] text-[var(--signal-red)] flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {run.summary.total_models - run.summary.successful} failed
              </span>
            )}
          </div>
          <div className="text-sm text-[var(--text-muted)] mt-1">
            {date.toLocaleDateString()} at {date.toLocaleTimeString()}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 hover:bg-[var(--signal-red-dim)] rounded text-[var(--text-muted)] hover:text-[var(--signal-red)]"
            aria-label="Delete run"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="p-1 hover:bg-[var(--surface-elevated)] rounded"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
            )}
          </button>
        </div>
      </div>

      {/* Winner Banner */}
      {run.summary.best_model && (
        <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-[var(--signal-amber-dim)]">
          <Trophy className="w-4 h-4 text-[var(--signal-amber)]" />
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
            {run.summary.best_model.split("/").pop()}
          </span>
          <span className="text-sm text-[var(--signal-green)] ml-auto">
            {(run.summary.best_score * 100).toFixed(1)}%
          </span>
        </div>
      )}

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
          {sortedResults.slice(0, 3).map((result, idx) => (
            <div key={result.model} className="flex items-center gap-2 text-sm">
              <span className="w-4 text-center">
                {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
              </span>
              <span className="flex-1 text-[var(--text-secondary)] truncate">
                {result.model.split("/").pop()}
              </span>
              <span className="text-[var(--text-primary)] font-mono">
                {(result.score * 100).toFixed(1)}%
              </span>
            </div>
          ))}
          {run.results.length > 3 && (
            <div className="text-xs text-[var(--text-muted)] text-center">
              +{run.results.length - 3} more models
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailedResults({
  run,
  onRetryComplete,
}: {
  run: BenchmarkRun;
  onRetryComplete: (updatedRun: BenchmarkRun) => void;
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryProgress, setRetryProgress] = useState<{
    model: string;
    provider: string;
    current: number;
    total: number;
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const sortedResults = [...run.results].sort((a, b) => b.score - a.score);
  const maxScore = Math.max(...run.results.filter(r => r.status === "complete").map((r) => r.score), 0);
  const failedModels = run.results.filter(r => r.status !== "complete");
  const hasFailures = failedModels.length > 0;

  const retryModel = useCallback(async (
    model: string,
    provider: string,
    benchmark: string,
    samples: number,
    signal: AbortSignal
  ): Promise<BenchmarkResult> => {
    const startTime = Date.now();

    try {
      const params = new URLSearchParams({
        model,
        benchmark,
        limit: samples.toString(),
        provider,
      });

      const response = await fetch(`/api/eval/stream?${params}`, { signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let finalScore = 0;
      let correct = 0;

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
                const event = JSON.parse(line.slice(6));
                if (event.type === "progress" || event.type === "result") {
                  setRetryProgress(prev => prev ? {
                    ...prev,
                    current: event.data?.currentQuestion || event.data?.questionIndex + 1 || prev.current,
                  } : null);
                } else if (event.type === "complete") {
                  finalScore = event.data?.score || 0;
                  correct = event.data?.correct || Math.round(finalScore * samples);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const duration = (Date.now() - startTime) / 1000;
      return {
        model,
        provider,
        score: finalScore,
        correct,
        total: samples,
        duration_seconds: duration,
        status: "complete",
      };
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      const duration = (Date.now() - startTime) / 1000;
      return {
        model,
        provider: provider,
        score: 0,
        correct: 0,
        total: samples,
        duration_seconds: duration,
        status: "error",
      };
    }
  }, []);

  const handleRetry = async () => {
    if (failedModels.length === 0) return;

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsRetrying(true);
    const samples = run.config?.samples || run.results[0]?.total || 10;
    const updatedResults = [...run.results];

    for (const failedModel of failedModels) {
      if (signal.aborted) break;

      const provider = failedModel.provider || run.config?.provider || "openrouter";
      setRetryProgress({
        model: failedModel.model,
        provider,
        current: 0,
        total: samples,
      });

      try {
        const result = await retryModel(
          failedModel.model,
          provider,
          run.benchmark,
          samples,
          signal
        );

        // Update the result in the array
        const index = updatedResults.findIndex(r => r.model === failedModel.model);
        if (index >= 0) {
          updatedResults[index] = result;
        }
      } catch (error) {
        if (signal.aborted) break;
        console.error(`Retry failed for ${failedModel.model}:`, error);
      }
    }

    // Calculate new summary
    const successfulResults = updatedResults.filter(r => r.status === "complete");
    const bestResult = successfulResults.sort((a, b) => b.score - a.score)[0];

    const updatedRun: BenchmarkRun = {
      ...run,
      results: updatedResults,
      summary: {
        total_models: updatedResults.length,
        successful: successfulResults.length,
        best_score: bestResult?.score || 0,
        best_model: bestResult?.model || "",
      },
    };

    onRetryComplete(updatedRun);
    setIsRetrying(false);
    setRetryProgress(null);
    abortControllerRef.current = null;
  };

  const handleCancelRetry = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRetrying(false);
    setRetryProgress(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] uppercase">
              {run.benchmark}
            </h2>
            <p className="text-[var(--text-muted)] mt-1">
              {new Date(run.timestamp).toLocaleString()}
            </p>
            {run.config && (
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {run.config.samples} samples
                {run.config.epochs > 1 && ` × ${run.config.epochs} epochs`}
                {run.config.seed && ` • seed: ${run.config.seed}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            {hasFailures && (
              <button
                onClick={isRetrying ? handleCancelRetry : handleRetry}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  isRetrying
                    ? "bg-[var(--signal-red)] text-white hover:opacity-90"
                    : "bg-[var(--signal-amber)] text-black hover:opacity-90"
                }`}
              >
                {isRetrying ? (
                  <>
                    <XCircle className="w-4 h-4" />
                    Cancel
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Retry {failedModels.length} Failed
                  </>
                )}
              </button>
            )}
            <div className="text-right">
              <div className="text-3xl font-bold text-[var(--signal-green)]">
                {(run.summary.best_score * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-[var(--text-muted)]">Best Score</div>
            </div>
          </div>
        </div>

        {/* Retry Progress */}
        {isRetrying && retryProgress && (
          <div className="mb-6 p-4 rounded-lg bg-[var(--signal-amber-dim)] border border-[var(--signal-amber)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Retrying: {retryProgress.model.split("/").pop()}
              </span>
              <span className="text-sm text-[var(--text-muted)]">
                {retryProgress.current}/{retryProgress.total}
              </span>
            </div>
            <div className="h-2 bg-[var(--surface)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--signal-amber)] transition-all"
                style={{ width: `${(retryProgress.current / retryProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-5 gap-4">
          <div className="p-3 rounded-lg bg-[var(--surface-elevated)]">
            <div className="flex items-center gap-2 text-[var(--text-muted)] mb-1">
              <Target className="w-4 h-4" />
              <span className="text-xs uppercase">Models</span>
            </div>
            <div className="text-xl font-bold text-[var(--text-primary)]">
              {run.summary.total_models}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--surface-elevated)]">
            <div className="flex items-center gap-2 text-[var(--text-muted)] mb-1">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs uppercase">Successful</span>
            </div>
            <div className="text-xl font-bold text-[var(--signal-green)]">
              {run.summary.successful}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--surface-elevated)]">
            <div className="flex items-center gap-2 text-[var(--text-muted)] mb-1">
              <XCircle className="w-4 h-4" />
              <span className="text-xs uppercase">Failed</span>
            </div>
            <div className={`text-xl font-bold ${failedModels.length > 0 ? "text-[var(--signal-red)]" : "text-[var(--text-muted)]"}`}>
              {failedModels.length}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--surface-elevated)]">
            <div className="flex items-center gap-2 text-[var(--text-muted)] mb-1">
              <Trophy className="w-4 h-4" />
              <span className="text-xs uppercase">Winner</span>
            </div>
            <div className="text-sm font-bold text-[var(--signal-amber)] truncate">
              {run.summary.best_model.split("/").pop() || "N/A"}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--surface-elevated)]">
            <div className="flex items-center gap-2 text-[var(--text-muted)] mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs uppercase">Total Time</span>
            </div>
            <div className="text-xl font-bold text-[var(--text-primary)]">
              {Math.round(run.results.reduce((acc, r) => acc + r.duration_seconds, 0))}s
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
          Leaderboard
        </h3>
        <div className="space-y-3">
          {sortedResults.map((result, idx) => (
            <LeaderboardRow
              key={`${result.model}-${result.provider}`}
              result={result}
              rank={idx + 1}
              maxScore={maxScore}
            />
          ))}
        </div>
      </div>

      {/* Visual Comparison */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
          Score Comparison
        </h3>
        <div className="space-y-4">
          {sortedResults.map((result, idx) => (
            <div key={`${result.model}-${result.provider}-chart`} className="flex items-center gap-4">
              <div className="w-8 text-center">
                {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`}
              </div>
              <div className="w-48 text-sm text-[var(--text-secondary)] truncate">
                {result.model.split("/").pop()}
              </div>
              <div className="flex-1">
                <div className="h-6 bg-[var(--surface-elevated)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      result.status !== "complete"
                        ? "bg-[var(--signal-red)]"
                        : idx === 0
                        ? "bg-[var(--signal-amber)]"
                        : idx === 1
                        ? "bg-[var(--signal-blue)]"
                        : "bg-[var(--signal-green)]"
                    }`}
                    style={{ width: result.status === "complete" ? `${(result.score / Math.max(maxScore, 0.01)) * 100}%` : "100%" }}
                  />
                </div>
              </div>
              <div className="w-20 text-right font-mono text-[var(--text-primary)]">
                {result.status === "complete"
                  ? `${(result.score * 100).toFixed(1)}%`
                  : result.status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LeaderboardRow({
  result,
  rank,
  maxScore,
}: {
  result: BenchmarkResult;
  rank: number;
  maxScore: number;
}) {
  const getMedal = (rank: number) => {
    if (rank === 1) return <span className="text-2xl">🥇</span>;
    if (rank === 2) return <span className="text-2xl">🥈</span>;
    if (rank === 3) return <span className="text-2xl">🥉</span>;
    return <span className="text-lg text-[var(--text-muted)]">{rank}</span>;
  };

  const scoreColor =
    result.status !== "complete"
      ? "text-[var(--signal-red)]"
      : result.score >= 0.9
      ? "text-[var(--signal-green)]"
      : result.score >= 0.7
      ? "text-[var(--signal-blue)]"
      : result.score >= 0.5
      ? "text-[var(--signal-amber)]"
      : "text-[var(--signal-red)]";

  return (
    <div
      className="flex items-center gap-4 p-3 rounded-lg hover:bg-[var(--surface-elevated)] transition-colors"
      role="listitem"
    >
      <div className="w-10 text-center">{getMedal(rank)}</div>
      <div className="flex-1">
        <div className="font-medium text-[var(--text-primary)]">
          {result.model}
        </div>
        <div className="text-sm text-[var(--text-muted)]">
          {result.status === "complete"
            ? `${result.correct}/${result.total} correct • ${result.duration_seconds.toFixed(1)}s`
            : `Status: ${result.status}`}
          {result.provider && result.provider !== "openrouter" && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-[var(--surface-elevated)]">
              via {result.provider}
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className={`text-2xl font-bold ${scoreColor}`}>
          {result.status === "complete"
            ? `${(result.score * 100).toFixed(1)}%`
            : result.status}
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          {result.status === "complete" ? (
            <span className="flex items-center gap-1 text-[var(--signal-green)]">
              <CheckCircle className="w-3 h-3" /> Complete
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[var(--signal-red)]">
              <XCircle className="w-3 h-3" /> {result.status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
