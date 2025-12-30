"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Grid3X3,
  Play,
  Download,
  AlertTriangle,
  Trophy,
  Info,
  Sparkles,
  Loader2,
  StopCircle,
  Search,
  X,
  Settings2,
  Link2,
  FileSpreadsheet,
  FileText,
  FileDown,
  FileJson,
} from "lucide-react";
import { availableBenchmarks, getBenchmarkDependency } from "@/lib/benchmark-config";
import { useModels } from "@/hooks/useModels";
import { useProviders, Provider } from "@/hooks/useProviders";
import { useBenchmarks } from "@/hooks/useBenchmarks";
import { generateRequestId } from "@/lib/fetch-utils";

// Cache for model-to-provider mappings
interface ModelProviderMapping {
  modelId: string;
  providers: Provider[];
  fetchedAt: number;
}

interface MatrixResult {
  model: string;
  provider: string;
  benchmark: string;
  score: number | null;
  latencyMs: number;
  error?: string;
}

interface EvalProgress {
  model: string;
  provider: string;
  benchmark: string;
  status: "pending" | "running" | "complete" | "error";
  score?: number | null;
  error?: string;
  currentQuestion?: number;
  totalQuestions?: number;
}

export default function MatrixPage() {
  // Search and filter state
  const [modelSearch, setModelSearch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("");

  const {
    models: allModels,
    categories: vendorCategories,
    loading: modelsLoading,
    total: totalModels,
  } = useModels({
    search: modelSearch,
    provider: selectedVendor || undefined,
    limit: 500,
  });
  const { providers: allProviders, loading: providersLoading } = useProviders();
  const { benchmarks: allBenchmarks, categories: benchmarkCategories } = useBenchmarks();

  const [isRunning, setIsRunning] = useState(false);

  // Selection state - store selected IDs (declared early for use in effects below)
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [selectedProviderNames, setSelectedProviderNames] = useState<Set<string>>(new Set());
  const [selectedBenchmarkIds, setSelectedBenchmarkIds] = useState<Set<string>>(new Set(["mmlu"]));
  const [sampleSize, setSampleSize] = useState(10);

  // Model-provider mapping state for filtering providers based on selected models
  const [modelProviderMap, setModelProviderMap] = useState<Map<string, Provider[]>>(new Map());
  const [loadingProviders, setLoadingProviders] = useState<Set<string>>(new Set());
  const fetchCacheRef = useRef<Map<string, ModelProviderMapping>>(new Map());

  // Fetch providers for a specific model
  const fetchProvidersForModel = useCallback(async (modelId: string) => {
    // Check cache (5 minute TTL)
    const cached = fetchCacheRef.current.get(modelId);
    if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
      return cached.providers;
    }

    try {
      const response = await fetch(`/api/providers?model=${encodeURIComponent(modelId)}`);
      if (!response.ok) return [];
      const data = await response.json();
      const providers = data.providers || [];

      // Cache the result
      fetchCacheRef.current.set(modelId, {
        modelId,
        providers,
        fetchedAt: Date.now(),
      });

      return providers;
    } catch {
      return [];
    }
  }, []);

  // Fetch providers when models are selected
  useEffect(() => {
    const fetchAllSelectedModelProviders = async () => {
      const modelsToFetch = Array.from(selectedModelIds).filter(
        id => !modelProviderMap.has(id) && !loadingProviders.has(id)
      );

      if (modelsToFetch.length === 0) return;

      setLoadingProviders(prev => new Set([...prev, ...modelsToFetch]));

      const results = await Promise.all(
        modelsToFetch.map(async (modelId) => {
          const providers = await fetchProvidersForModel(modelId);
          return { modelId, providers };
        })
      );

      setModelProviderMap(prev => {
        const next = new Map(prev);
        results.forEach(({ modelId, providers }) => {
          next.set(modelId, providers);
        });
        return next;
      });

      setLoadingProviders(prev => {
        const next = new Set(prev);
        modelsToFetch.forEach(id => next.delete(id));
        return next;
      });
    };

    if (selectedModelIds.size > 0) {
      fetchAllSelectedModelProviders();
    }
  }, [selectedModelIds, modelProviderMap, loadingProviders, fetchProvidersForModel]);


  // Get available providers based on selected models
  const availableProviders = useMemo(() => {
    if (selectedModelIds.size === 0) {
      // No models selected - show all providers
      return allProviders;
    }

    // Collect providers that serve ALL selected models (intersection)
    const providerSets: Set<string>[] = [];
    selectedModelIds.forEach(modelId => {
      const providers = modelProviderMap.get(modelId);
      if (providers) {
        providerSets.push(new Set(providers.map(p => p.tag)));
      }
    });

    if (providerSets.length === 0) return [];

    // Find intersection of all provider sets
    const intersection = providerSets.reduce((acc, set) => {
      return new Set([...acc].filter(x => set.has(x)));
    });

    // Get full provider objects
    const providerMap = new Map<string, Provider>();
    selectedModelIds.forEach(modelId => {
      const providers = modelProviderMap.get(modelId);
      providers?.forEach(p => {
        if (intersection.has(p.tag) && !providerMap.has(p.tag)) {
          providerMap.set(p.tag, p);
        }
      });
    });

    return Array.from(providerMap.values());
  }, [selectedModelIds, modelProviderMap, allProviders]);

  // Get available models based on selected providers
  // Uses vendor prefix matching: provider "openai" matches models "openai/*"
  const availableModels = useMemo(() => {
    if (selectedProviderNames.size === 0) {
      // No providers selected - show all models
      return allModels;
    }

    // Build a set of vendor prefixes from selected provider tags
    // Provider tags like "openai", "anthropic", "google-ai-studio" should match model IDs
    // that start with those prefixes (e.g., "openai/gpt-4o", "anthropic/claude-3")
    const selectedVendorPrefixes = new Set<string>();
    selectedProviderNames.forEach(providerTag => {
      // The provider tag is typically the vendor name or a variation
      // e.g., "openai", "anthropic", "google-ai-studio", "azure", "together"
      selectedVendorPrefixes.add(providerTag.toLowerCase());
    });

    // Filter models whose vendor (first part of ID) matches any selected provider
    const filtered = allModels.filter(model => {
      const vendor = model.id.split('/')[0].toLowerCase();
      // Check if vendor matches any selected provider prefix
      return selectedVendorPrefixes.has(vendor);
    });

    // If no exact matches, try partial matching (e.g., "google" matches "google-ai-studio")
    if (filtered.length === 0) {
      const partialFiltered = allModels.filter(model => {
        const vendor = model.id.split('/')[0].toLowerCase();
        return Array.from(selectedVendorPrefixes).some(
          prefix => vendor.includes(prefix) || prefix.includes(vendor)
        );
      });
      return partialFiltered.length > 0 ? partialFiltered : allModels;
    }

    return filtered;
  }, [selectedProviderNames, allModels]);

  // Use filtered lists
  const models = availableModels;
  const providers = availableProviders;
  const [showPrices, setShowPrices] = useState(true);
  const [highlightBest, setHighlightBest] = useState(true);
  const [matrixResults, setMatrixResults] = useState<MatrixResult[]>([]);
  const [evalProgress, setEvalProgress] = useState<EvalProgress[]>([]);
  const [hasRunEval, setHasRunEval] = useState(false);

  // AbortController for canceling streaming requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Get unique provider tags (API uses tags, not display names)
  const uniqueProviderTags = useMemo(() => {
    const tags = new Set<string>();
    providers.forEach((p) => tags.add(p.tag));
    return Array.from(tags).sort();
  }, [providers]);

  // Map tags to display names for UI
  const providerDisplayNames = useMemo(() => {
    const map: Record<string, string> = {};
    providers.forEach((p) => {
      map[p.tag] = p.name;
    });
    return map;
  }, [providers]);

  // Get selected items as arrays
  const selectedModels = useMemo(
    () => models.filter((m) => selectedModelIds.has(m.id)),
    [models, selectedModelIds]
  );

  const selectedProviders = useMemo(
    () => Array.from(selectedProviderNames),
    [selectedProviderNames]
  );

  const selectedBenchmarks = useMemo(
    () => availableBenchmarks.filter((b) => selectedBenchmarkIds.has(b.id)),
    [selectedBenchmarkIds]
  );

  // Toggle selection helpers
  const toggleModel = (id: string) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleProvider = (name: string) => {
    setSelectedProviderNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const toggleBenchmark = (id: string) => {
    setSelectedBenchmarkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Build matrix data from results
  const matrixData = useMemo(() => {
    const data: Record<string, Record<string, Record<string, number | null>>> = {};

    selectedModels.forEach((model) => {
      data[model.id] = {};
      selectedProviders.forEach((provider) => {
        data[model.id][provider] = {};
        selectedBenchmarks.forEach((benchmark) => {
          const result = matrixResults.find(
            (r) => r.model === model.id && r.provider === provider && r.benchmark === benchmark.id
          );
          data[model.id][provider][benchmark.id] = result?.score ?? null;
        });
      });
    });

    return {
      models: selectedModels,
      providers: selectedProviders,
      benchmarks: selectedBenchmarks,
      data,
    };
  }, [selectedModels, selectedProviders, selectedBenchmarks, matrixResults]);

  // Find best combination
  const bestCombo = useMemo(() => {
    let best = { model: "", provider: "", score: 0 };

    if (!hasRunEval || matrixResults.length === 0) {
      return best;
    }

    Object.entries(matrixData.data).forEach(([model, providers]) => {
      Object.entries(providers).forEach(([provider, benchmarks]) => {
        const scores = Object.values(benchmarks).filter((v): v is number => v !== null);
        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        if (avgScore > best.score) {
          best = { model, provider, score: avgScore };
        }
      });
    });
    return best;
  }, [matrixData, hasRunEval, matrixResults]);

  // Cancel running evaluation
  const cancelEval = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
    setEvalProgress((prev) =>
      prev.map((p) =>
        p.status === "running" || p.status === "pending"
          ? { ...p, status: "error" as const, error: "Canceled" }
          : p
      )
    );
  };

  // Run matrix evaluation
  const runMatrixEval = async () => {
    if (selectedModels.length === 0 || selectedProviders.length === 0 || selectedBenchmarks.length === 0) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsRunning(true);
    setHasRunEval(true);
    setMatrixResults([]);

    const initialProgress: EvalProgress[] = [];
    selectedModels.forEach((model) => {
      selectedProviders.forEach((provider) => {
        selectedBenchmarks.forEach((benchmark) => {
          initialProgress.push({
            model: model.id,
            provider,
            benchmark: benchmark.id,
            status: "pending",
          });
        });
      });
    });
    setEvalProgress(initialProgress);

    const results: MatrixResult[] = [];

    for (const model of selectedModels) {
      if (signal.aborted) break;

      for (const provider of selectedProviders) {
        if (signal.aborted) break;

        for (const benchmark of selectedBenchmarks) {
          if (signal.aborted) break;

          setEvalProgress((prev) =>
            prev.map((p) =>
              p.model === model.id && p.provider === provider && p.benchmark === benchmark.id
                ? { ...p, status: "running" as const }
                : p
            )
          );

          try {
            const requestId = generateRequestId();
            const response = await fetch(
              `/api/eval/stream?model=${encodeURIComponent(model.id)}&provider=${encodeURIComponent(provider)}&benchmark=${encodeURIComponent(benchmark.id)}&limit=${sampleSize}`,
              {
                signal,
                headers: { "X-Request-ID": requestId },
              }
            );

            if (!response.ok) {
              throw new Error(`Eval failed: ${response.statusText}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let score: number | null = null;
            let latencyMs = 0;

            if (reader) {
              let buffer = "";
              try {
                while (true) {
                  if (signal.aborted) {
                    reader.cancel();
                    break;
                  }

                  const { done, value } = await reader.read();
                  if (done) break;

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");
                  buffer = lines.pop() || "";

                  for (const line of lines) {
                    if (line.startsWith("data: ")) {
                      try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === "progress" || data.type === "result") {
                          // Update progress with current question and running score
                          const currentQuestion = data.data?.currentQuestion || data.data?.questionIndex + 1 || 0;
                          const runningScore = data.data?.runningScore || data.data?.score || 0;
                          setEvalProgress((prev) =>
                            prev.map((p) =>
                              p.model === model.id && p.provider === provider && p.benchmark === benchmark.id
                                ? {
                                    ...p,
                                    status: "running" as const,
                                    currentQuestion,
                                    totalQuestions: sampleSize,
                                    score: runningScore * 100,
                                  }
                                : p
                            )
                          );
                        } else if (data.type === "complete") {
                          score = (data.data.score ?? 0) * 100;
                          latencyMs = data.data.avgLatencyMs || 0;
                        }
                      } catch {
                        // Skip invalid JSON
                      }
                    }
                  }
                }
              } finally {
                reader.releaseLock();
              }
            }

            if (signal.aborted) break;

            results.push({
              model: model.id,
              provider,
              benchmark: benchmark.id,
              score,
              latencyMs,
            });

            setMatrixResults([...results]);
            setEvalProgress((prev) =>
              prev.map((p) =>
                p.model === model.id && p.provider === provider && p.benchmark === benchmark.id
                  ? { ...p, status: "complete" as const, score }
                  : p
              )
            );
          } catch (error) {
            if ((error as Error).name === "AbortError") break;

            results.push({
              model: model.id,
              provider,
              benchmark: benchmark.id,
              score: null,
              latencyMs: 0,
              error: String(error),
            });

            setMatrixResults([...results]);
            setEvalProgress((prev) =>
              prev.map((p) =>
                p.model === model.id && p.provider === provider && p.benchmark === benchmark.id
                  ? { ...p, status: "error" as const, error: String(error) }
                  : p
              )
            );
          }
        }
      }
    }

    setIsRunning(false);
  };

  // Export functions
  const exportCSV = useCallback(() => {
    if (matrixResults.length === 0) return;

    const headers = ["Model", "Provider", "Benchmark", "Score (%)", "Latency (ms)", "Error"];
    const rows = matrixResults.map((r) => [
      r.model,
      r.provider,
      r.benchmark,
      r.score?.toFixed(1) ?? "",
      r.latencyMs.toFixed(0),
      r.error ?? "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matrix-eval-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [matrixResults]);

  const exportJSON = useCallback(() => {
    if (matrixResults.length === 0) return;

    const data = {
      timestamp: new Date().toISOString(),
      config: {
        models: Array.from(selectedModelIds),
        providers: Array.from(selectedProviderNames),
        benchmarks: Array.from(selectedBenchmarkIds),
        sampleSize,
      },
      results: matrixResults,
      summary: {
        totalEvaluations: matrixResults.length,
        successful: matrixResults.filter((r) => r.score !== null).length,
        failed: matrixResults.filter((r) => r.error).length,
        bestCombination: bestCombo,
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matrix-eval-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [matrixResults, selectedModelIds, selectedProviderNames, selectedBenchmarkIds, sampleSize, bestCombo]);

  const exportTXT = useCallback(() => {
    if (matrixResults.length === 0) return;

    const lines: string[] = [
      "=" .repeat(70),
      "MATRIX EVALUATION RESULTS",
      "=" .repeat(70),
      "",
      `Timestamp: ${new Date().toISOString()}`,
      `Sample Size: ${sampleSize}`,
      "",
      "-".repeat(70),
      "CONFIGURATION",
      "-".repeat(70),
      `Models: ${Array.from(selectedModelIds).join(", ")}`,
      `Providers: ${Array.from(selectedProviderNames).join(", ")}`,
      `Benchmarks: ${Array.from(selectedBenchmarkIds).join(", ")}`,
      "",
      "-".repeat(70),
      "RESULTS",
      "-".repeat(70),
      "",
    ];

    matrixResults.forEach((r) => {
      lines.push(`Model: ${r.model}`);
      lines.push(`  Provider: ${r.provider}`);
      lines.push(`  Benchmark: ${r.benchmark}`);
      lines.push(`  Score: ${r.score !== null ? `${r.score.toFixed(1)}%` : "N/A"}`);
      lines.push(`  Latency: ${r.latencyMs.toFixed(0)}ms`);
      if (r.error) lines.push(`  Error: ${r.error}`);
      lines.push("");
    });

    if (bestCombo.model) {
      lines.push("-".repeat(70));
      lines.push("BEST COMBINATION");
      lines.push("-".repeat(70));
      lines.push(`Model: ${bestCombo.model}`);
      lines.push(`Provider: ${bestCombo.provider}`);
      lines.push(`Average Score: ${(bestCombo.score * 100).toFixed(1)}%`);
    }

    lines.push("");
    lines.push("=" .repeat(70));
    lines.push("END OF REPORT");
    lines.push("=" .repeat(70));

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matrix-eval-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [matrixResults, selectedModelIds, selectedProviderNames, selectedBenchmarkIds, sampleSize, bestCombo]);

  const exportMarkdown = useCallback(() => {
    if (matrixResults.length === 0) return;

    const lines: string[] = [
      "# Matrix Evaluation Results",
      "",
      `**Timestamp:** ${new Date().toISOString()}`,
      `**Sample Size:** ${sampleSize}`,
      "",
      "## Configuration",
      "",
      `- **Models:** ${Array.from(selectedModelIds).join(", ")}`,
      `- **Providers:** ${Array.from(selectedProviderNames).join(", ")}`,
      `- **Benchmarks:** ${Array.from(selectedBenchmarkIds).join(", ")}`,
      "",
      "## Results",
      "",
      "| Model | Provider | Benchmark | Score | Latency |",
      "|-------|----------|-----------|-------|---------|",
    ];

    matrixResults.forEach((r) => {
      const score = r.score !== null ? `${r.score.toFixed(1)}%` : "N/A";
      const status = r.error ? `❌ ${r.error}` : "✓";
      lines.push(`| ${r.model} | ${r.provider} | ${r.benchmark} | ${score} | ${r.latencyMs.toFixed(0)}ms |`);
    });

    if (bestCombo.model) {
      lines.push("");
      lines.push("## Best Combination");
      lines.push("");
      lines.push(`| Metric | Value |`);
      lines.push(`|--------|-------|`);
      lines.push(`| Model | ${bestCombo.model} |`);
      lines.push(`| Provider | ${bestCombo.provider} |`);
      lines.push(`| Average Score | ${(bestCombo.score * 100).toFixed(1)}% |`);
    }

    lines.push("");
    lines.push("---");
    lines.push("*Generated by OpenRouter Eval Platform*");

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matrix-eval-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [matrixResults, selectedModelIds, selectedProviderNames, selectedBenchmarkIds, sampleSize, bestCombo]);

  // Calculate estimated cost
  const totalCalls = selectedModels.length * selectedProviders.length * selectedBenchmarks.length;
  const estimatedCost = useMemo(() => {
    const costPerCall = 0.01 * (sampleSize / 5);
    return {
      min: (totalCalls * costPerCall).toFixed(2),
      max: (totalCalls * costPerCall * 2).toFixed(2),
    };
  }, [totalCalls, sampleSize]);

  // Calculate monthly cost for best provider
  // Uses 70/30 input/output ratio (more realistic than 50/50)
  const [monthlyVolume, setMonthlyVolume] = useState(1_000_000);
  const calculateMonthlyCost = useCallback(
    (volume: number) => {
      if (!bestCombo.provider) return null;
      const provider = providers.find((p) => p.tag === bestCombo.provider);
      if (!provider?.pricing) return null;

      // 70% input, 30% output tokens (typical usage pattern)
      const inputVolume = volume * 0.7;
      const outputVolume = volume * 0.3;
      const inputCost = (inputVolume / 1_000_000) * (provider.pricing.input || 0);
      const outputCost = (outputVolume / 1_000_000) * (provider.pricing.output || 0);
      return (inputCost + outputCost).toFixed(2);
    },
    [bestCombo.provider, providers]
  );

  const isLoading = modelsLoading || providersLoading;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-in stagger-1">
        <div className="flex items-center gap-3 mb-2">
          <Grid3X3 className="w-8 h-8 text-[var(--signal-purple)]" />
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Matrix View</h1>
        </div>
        <p className="text-[var(--text-secondary)] text-lg">
          Comprehensive comparison: Models × Providers × Benchmarks
        </p>
      </div>

      {/* Warning Banner */}
      {totalCalls > 0 && (
        <div className="card p-4 border-[var(--signal-amber)] bg-[var(--signal-amber-dim)] animate-in stagger-2">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-[var(--signal-amber)]" />
            <div>
              <span className="font-medium text-[var(--text-primary)]">Expensive Operation</span>
              <span className="text-[var(--text-secondary)] ml-2">
                Running the matrix will make {totalCalls} API calls. Estimated cost: ${estimatedCost.min}-${estimatedCost.max}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Selection Controls */}
      <div className="card p-6 animate-in stagger-3">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Model Selection */}
          <div className="lg:col-span-2">
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
              Models ({selectedModelIds.size} selected)
              {selectedProviderNames.size > 0 && (
                <span className="ml-2 text-[var(--signal-blue)]">
                  <Link2 className="w-3 h-3 inline" /> filtered by providers
                </span>
              )}
            </label>

            {/* Search and Vendor Filter */}
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search models..."
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm"
                  disabled={isLoading || isRunning}
                />
              </div>
              <select
                className="select"
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                disabled={isLoading || isRunning}
              >
                <option value="">All vendors</option>
                {vendorCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.count})
                  </option>
                ))}
              </select>
            </div>

            {/* Model List */}
            <div className="border border-[var(--border)] rounded-lg max-h-48 overflow-y-auto bg-[var(--surface)]">
              {modelsLoading ? (
                <div className="p-4 text-center text-[var(--text-muted)]">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Loading models...
                </div>
              ) : models.length === 0 ? (
                <div className="p-4 text-center text-[var(--text-muted)]">
                  No models found
                </div>
              ) : (
                <>
                  <div className="sticky top-0 bg-[var(--surface-elevated)] border-b border-[var(--border)] px-3 py-2 flex justify-between items-center">
                    <span className="text-xs text-[var(--text-muted)]">{models.length} models</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs text-[var(--signal-blue)] hover:underline"
                        onClick={() => setSelectedModelIds(new Set(models.map((m) => m.id)))}
                        disabled={isRunning}
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        className="text-xs text-[var(--signal-blue)] hover:underline"
                        onClick={() => setSelectedModelIds(new Set())}
                        disabled={isRunning}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {models.map((model) => (
                    <label
                      key={model.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--surface-hover)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedModelIds.has(model.id)}
                        onChange={() => toggleModel(model.id)}
                        disabled={isRunning}
                        className="rounded border-[var(--border)]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[var(--text-primary)] truncate">
                          {model.name || model.id.split("/").pop()}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] truncate">{model.id}</div>
                      </div>
                    </label>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Provider Selection */}
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
              Providers ({selectedProviderNames.size} selected)
              {selectedModelIds.size > 0 && (
                <span className="ml-2 text-[var(--signal-blue)]">
                  <Link2 className="w-3 h-3 inline" /> filtered by models
                </span>
              )}
            </label>
            <div className="border border-[var(--border)] rounded-lg max-h-48 overflow-y-auto bg-[var(--surface)]">
              {providersLoading || loadingProviders.size > 0 ? (
                <div className="p-4 text-center text-[var(--text-muted)]">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Loading...
                </div>
              ) : uniqueProviderTags.length === 0 ? (
                <div className="p-4 text-center text-[var(--text-muted)]">
                  No providers found
                </div>
              ) : (
                <>
                  <div className="sticky top-0 bg-[var(--surface-elevated)] border-b border-[var(--border)] px-3 py-2 flex justify-between items-center">
                    <span className="text-xs text-[var(--text-muted)]">{uniqueProviderTags.length} providers</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs text-[var(--signal-blue)] hover:underline"
                        onClick={() => setSelectedProviderNames(new Set(uniqueProviderTags))}
                        disabled={isRunning}
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        className="text-xs text-[var(--signal-blue)] hover:underline"
                        onClick={() => setSelectedProviderNames(new Set())}
                        disabled={isRunning}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {uniqueProviderTags.map((tag) => {
                    const providerInfo = providers.find((p) => p.tag === tag);
                    return (
                      <label
                        key={tag}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--surface-hover)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedProviderNames.has(tag)}
                          onChange={() => toggleProvider(tag)}
                          disabled={isRunning}
                          className="rounded border-[var(--border)]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-[var(--text-primary)]">{providerDisplayNames[tag] || tag}</div>
                          {providerInfo?.pricing && (
                            <div className="text-xs text-[var(--signal-green)]">
                              ${providerInfo.pricing.input}/M input
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Benchmark Selection */}
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
              Benchmarks ({selectedBenchmarkIds.size} selected)
            </label>
            <div className="border border-[var(--border)] rounded-lg max-h-48 overflow-y-auto bg-[var(--surface)]">
              <div className="sticky top-0 bg-[var(--surface-elevated)] border-b border-[var(--border)] px-3 py-2 flex justify-between items-center">
                <span className="text-xs text-[var(--text-muted)]">{availableBenchmarks.length} benchmarks</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-[var(--signal-blue)] hover:underline"
                    onClick={() => setSelectedBenchmarkIds(new Set(availableBenchmarks.map((b) => b.id)))}
                    disabled={isRunning}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="text-xs text-[var(--signal-blue)] hover:underline"
                    onClick={() => setSelectedBenchmarkIds(new Set())}
                    disabled={isRunning}
                  >
                    Clear
                  </button>
                </div>
              </div>
              {benchmarkCategories.map((category) => (
                <div key={category.id}>
                  <div className="px-3 py-1.5 bg-[var(--surface)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)]">
                    {category.name}
                  </div>
                  {category.benchmarks.map((benchmark) => {
                    const dep = getBenchmarkDependency(benchmark.id);
                    return (
                      <label
                        key={benchmark.id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--surface-hover)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedBenchmarkIds.has(benchmark.id)}
                          onChange={() => toggleBenchmark(benchmark.id)}
                          disabled={isRunning}
                          className="rounded border-[var(--border)]"
                        />
                        <span className="text-sm text-[var(--text-primary)] flex items-center gap-1">
                          {benchmark.name}
                          {dep?.warning && (
                            <span title={dep.warning}>
                              <AlertTriangle className="w-3 h-3 text-[var(--signal-amber)]" />
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
            {/* Dependency warnings for selected benchmarks */}
            {(() => {
              const selectedWithDeps = Array.from(selectedBenchmarkIds)
                .map(id => ({ id, dep: getBenchmarkDependency(id) }))
                .filter(item => item.dep?.warning);

              if (selectedWithDeps.length === 0) return null;

              return (
                <div className="mt-2 p-2 rounded-md bg-[var(--signal-amber-dim)] border border-[var(--signal-amber)]">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--signal-amber)] mt-0.5 shrink-0" />
                    <div className="text-xs text-[var(--signal-amber)]">
                      <span className="font-medium">Dependencies required for {selectedWithDeps.length} benchmark(s):</span>
                      <ul className="mt-1 space-y-1">
                        {selectedWithDeps.map(({ id, dep }) => (
                          <li key={id}>
                            <span className="font-medium">{id}:</span> {dep!.warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Action Row */}
        <div className="flex items-center justify-between mt-6 pt-6 border-t border-[var(--border)]">
          <div className="flex items-center gap-4">
            {/* Sample Size */}
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1 block">
                Sample Size
              </label>
              <select
                className="select"
                value={sampleSize}
                onChange={(e) => setSampleSize(parseInt(e.target.value))}
                disabled={isRunning}
              >
                <option value={5}>Quick (5)</option>
                <option value={10}>Standard (10)</option>
                <option value={25}>Medium (25)</option>
                <option value={50}>Large (50)</option>
                <option value={100}>Extended (100)</option>
              </select>
            </div>

            {/* Options */}
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={showPrices}
                  onChange={(e) => setShowPrices(e.target.checked)}
                  className="rounded border-[var(--border)]"
                />
                Show Prices
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={highlightBest}
                  onChange={(e) => setHighlightBest(e.target.checked)}
                  className="rounded border-[var(--border)]"
                />
                Highlight Best
              </label>
            </div>
          </div>

          {/* Run/Cancel Button */}
          <div className="flex items-center gap-3">
            {selectedModelIds.size === 0 || selectedProviderNames.size === 0 || selectedBenchmarkIds.size === 0 ? (
              <span className="text-sm text-[var(--text-muted)]">
                Select at least 1 model, 1 provider, and 1 benchmark
              </span>
            ) : (
              <span className="text-sm text-[var(--text-muted)]">
                {totalCalls} evaluations
              </span>
            )}

            {isRunning ? (
              <button
                className="btn-secondary flex items-center gap-2 border-[var(--signal-red)] text-[var(--signal-red)] hover:bg-[var(--signal-red-dim)]"
                onClick={cancelEval}
              >
                <StopCircle className="w-4 h-4" />
                Cancel
              </button>
            ) : (
              <button
                className="btn-primary flex items-center gap-2"
                onClick={runMatrixEval}
                disabled={
                  isLoading ||
                  selectedModels.length === 0 ||
                  selectedProviders.length === 0 ||
                  selectedBenchmarks.length === 0
                }
              >
                <Play className="w-4 h-4" />
                Run Matrix
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="card p-12 text-center animate-in stagger-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[var(--signal-blue)]" />
          <p className="text-[var(--text-muted)]">Loading models and providers...</p>
        </div>
      )}

      {/* Matrix Grid */}
      {!isLoading && (
        <div className="grid grid-cols-4 gap-6">
          <div className="col-span-3 animate-in stagger-4">
            <div className="card overflow-hidden">
              {!hasRunEval ? (
                <div className="p-12 text-center">
                  <Grid3X3 className="w-12 h-12 mx-auto mb-4 text-[var(--text-muted)]" />
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                    Ready to Evaluate
                  </h3>
                  <p className="text-[var(--text-muted)] mb-4">
                    Select models, providers, and benchmarks above, then click &quot;Run Matrix&quot;
                  </p>
                  {selectedModels.length > 0 && selectedProviders.length > 0 && selectedBenchmarks.length > 0 && (
                    <div className="text-sm text-[var(--text-secondary)]">
                      Will evaluate {selectedModels.length} models × {selectedProviders.length} providers × {selectedBenchmarks.length} benchmarks = {totalCalls} evals
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[var(--surface-elevated)]">
                        <th className="p-4 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)] sticky left-0 bg-[var(--surface-elevated)] z-10">
                          Model / Benchmark
                        </th>
                        {matrixData.providers.map((provider) => (
                          <th
                            key={provider}
                            className="p-4 text-center text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)]"
                          >
                            <div>{providerDisplayNames[provider] || provider}</div>
                            {showPrices && (
                              <div className="text-[10px] font-normal text-[var(--signal-green)] mt-1">
                                {providers.find((p) => p.tag === provider)?.pricing
                                  ? `$${providers.find((p) => p.tag === provider)?.pricing?.input}/M`
                                  : "-"}
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixData.models.map((model) => (
                        <>
                          {/* Model Header Row */}
                          <tr key={`header-${model.id}`}>
                            <td
                              colSpan={matrixData.providers.length + 1}
                              className="px-4 py-3 bg-[var(--surface)] border-t-2 border-[var(--border)]"
                            >
                              <div className="font-semibold text-[var(--text-primary)]">
                                {model.name || model.id.split("/")[1] || model.id}
                              </div>
                              <div className="text-xs text-[var(--text-muted)]">{model.id}</div>
                            </td>
                          </tr>
                          {/* Benchmark Rows */}
                          {matrixData.benchmarks.map((benchmark) => (
                            <tr
                              key={`${model.id}-${benchmark.id}`}
                              className="hover:bg-[var(--surface-hover)] transition-colors"
                            >
                              <td className="px-4 py-3 pl-8 text-sm text-[var(--text-secondary)] border-b border-[var(--border)] sticky left-0 bg-[var(--surface)] z-10">
                                {benchmark.name}
                              </td>
                              {matrixData.providers.map((provider) => {
                                const score = matrixData.data[model.id]?.[provider]?.[benchmark.id];
                                const progress = evalProgress.find(
                                  (p) =>
                                    p.model === model.id &&
                                    p.provider === provider &&
                                    p.benchmark === benchmark.id
                                );
                                const isBest =
                                  highlightBest &&
                                  model.id === bestCombo.model &&
                                  provider === bestCombo.provider;

                                const allScores = matrixData.providers.map(
                                  (p) => matrixData.data[model.id]?.[p]?.[benchmark.id] ?? 0
                                );
                                const maxScore = Math.max(...allScores);
                                const isBestForBenchmark =
                                  score !== null && score === maxScore && maxScore > 0;

                                return (
                                  <td
                                    key={`${model.id}-${provider}-${benchmark.id}`}
                                    className={`px-4 py-3 text-center border-b border-[var(--border)] ${
                                      isBest ? "bg-[var(--signal-green-dim)]" : ""
                                    }`}
                                  >
                                    {progress?.status === "pending" ? (
                                      <span className="text-[var(--text-muted)] text-xs">—</span>
                                    ) : progress?.status === "running" ? (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <div className="flex items-center gap-1">
                                          <Loader2 className="w-3 h-3 animate-spin text-[var(--signal-blue)]" />
                                          <span className="text-xs text-[var(--text-muted)]">
                                            {progress.currentQuestion || 0}/{progress.totalQuestions || sampleSize}
                                          </span>
                                        </div>
                                        {progress.score !== undefined && progress.score !== null && (
                                          <span className="text-xs font-mono text-[var(--signal-blue)]">
                                            {progress.score.toFixed(0)}%
                                          </span>
                                        )}
                                      </div>
                                    ) : progress?.status === "error" ? (
                                      <span
                                        className="text-[var(--signal-red)] text-xs cursor-help"
                                        title={progress.error}
                                      >
                                        Error
                                      </span>
                                    ) : score !== null ? (
                                      <div
                                        className={`font-mono text-sm ${
                                          isBestForBenchmark
                                            ? "text-[var(--signal-green)] font-semibold"
                                            : score >= 85
                                            ? "text-[var(--signal-blue)]"
                                            : "text-[var(--text-secondary)]"
                                        }`}
                                      >
                                        {score.toFixed(1)}%
                                        {isBestForBenchmark && highlightBest && (
                                          <Trophy className="w-3 h-3 inline ml-1 text-[var(--signal-green)]" />
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-[var(--text-muted)]">-</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 animate-in stagger-5">
            {/* Best Combination */}
            <div className="card card-glow p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-[var(--signal-green)]" />
                <h3 className="font-semibold text-[var(--text-primary)]">Optimal Combination</h3>
              </div>

              {bestCombo.score > 0 ? (
                <>
                  <div className="text-center py-4 border-b border-[var(--border)] mb-4">
                    <div className="text-lg font-bold text-[var(--signal-green)] mb-1">
                      {models.find((m) => m.id === bestCombo.model)?.name ||
                        bestCombo.model.split("/")[1] ||
                        bestCombo.model}
                    </div>
                    <div className="text-sm text-[var(--text-muted)]">on</div>
                    <div className="text-lg font-semibold text-[var(--signal-blue)]">
                      {providerDisplayNames[bestCombo.provider] || bestCombo.provider}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-muted)]">Avg Score</span>
                      <span className="font-mono text-[var(--signal-green)]">
                        {bestCombo.score.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <p className="text-[var(--text-muted)] text-sm">
                    Run the matrix evaluation to find the optimal combination
                  </p>
                </div>
              )}
            </div>

            {/* Insights */}
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-5 h-5 text-[var(--signal-blue)]" />
                <h3 className="font-semibold text-[var(--text-primary)]">Insights</h3>
              </div>

              {hasRunEval && matrixResults.length > 0 ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--signal-green)] mt-1.5" />
                    <p className="text-[var(--text-secondary)]">
                      {matrixResults.filter((r) => r.score !== null).length} of {totalCalls}{" "}
                      evaluations completed successfully
                    </p>
                  </div>
                  {matrixResults.some((r) => r.error) && (
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--signal-amber)] mt-1.5" />
                      <p className="text-[var(--text-secondary)]">
                        {matrixResults.filter((r) => r.error).length} evaluations failed
                      </p>
                    </div>
                  )}
                  {bestCombo.score > 0 && (
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--signal-blue)] mt-1.5" />
                      <p className="text-[var(--text-secondary)]">
                        Best: {bestCombo.model.split("/")[1]} on {providerDisplayNames[bestCombo.provider] || bestCombo.provider}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[var(--text-muted)] text-sm">
                  Insights will appear after running the evaluation
                </p>
              )}
            </div>

            {/* Export */}
            <div className="card p-6">
              <h3 className="font-semibold text-[var(--text-primary)] mb-4">Export Results</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn-secondary flex items-center justify-center gap-2 py-2"
                  disabled={!hasRunEval || matrixResults.length === 0}
                  onClick={exportCSV}
                  title="Export as CSV spreadsheet"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  CSV
                </button>
                <button
                  className="btn-secondary flex items-center justify-center gap-2 py-2"
                  disabled={!hasRunEval || matrixResults.length === 0}
                  onClick={exportJSON}
                  title="Export as JSON"
                >
                  <FileJson className="w-4 h-4" />
                  JSON
                </button>
                <button
                  className="btn-secondary flex items-center justify-center gap-2 py-2"
                  disabled={!hasRunEval || matrixResults.length === 0}
                  onClick={exportTXT}
                  title="Export as plain text"
                >
                  <FileText className="w-4 h-4" />
                  TXT
                </button>
                <button
                  className="btn-secondary flex items-center justify-center gap-2 py-2"
                  disabled={!hasRunEval || matrixResults.length === 0}
                  onClick={exportMarkdown}
                  title="Export as Markdown"
                >
                  <FileDown className="w-4 h-4" />
                  MD
                </button>
              </div>
            </div>

            {/* Cost Calculator */}
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Settings2 className="w-5 h-5 text-[var(--signal-purple)]" />
                <h3 className="font-semibold text-[var(--text-primary)]">Cost Calculator</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                    Monthly Volume
                  </label>
                  <select
                    className="select w-full"
                    value={monthlyVolume}
                    onChange={(e) => setMonthlyVolume(parseInt(e.target.value))}
                  >
                    <option value={1_000_000}>1M tokens</option>
                    <option value={10_000_000}>10M tokens</option>
                    <option value={100_000_000}>100M tokens</option>
                    <option value={1_000_000_000}>1B tokens</option>
                  </select>
                </div>
                <div className="pt-3 border-t border-[var(--border)]">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Estimated Monthly Cost</span>
                    <span className="font-mono text-[var(--signal-green)]">
                      {bestCombo.provider && calculateMonthlyCost(monthlyVolume)
                        ? `$${calculateMonthlyCost(monthlyVolume)}`
                        : "-"}
                    </span>
                  </div>
                  {bestCombo.provider && (
                    <div className="text-xs text-[var(--text-muted)] mt-1">
                      Using {providerDisplayNames[bestCombo.provider] || bestCombo.provider} pricing
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
