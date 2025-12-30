"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Server,
  Play,
  Trophy,
  Activity,
  BarChart3,
  Info,
  X,
  Search,
  Loader2,
  Zap,
  FileSpreadsheet,
  FileText,
  FileDown,
  AlertTriangle,
} from "lucide-react";
import EvalProgress from "@/components/EvalProgress";
import MultiProviderEval from "@/components/MultiProviderEval";
import { useModels, Model } from "@/hooks/useModels";
import { useBenchmarks } from "@/hooks/useBenchmarks";
import { useProviders } from "@/hooks/useProviders";
import { saveEvalResult } from "@/lib/eval-storage";
import { exportResults, type ExportFormat, type ExportableEvalData } from "@/lib/export-utils";
import { getBenchmarkDependency } from "@/lib/benchmark-config";

type SortKey = "score" | "latency" | "price" | "uptime";

interface EvalResult {
  provider: string;
  providerTag: string;
  score: number | null;
  durationMs: number;
  samplesEvaluated: number;
  metadata?: {
    quantization?: string;
    uptime?: number; // From OpenRouter API, undefined if not available
    pricing?: { input: number; output: number };
  };
}

function ProvidersPageContent() {
  const searchParams = useSearchParams();

  // Initialize state from URL params
  const [selectedModel, setSelectedModel] = useState<string>(() => searchParams.get("model") || "");
  const [selectedBenchmark, setSelectedBenchmark] = useState(() => searchParams.get("benchmark") || "mmlu");
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [showLiveEval, setShowLiveEval] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | undefined>(undefined);
  const [modelSearch, setModelSearch] = useState("");
  const [sampleSize, setSampleSize] = useState(() => {
    const limit = searchParams.get("limit");
    return limit ? parseInt(limit, 10) : 10;
  });
  const [selectedHostingProviders, setSelectedHostingProviders] = useState<string[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<string>("");

  // Store eval results
  const [evalResults, setEvalResults] = useState<EvalResult[]>([]);
  const [hasRunEval, setHasRunEval] = useState(false);

  // Fetch models dynamically from OpenRouter
  const {
    models,
    categories: vendorCategories,
    loading: modelsLoading,
    total: totalModels
  } = useModels({
    search: modelSearch,
    provider: selectedVendor || undefined,
  });

  // Fetch real provider data
  const { providers: realProviders, loading: providersLoading } = useProviders({
    model: selectedModel || undefined,
  });

  // Fetch benchmarks
  const { benchmarks: allBenchmarks, categories: benchmarkCategories } = useBenchmarks();

  // Get the selected model object
  const selectedModelObj = useMemo(() =>
    models.find(m => m.id === selectedModel),
    [models, selectedModel]
  );

  // Show all benchmarks - don't filter based on model capabilities
  // Users should be able to run any benchmark on any model
  const availableBenchmarksForModel = allBenchmarks;

  // Set default model when models load
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel]);

  // Sort eval results based on selected criteria
  const sortedResults = useMemo(() => {
    console.log("[sortedResults] evalResults:", evalResults, "hasRunEval:", hasRunEval);
    return [...evalResults].sort((a, b) => {
      switch (sortBy) {
        case "score":
          return (b.score ?? 0) - (a.score ?? 0);
        case "latency":
          return a.durationMs - b.durationMs;
        case "price":
          return (a.metadata?.pricing?.input ?? 0) - (b.metadata?.pricing?.input ?? 0);
        case "uptime":
          return (b.metadata?.uptime ?? 0) - (a.metadata?.uptime ?? 0);
        default:
          return 0;
      }
    });
  }, [evalResults, sortBy, hasRunEval]);

  const bestProvider = sortedResults[0];

  // Handle eval completion
  const handleEvalComplete = (results: {
    model: string;
    provider: string;
    score: number;
    avgLatency: number;
    totalQuestions: number;
    results: Array<{ correct: boolean; latencyMs: number }>;
  }) => {
    console.log("[handleEvalComplete] Received results:", results);
    // Find the provider's real uptime from OpenRouter data
    const providerData = realProviders.find(p =>
      p.tag === results.provider || p.name === results.provider
    );

    const newResult: EvalResult = {
      provider: results.provider === "default" ? "OpenRouter (Auto)" : results.provider,
      providerTag: `${results.provider}/${selectedModel.split('/')[1]}`,
      score: results.score,
      durationMs: results.avgLatency * results.totalQuestions,
      samplesEvaluated: results.totalQuestions,
      metadata: {
        quantization: providerData?.quantization || "Auto",
        uptime: providerData?.uptime, // Real uptime from OpenRouter, undefined if not available
        pricing: providerData?.pricing || selectedModelObj?.pricing,
      },
    };

    // Add or update result in local state
    console.log("[handleEvalComplete] Adding newResult:", newResult);
    setEvalResults(prev => {
      const existingIndex = prev.findIndex(r => r.provider === newResult.provider);
      console.log("[handleEvalComplete] existingIndex:", existingIndex, "prev:", prev);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = newResult;
        return updated;
      }
      return [...prev, newResult];
    });
    setHasRunEval(true);
    console.log("[handleEvalComplete] Set hasRunEval to true");

    // Save to persistent eval storage for rankings
    // Map benchmark to category - IDs must match Python eval service (inspect_evals)
    const benchmarkCategories: Record<string, string> = {
      // Coding
      humaneval: "coding", swe_bench: "coding", swe_bench_verified: "coding", bigcodebench: "coding",
      mbpp: "coding", apps: "coding", ds1000: "coding", usaco: "coding", class_eval: "coding",
      scicode: "coding", agent_bench: "coding", core_bench: "coding", mle_bench: "coding",
      mle_bench_lite: "coding", paperbench: "coding", vimgolf: "coding",
      // Reasoning
      gpqa: "reasoning", gpqa_diamond: "reasoning", arc: "reasoning", hellaswag: "reasoning",
      bbh: "reasoning", bbeh: "reasoning", winogrande: "reasoning", drop: "reasoning",
      boolq: "reasoning", piqa: "reasoning", squad: "reasoning", race_h: "reasoning",
      musr: "reasoning", paws: "reasoning", lingoly: "reasoning", novelty_bench: "reasoning",
      worldsense: "reasoning",
      // Math
      gsm8k: "math", math: "math", aime2024: "math", aime2025: "math", mgsm: "math", mathvista: "math",
      // Knowledge
      mmlu: "knowledge", mmlu_pro: "knowledge", simpleqa: "knowledge", truthfulqa: "knowledge",
      commonsense_qa: "knowledge", agieval: "knowledge", medqa: "knowledge", pubmedqa: "knowledge",
      hle: "knowledge", livebench: "knowledge", healthbench: "knowledge", chembench: "knowledge",
      air_bench: "knowledge", onet: "knowledge", pre_flight: "knowledge", sosbench: "knowledge",
      sciknoweval: "knowledge", uccb: "knowledge",
      // Instruction
      ifeval: "instruction",
      // Agentic
      gaia: "agentic", gaia_level1: "agentic", gaia_level2: "agentic", gaia_level3: "agentic",
      browse_comp: "agentic", assistant_bench: "agentic", assistant_bench_closed: "agentic",
      assistant_bench_web: "agentic", mind2web: "agentic", osworld: "agentic", osworld_small: "agentic",
      bfcl: "agentic", gdpval: "agentic", sycophancy: "agentic",
      // Long Context
      infinite_bench: "long-context", niah: "long-context",
      // Vision
      mmmu: "vision", docvqa: "vision", mmiu: "vision", vstar_bench: "vision", zerobench: "vision",
      // Safety
      toxigen: "safety", xstest: "safety", strong_reject: "safety", wmdp: "safety",
      agentharm: "safety", agentdojo: "safety", ahb: "safety", abstention_bench: "safety",
      fortress: "safety", lab_bench: "safety", mask: "safety", make_me_pay: "safety",
      makemesay: "safety", mind2web_sc: "safety", coconot: "safety", b3: "safety",
      // Bias
      bbq: "bias", bold: "bias", stereoset: "bias",
      // Cybersecurity
      cybench: "cybersecurity", cyberseceval_3: "cybersecurity", cyberseceval_2: "cybersecurity",
      sec_qa: "cybersecurity", cve_bench: "cybersecurity", threecb: "cybersecurity",
      cybermetric: "cybersecurity", gdm_intercode_ctf: "cybersecurity", gdm_in_house_ctf: "cybersecurity",
      sevenllm: "cybersecurity", sandboxbench: "cybersecurity",
      // Writing
      writingbench: "writing",
      // Scheming
      agentic_misalignment: "scheming", gdm_sp_apps: "scheming", gdm_sr_self_reasoning: "scheming",
      gdm_stealth: "scheming",
      // Personality
      personality_bfi: "personality", personality_trait: "personality", personality_prime: "personality",
    };

    saveEvalResult({
      modelId: selectedModel,
      modelName: selectedModelObj?.name || selectedModel,
      provider: results.provider,
      benchmark: selectedBenchmark,
      benchmarkCategory: benchmarkCategories[selectedBenchmark] || "general",
      score: results.score,
      samplesEvaluated: results.totalQuestions,
      latencyMs: results.avgLatency * results.totalQuestions,
      timestamp: new Date().toISOString(),
    });
  };

  // Handle multi-provider eval completion
  const handleMultiProviderComplete = (results: Array<{
    provider: string;
    providerName: string;
    status: "pending" | "running" | "complete" | "error";
    score?: number;
    totalQuestions?: number;
    durationMs?: number;
    error?: string;
  }>) => {
    // Convert results to our EvalResult format and update state
    const newResults: EvalResult[] = results
      .filter(r => r.status === "complete" && r.score !== undefined)
      .map(r => ({
        provider: r.providerName,
        providerTag: `${r.provider}/${selectedModel.split('/')[1]}`,
        score: r.score!,
        durationMs: r.durationMs || 0,
        samplesEvaluated: r.totalQuestions || sampleSize,
        metadata: {
          quantization: realProviders.find(p => p.tag === r.provider)?.quantization || "Auto",
          uptime: realProviders.find(p => p.tag === r.provider)?.uptime || 99.5,
          pricing: realProviders.find(p => p.tag === r.provider)?.pricing || selectedModelObj?.pricing,
        },
      }));

    setEvalResults(newResults);
    setHasRunEval(true);

    // Save each result to persistent storage (reuse same mapping as above)
    newResults.forEach(result => {
      // Get category from availableBenchmarks config for consistency
      const benchmarkConfig = allBenchmarks.find(b => b.id === selectedBenchmark);
      const category = benchmarkConfig?.category?.toLowerCase().replace(/\s+/g, "-") || "general";

      saveEvalResult({
        modelId: selectedModel,
        modelName: selectedModelObj?.name || selectedModel,
        provider: result.provider,
        benchmark: selectedBenchmark,
        benchmarkCategory: category,
        score: result.score || 0,
        samplesEvaluated: result.samplesEvaluated,
        latencyMs: result.durationMs,
        timestamp: new Date().toISOString(),
      });
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-in stagger-1">
        <div className="flex items-center gap-3 mb-2">
          <Server className="w-8 h-8 text-[var(--signal-blue)]" />
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Provider Evaluation
          </h1>
        </div>
        <p className="text-[var(--text-secondary)] text-lg">
          Find the best provider for your chosen model
        </p>
      </div>

      {/* Question Banner */}
      <div className="card card-glow p-6 bg-gradient-to-r from-[var(--signal-blue-dim)] to-transparent animate-in stagger-2">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--signal-blue)] flex items-center justify-center">
            <Server className="w-6 h-6 text-[var(--void)]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              &quot;Which provider gives me the best {selectedModel.split("/")[1] || "model"}?&quot;
            </h2>
            <p className="text-[var(--text-secondary)]">
              Compare the same model across different infrastructure providers
            </p>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="card p-6 animate-in stagger-3">
        <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
          Configuration
        </h3>
        <div className="grid grid-cols-4 gap-4">
          {/* Model Selection */}
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
              Model <span className="text-[var(--signal-amber)]">*</span>
            </label>
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search models..."
                  className="input w-full"
                  style={{ paddingLeft: '2.5rem' }}
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                />
              </div>
              {modelsLoading ? (
                <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <select
                  className="select w-full"
                  value={selectedModel}
                  onChange={(e) => {
                    setSelectedModel(e.target.value);
                    setEvalResults([]);
                    setHasRunEval(false);
                    setSelectedHostingProviders([]);
                  }}
                >
                  <option value="">Select a model...</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              )}
              {!selectedModel && (
                <p className="text-xs text-[var(--text-muted)]">
                  {totalModels} models available
                </p>
              )}
            </div>
          </div>

          {/* Vendor Filter & Hosting Provider */}
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
              Filter by Vendor
            </label>
            <select
              className="select w-full"
              value={selectedVendor}
              onChange={(e) => {
                setSelectedVendor(e.target.value);
                setSelectedModel("");
                setEvalResults([]);
                setHasRunEval(false);
                setSelectedHostingProviders([]);
              }}
            >
              <option value="">All vendors ({vendorCategories.reduce((sum, c) => sum + c.count, 0)})</option>
              {vendorCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} ({cat.count})
                </option>
              ))}
            </select>
            {selectedModel && (
              <div className="mt-2">
                <label className="text-xs text-[var(--text-muted)] block mb-1">
                  Hosting Provider
                </label>
                {providersLoading ? (
                  <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs py-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading providers...
                  </div>
                ) : realProviders.length > 0 ? (
                  <>
                    <select
                      className="select w-full text-sm"
                      value={selectedHostingProviders.length === 1 ? selectedHostingProviders[0] : (selectedHostingProviders.length > 1 ? "_compare_all" : "")}
                      onChange={(e) => {
                        if (e.target.value === "") {
                          // Default: OpenRouter auto-routing
                          setSelectedHostingProviders([]);
                        } else if (e.target.value === "_compare_all") {
                          // Compare all: run eval on each provider
                          setSelectedHostingProviders(realProviders.map(p => p.tag));
                        } else {
                          // Single provider
                          setSelectedHostingProviders([e.target.value]);
                        }
                      }}
                    >
                      <option value="">Default (OpenRouter routing)</option>
                      <option value="_compare_all">⚡ Compare all {realProviders.length} providers</option>
                      <optgroup label="Individual Providers">
                        {realProviders.map((provider) => (
                          <option key={provider.tag} value={provider.tag}>
                            {provider.name} ({provider.uptime}% uptime)
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {selectedHostingProviders.length === 0 && "Uses OpenRouter's automatic routing"}
                      {selectedHostingProviders.length === 1 && `Will eval on ${realProviders.find(p => p.tag === selectedHostingProviders[0])?.name || selectedHostingProviders[0]}`}
                      {selectedHostingProviders.length > 1 && (
                        <span className="text-[var(--signal-amber)]">
                          Will run {selectedHostingProviders.length} separate evals
                        </span>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] py-1">
                    No hosting providers found
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Benchmark Selection */}
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
              Benchmark
            </label>
            <select
              className="select w-full"
              value={selectedBenchmark}
              onChange={(e) => setSelectedBenchmark(e.target.value)}
            >
              {benchmarkCategories.map((cat) => (
                <optgroup key={cat.id} label={cat.name}>
                  {cat.benchmarks
                    .filter((b) => availableBenchmarksForModel.some((ab) => ab.id === b.id))
                    .map((bench) => (
                      <option key={bench.id} value={bench.id}>
                        {bench.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            {/* Dependency warning for selected benchmark */}
            {(() => {
              const dep = getBenchmarkDependency(selectedBenchmark);
              return dep?.warning ? (
                <div className="mt-2 p-2 rounded-md bg-[var(--signal-amber-dim)] border border-[var(--signal-amber)]">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--signal-amber)] mt-0.5 shrink-0" />
                    <div className="text-xs text-[var(--signal-amber)]">
                      <span className="font-medium">Dependency required:</span>{" "}
                      {dep.warning}
                      {dep.installCmd && (
                        <div className="mt-1 font-mono text-[10px] opacity-80">
                          {dep.installCmd}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null;
            })()}
          </div>

          {/* Sample Size & Run Button */}
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
              Sample Size
            </label>
            <div className="space-y-2">
              <select
                className="select w-full"
                value={sampleSize}
                onChange={(e) => setSampleSize(parseInt(e.target.value))}
              >
                <option value="10">Quick (10)</option>
                <option value="25">Standard (25)</option>
                <option value="50">Medium (50)</option>
                <option value="100">Large (100)</option>
                <option value="250">Extended (250)</option>
                <option value="500">Comprehensive (500)</option>
                <option value="1000">Full (1,000)</option>
                <option value="5000">Complete (5,000)</option>
                <option value="0">⚠️ Entire Benchmark</option>
              </select>
              {sampleSize === 0 && (
                <p className="text-xs text-[var(--signal-amber)] mt-1">
                  Warning: Full benchmarks can take hours and cost significantly more.
                </p>
              )}
              {sampleSize >= 1000 && sampleSize > 0 && (
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Large sample sizes may take 10+ minutes.
                </p>
              )}
              <button
                className="btn-primary w-full flex items-center justify-center gap-2"
                onClick={() => {
                  setSelectedProvider(undefined);
                  setShowLiveEval(true);
                }}
                disabled={!selectedModel}
              >
                <Play className="w-4 h-4" />
                Run Eval
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-4 gap-6">
        {/* Main Results Table */}
        <div className="col-span-3 space-y-4 animate-in stagger-4">
          {/* Sort Options */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              Provider Results
            </h3>
            <div className="flex items-center gap-4">
              {/* Export Buttons - Show when results exist */}
              {hasRunEval && sortedResults.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-[var(--text-muted)] mr-1">Export:</span>
                  {(["csv", "txt", "md"] as ExportFormat[]).map((format) => (
                    <button
                      key={format}
                      onClick={() => {
                        // Create export data for provider comparison
                        const exportData: ExportableEvalData = {
                          model: selectedModel,
                          provider: "Multi-Provider Comparison",
                          benchmark: selectedBenchmark,
                          score: sortedResults[0]?.score ?? 0,
                          totalQuestions: sortedResults[0]?.samplesEvaluated ?? sampleSize,
                          correctCount: Math.round((sortedResults[0]?.score ?? 0) * (sortedResults[0]?.samplesEvaluated ?? sampleSize)),
                          avgLatency: sortedResults.reduce((sum, r) => sum + r.durationMs, 0) / sortedResults.length / (sortedResults[0]?.samplesEvaluated ?? 1),
                          results: sortedResults.map((r, i) => ({
                            question: `Provider: ${r.provider}`,
                            questionIndex: i,
                            expected: `Score: ${((r.score ?? 0) * 100).toFixed(1)}%`,
                            predicted: `Duration: ${(r.durationMs / 1000).toFixed(1)}s`,
                            correct: i === 0, // Mark best provider as "correct"
                            latencyMs: r.durationMs / (r.samplesEvaluated || 1),
                            subject: r.metadata?.quantization || "Auto",
                          })),
                          timestamp: new Date().toISOString(),
                        };
                        exportResults(exportData, format);
                      }}
                      className="btn-secondary px-2 py-1 text-xs flex items-center gap-1"
                      title={`Export as ${format.toUpperCase()}`}
                    >
                      {format === "csv" && <FileSpreadsheet className="w-3 h-3" />}
                      {format === "txt" && <FileText className="w-3 h-3" />}
                      {format === "md" && <FileDown className="w-3 h-3" />}
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--text-muted)]">Sort by:</span>
                <div className="tabs">
                  {(["score", "latency", "price", "uptime"] as SortKey[]).map((key) => (
                    <button
                      key={key}
                      className={`tab ${sortBy === key ? "active" : ""}`}
                      onClick={() => setSortBy(key)}
                    >
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Results Cards */}
          {!hasRunEval ? (
            <div className="card p-12 text-center">
              <div className="w-16 h-16 rounded-xl bg-[var(--signal-blue-dim)] flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-[var(--signal-blue)]" />
              </div>
              <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                Ready to Evaluate
              </h3>
              <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
                Run an evaluation to compare how <span className="font-mono text-[var(--signal-blue)]">{selectedModel || "your model"}</span> performs across different providers.
              </p>
              <button
                className="btn-primary inline-flex items-center gap-2"
                onClick={() => setShowLiveEval(true)}
                disabled={!selectedModel}
              >
                <Play className="w-4 h-4" />
                Run First Evaluation
              </button>
            </div>
          ) : sortedResults.length === 0 ? (
            <div className="card p-8 text-center text-[var(--text-muted)]">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Running evaluation...
            </div>
          ) : (
            <div className="space-y-3">
              {sortedResults.map((result, index) => {
                const isWinner = index === 0;
                const scorePercent = (result.score ?? 0) * 100;

                return (
                  <div
                    key={result.providerTag}
                    className={`card p-5 ${
                      isWinner ? "border-[var(--signal-green)] border-opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Rank */}
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono text-lg font-bold ${
                            isWinner
                              ? "bg-[var(--signal-green-dim)] text-[var(--signal-green)]"
                              : index === 1
                              ? "bg-[var(--signal-blue-dim)] text-[var(--signal-blue)]"
                              : index === 2
                              ? "bg-[var(--signal-amber-dim)] text-[var(--signal-amber)]"
                              : "bg-[var(--surface-elevated)] text-[var(--text-muted)]"
                          }`}
                        >
                          {isWinner ? <Trophy className="w-5 h-5" /> : `#${index + 1}`}
                        </div>

                        {/* Provider Info */}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--text-primary)]">
                              {result.provider}
                            </span>
                            {result.metadata?.quantization && (
                              <span className="text-xs font-mono text-[var(--text-muted)] bg-[var(--surface-elevated)] px-2 py-0.5 rounded">
                                {result.metadata.quantization}
                              </span>
                            )}
                            <div className="status-dot healthy" />
                          </div>
                          <div className="text-xs text-[var(--text-muted)] font-mono">
                            {result.providerTag}
                          </div>
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="flex items-center gap-8">
                        <div className="text-center">
                          <div
                            className={`font-mono text-2xl font-bold ${
                              scorePercent >= 80
                                ? "text-[var(--signal-green)]"
                                : scorePercent >= 60
                                ? "text-[var(--signal-blue)]"
                                : "text-[var(--signal-amber)]"
                            }`}
                          >
                            {scorePercent.toFixed(1)}%
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">Score</div>
                        </div>

                        <div className="text-center">
                          <div className="font-mono text-lg text-[var(--text-primary)]">
                            {(result.durationMs / 1000).toFixed(1)}s
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">Duration</div>
                        </div>

                        <div className="text-center">
                          <div className="font-mono text-lg text-[var(--text-primary)]">
                            {result.samplesEvaluated}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">Questions</div>
                        </div>

                        {result.metadata?.pricing && (
                          <div className="text-center">
                            <div className="font-mono text-lg text-[var(--signal-green)]">
                              ${result.metadata.pricing.input.toFixed(2)}
                            </div>
                            <div className="text-xs text-[var(--text-muted)]">$/M tokens</div>
                          </div>
                        )}

                        <button
                          className="btn-secondary px-4 py-2 text-sm flex items-center gap-2"
                          onClick={() => {
                            setSelectedProvider(result.provider);
                            setShowLiveEval(true);
                          }}
                        >
                          <Play className="w-3 h-3" />
                          Retest
                        </button>
                      </div>
                    </div>

                    {/* Score Bar */}
                    <div className="mt-4">
                      <div className="progress-bar">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${scorePercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar - Recommendation */}
        <div className="space-y-4 animate-in stagger-5">
          {/* Best Provider Card */}
          {bestProvider ? (
            <div className="card card-glow p-6">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-[var(--signal-green)]" />
                <h3 className="font-semibold text-[var(--text-primary)]">
                  Recommended Provider
                </h3>
              </div>

              <div className="text-center py-4">
                <div className="text-2xl font-bold text-[var(--signal-green)] mb-1">
                  {bestProvider.provider}
                </div>
                <div className="text-sm text-[var(--text-muted)] font-mono">
                  {bestProvider.metadata?.quantization}
                </div>
              </div>

              <div className="space-y-3 mt-4 pt-4 border-t border-[var(--border)]">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Score</span>
                  <span className="font-mono text-[var(--signal-green)]">
                    {((bestProvider.score ?? 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Duration</span>
                  <span className="font-mono text-[var(--text-primary)]">
                    {(bestProvider.durationMs / 1000).toFixed(1)}s
                  </span>
                </div>
                {bestProvider.metadata?.pricing && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Price</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      ${bestProvider.metadata.pricing.input.toFixed(2)}/M
                    </span>
                  </div>
                )}
              </div>

              <button className="btn-secondary w-full mt-4 flex items-center justify-center gap-2">
                <BarChart3 className="w-4 h-4" />
                View Detailed Analysis
              </button>
            </div>
          ) : (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-5 h-5 text-[var(--signal-blue)]" />
                <h3 className="font-semibold text-[var(--text-primary)]">
                  Getting Started
                </h3>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Run an evaluation to see which provider performs best for your selected model.
              </p>
            </div>
          )}

          {/* Provider Health */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-[var(--signal-blue)]" />
              <h3 className="font-semibold text-[var(--text-primary)]">
                Provider Health
              </h3>
            </div>
            {providersLoading ? (
              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </div>
            ) : realProviders.length > 0 ? (
              <div className="space-y-2">
                {realProviders.slice(0, 5).map((provider) => (
                  <div key={provider.tag} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`status-dot ${provider.status}`} />
                      <span className="text-[var(--text-secondary)] truncate max-w-[120px]">
                        {provider.name}
                      </span>
                    </div>
                    <span className="font-mono text-[var(--text-muted)]">
                      {provider.uptime}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No provider data available
              </p>
            )}
          </div>

          {/* Why This Provider */}
          {bestProvider && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-5 h-5 text-[var(--signal-blue)]" />
                <h3 className="font-semibold text-[var(--text-primary)]">
                  Why {bestProvider.provider}?
                </h3>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--signal-green)] mt-1.5" />
                  <p className="text-[var(--text-secondary)]">
                    Highest benchmark score on {selectedBenchmark.toUpperCase()}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--signal-green)] mt-1.5" />
                  <p className="text-[var(--text-secondary)]">
                    Completed {bestProvider.samplesEvaluated} questions successfully
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--signal-green)] mt-1.5" />
                  <p className="text-[var(--text-secondary)]">
                    Best price-to-performance ratio
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Evaluation Modal */}
      {showLiveEval && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden animate-in">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-[var(--signal-blue)]" />
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">
                    {selectedHostingProviders.length > 1 ? "Multi-Provider Comparison" : "Live Provider Evaluation"}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {selectedHostingProviders.length > 1
                      ? `Testing ${selectedModel} across ${selectedHostingProviders.length} providers`
                      : `Testing ${selectedModel} ${selectedProvider ? `via ${selectedProvider}` : "via OpenRouter routing"}`
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLiveEval(false)}
                className="p-2 hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[var(--text-muted)]" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
              {selectedHostingProviders.length > 1 ? (
                <MultiProviderEval
                  model={selectedModel}
                  providers={selectedHostingProviders.map(tag => ({
                    tag,
                    name: realProviders.find(p => p.tag === tag)?.name || tag,
                  }))}
                  benchmark={selectedBenchmark}
                  limit={sampleSize}
                  onComplete={handleMultiProviderComplete}
                />
              ) : (
                <EvalProgress
                  model={selectedModel}
                  provider={selectedHostingProviders.length === 1 ? selectedHostingProviders[0] : selectedProvider}
                  benchmark={selectedBenchmark}
                  limit={sampleSize}
                  onComplete={handleEvalComplete}
                  autoStart={true}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProvidersPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--signal-blue)] mx-auto mb-4" />
          <p className="text-[var(--text-muted)]">Loading providers...</p>
        </div>
      </div>
    }>
      <ProvidersPageContent />
    </Suspense>
  );
}
