"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Trophy,
  Clock,
  Target,
  Zap,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Download,
  RefreshCw,
  Play,
  BarChart3,
  TrendingUp,
  Award,
  X,
  Info,
  DollarSign,
  Hash,
  Repeat,
  Server,
  Layers,
  AlertTriangle,
} from "lucide-react";

interface BenchmarkResult {
  model: string;
  benchmark: string;
  score: number;
  correct: number;
  total: number;
  duration_seconds: number;
  status: string;
  started_at?: string;
  completed_at?: string;
}

interface BenchmarkRun {
  id: string;
  benchmark: string;
  timestamp: string;
  results: BenchmarkResult[];
  summary: {
    total_models: number;
    successful: number;
    best_score: number;
    best_model: string;
  };
}

interface Benchmark {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface Provider {
  id: string;
  name: string;
  description: string;
}

const BENCHMARK_SERVICE_URL = process.env.NEXT_PUBLIC_EVAL_SERVICE_URL || "http://localhost:8000";

// Available providers for evaluation
const PROVIDERS: Provider[] = [
  { id: "openrouter", name: "OpenRouter", description: "Unified access to 200+ models (500 RPS)" },
  { id: "openai", name: "OpenAI", description: "Direct OpenAI API access" },
  { id: "anthropic", name: "Anthropic", description: "Direct Anthropic API access" },
  { id: "google", name: "Google AI", description: "Direct Google AI (Gemini) access" },
  { id: "together", name: "Together AI", description: "Fast open-source model inference" },
  { id: "fireworks", name: "Fireworks AI", description: "Fast model inference" },
];

// Cost estimates per model (per 1M tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "openai/gpt-4o": { input: 2.50, output: 10.00 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.60 },
  "anthropic/claude-3.5-sonnet": { input: 3.00, output: 15.00 },
  "anthropic/claude-3-opus": { input: 15.00, output: 75.00 },
  "google/gemini-pro-1.5": { input: 2.50, output: 10.00 },
  "meta-llama/llama-3.1-405b-instruct": { input: 3.00, output: 3.00 },
};

// Token estimates per benchmark type
const BENCHMARK_TOKENS: Record<string, { input: number; output: number }> = {
  mmlu: { input: 150, output: 50 },
  gsm8k: { input: 200, output: 150 },
  humaneval: { input: 300, output: 500 },
  gpqa: { input: 400, output: 100 },
  arc: { input: 100, output: 30 },
  hellaswag: { input: 200, output: 30 },
  truthfulqa: { input: 150, output: 50 },
  swe_bench: { input: 2000, output: 1000 },
  default: { input: 200, output: 100 },
};

function estimateCost(model: string, benchmarkId: string, samples: number): number {
  const pricing = MODEL_PRICING[model] || { input: 1.00, output: 2.00 };
  const tokens = BENCHMARK_TOKENS[benchmarkId] || BENCHMARK_TOKENS.default;
  const inputCost = (tokens.input * samples / 1_000_000) * pricing.input;
  const outputCost = (tokens.output * samples / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

export default function BenchmarksPage() {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [serviceStatus, setServiceStatus] = useState<"online" | "offline" | "checking">("checking");
  const [selectedBenchmark, setSelectedBenchmark] = useState<Benchmark | null>(null);
  const [showRunModal, setShowRunModal] = useState(false);

  // Fetch benchmarks from service
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const response = await fetch(`${BENCHMARK_SERVICE_URL}/benchmarks`);
        if (response.ok) {
          const data = await response.json();
          setBenchmarks(data.benchmarks);
          setCategories(data.categories);
          setServiceStatus("online");
        } else {
          setServiceStatus("offline");
        }
      } catch {
        setServiceStatus("offline");
      }
      setIsLoading(false);
    }
    fetchData();
  }, []);

  const filteredBenchmarks = benchmarks.filter((b) => {
    const matchesCategory = selectedCategory === "all" || b.category === selectedCategory;
    const matchesSearch =
      searchQuery === "" ||
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const groupedBenchmarks = filteredBenchmarks.reduce((acc, benchmark) => {
    const cat = benchmark.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(benchmark);
    return acc;
  }, {} as Record<string, Benchmark[]>);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                Benchmark Explorer
              </h1>
              <p className="text-[var(--text-muted)] mt-1">
                117 benchmarks across 12 categories • Powered by Inspect AI
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                serviceStatus === "online"
                  ? "bg-[var(--signal-green-dim)] text-[var(--signal-green)]"
                  : serviceStatus === "offline"
                  ? "bg-[var(--signal-red-dim)] text-[var(--signal-red)]"
                  : "bg-[var(--surface-elevated)] text-[var(--text-muted)]"
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  serviceStatus === "online" ? "bg-[var(--signal-green)]" :
                  serviceStatus === "offline" ? "bg-[var(--signal-red)]" :
                  "bg-[var(--text-muted)]"
                }`} />
                {serviceStatus === "online" ? "Service Online" :
                 serviceStatus === "offline" ? "Service Offline" : "Checking..."}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--signal-blue-dim)]">
                <BarChart3 className="w-5 h-5 text-[var(--signal-blue)]" />
              </div>
              <div>
                <div className="text-2xl font-bold text-[var(--text-primary)]">
                  {benchmarks.length}
                </div>
                <div className="text-sm text-[var(--text-muted)]">Total Benchmarks</div>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--signal-green-dim)]">
                <Target className="w-5 h-5 text-[var(--signal-green)]" />
              </div>
              <div>
                <div className="text-2xl font-bold text-[var(--text-primary)]">
                  {categories.length}
                </div>
                <div className="text-sm text-[var(--text-muted)]">Categories</div>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--signal-amber-dim)]">
                <Zap className="w-5 h-5 text-[var(--signal-amber)]" />
              </div>
              <div>
                <div className="text-2xl font-bold text-[var(--text-primary)]">
                  500
                </div>
                <div className="text-sm text-[var(--text-muted)]">Max RPS</div>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--signal-purple-dim)]">
                <TrendingUp className="w-5 h-5 text-[var(--signal-purple)]" />
              </div>
              <div>
                <div className="text-2xl font-bold text-[var(--text-primary)]">
                  ∞
                </div>
                <div className="text-sm text-[var(--text-muted)]">Parallel Models</div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search benchmarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search benchmarks"
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--signal-blue)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
            <label htmlFor="category-select" className="sr-only">Filter by category</label>
            <select
              id="category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by category"
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--signal-blue)]"
            >
              <option value="all">All Categories</option>
              {categories.sort().map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-[var(--text-muted)]">
            {filteredBenchmarks.length} benchmarks
          </div>
        </div>

        {/* Benchmark Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-[var(--text-muted)] animate-spin" />
          </div>
        ) : serviceStatus === "offline" ? (
          <div className="card p-8 text-center">
            <div className="text-[var(--signal-red)] mb-4">
              <Zap className="w-12 h-12 mx-auto" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
              Benchmark Service Offline
            </h3>
            <p className="text-[var(--text-muted)] mb-4">
              Start the benchmark service to view and run benchmarks.
            </p>
            <code className="block bg-[var(--surface-elevated)] px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)]">
              cd benchmark-service && ./start.sh
            </code>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedBenchmarks)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, items]) => (
                <div key={category}>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                    <span className="px-2 py-1 rounded bg-[var(--surface-elevated)] text-sm uppercase tracking-wider">
                      {category}
                    </span>
                    <span className="text-[var(--text-muted)] font-normal text-sm">
                      {items.length} benchmarks
                    </span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.sort((a, b) => a.name.localeCompare(b.name)).map((benchmark) => (
                      <BenchmarkCard
                        key={benchmark.id}
                        benchmark={benchmark}
                        onSelect={() => setSelectedBenchmark(benchmark)}
                        onRun={() => {
                          setSelectedBenchmark(benchmark);
                          setShowRunModal(true);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Benchmark Detail Modal */}
        {selectedBenchmark && !showRunModal && (
          <BenchmarkDetailModal
            benchmark={selectedBenchmark}
            onClose={() => setSelectedBenchmark(null)}
            onRun={() => setShowRunModal(true)}
          />
        )}

        {/* Run Configuration Modal */}
        {showRunModal && selectedBenchmark && (
          <RunConfigModal
            benchmark={selectedBenchmark}
            onClose={() => {
              setShowRunModal(false);
              setSelectedBenchmark(null);
            }}
          />
        )}
      </main>
    </div>
  );
}

function BenchmarkCard({
  benchmark,
  onSelect,
  onRun,
}: {
  benchmark: Benchmark;
  onSelect: () => void;
  onRun: () => void;
}) {
  const categoryColors: Record<string, string> = {
    coding: "text-[var(--signal-blue)]",
    knowledge: "text-[var(--signal-green)]",
    reasoning: "text-[var(--signal-amber)]",
    math: "text-[var(--signal-purple)]",
    safety: "text-[var(--signal-red)]",
    assistant: "text-[var(--signal-cyan)]",
    cybersecurity: "text-[var(--signal-red)]",
    multimodal: "text-[var(--signal-pink)]",
    bias: "text-[var(--signal-amber)]",
    personality: "text-[var(--signal-purple)]",
    scheming: "text-[var(--signal-red)]",
    writing: "text-[var(--signal-green)]",
  };

  return (
    <div
      className="card p-4 hover:border-[var(--signal-blue)] transition-colors cursor-pointer"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      aria-label={`${benchmark.name} benchmark in ${benchmark.category} category`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-[var(--text-primary)]">
            {benchmark.name}
          </h3>
          <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">
            {benchmark.description}
          </p>
        </div>
        <div className={`text-xs px-2 py-1 rounded ${categoryColors[benchmark.category] || "text-[var(--text-muted)]"} bg-[var(--surface-elevated)]`}>
          {benchmark.category}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <code className="text-xs text-[var(--text-muted)] bg-[var(--surface-elevated)] px-2 py-1 rounded">
          {benchmark.id}
        </code>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRun();
          }}
          className="flex items-center gap-1 text-xs text-[var(--signal-blue)] hover:underline"
          aria-label={`Run ${benchmark.name} benchmark`}
        >
          <Play className="w-3 h-3" aria-hidden="true" />
          Run
        </button>
      </div>
    </div>
  );
}

// Hook for modal accessibility - Escape key and focus trapping
function useModalAccessibility(onClose: () => void, isOpen: boolean = true) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Handle Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    // Focus trap
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    // Focus first element on mount
    const firstFocusable = modalRef.current?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as HTMLElement;
    firstFocusable?.focus();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keydown", handleTab);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keydown", handleTab);
    };
  }, [onClose, isOpen]);

  return modalRef;
}

// Error notification component for user-facing errors
function ErrorNotification({
  message,
  details,
  onDismiss,
}: {
  message: string;
  details?: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="fixed bottom-4 right-4 max-w-md z-50 animate-in slide-in-from-bottom-4 fade-in duration-300"
      role="alert"
      aria-live="assertive"
    >
      <div className="bg-[var(--signal-red-dim)] border border-[var(--signal-red)] rounded-lg p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--signal-red)] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-[var(--signal-red)]">{message}</p>
            {details && (
              <p className="text-sm text-[var(--text-muted)] mt-1">{details}</p>
            )}
          </div>
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-[var(--surface-elevated)] rounded transition-colors"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>
      </div>
    </div>
  );
}

function BenchmarkDetailModal({
  benchmark,
  onClose,
  onRun,
}: {
  benchmark: Benchmark;
  onClose: () => void;
  onRun: () => void;
}) {
  const modalRef = useModalAccessibility(onClose);
  const tokens = BENCHMARK_TOKENS[benchmark.id] || BENCHMARK_TOKENS.default;
  const commonModels = [
    "openai/gpt-4o",
    "anthropic/claude-3.5-sonnet",
    "google/gemini-pro-1.5",
    "meta-llama/llama-3.1-405b-instruct",
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="presentation">
      <div
        ref={modalRef}
        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="benchmark-detail-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-[var(--border)]">
          <div>
            <h2 id="benchmark-detail-title" className="text-2xl font-bold text-[var(--text-primary)]">
              {benchmark.name}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <code className="text-sm text-[var(--text-muted)] bg-[var(--surface-elevated)] px-2 py-1 rounded">
                {benchmark.id}
              </code>
              <span className="text-xs px-2 py-1 rounded bg-[var(--signal-blue-dim)] text-[var(--signal-blue)]">
                {benchmark.category}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--surface-elevated)] rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-[var(--text-muted)]" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Description
            </h3>
            <p className="text-[var(--text-secondary)]">
              {benchmark.description}
            </p>
          </div>

          {/* Token Estimates */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Token Estimates (per sample)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-[var(--surface-elevated)]">
                <div className="text-sm text-[var(--text-muted)]">Input</div>
                <div className="text-xl font-bold text-[var(--text-primary)]">
                  ~{tokens.input} tokens
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--surface-elevated)]">
                <div className="text-sm text-[var(--text-muted)]">Output</div>
                <div className="text-xl font-bold text-[var(--text-primary)]">
                  ~{tokens.output} tokens
                </div>
              </div>
            </div>
          </div>

          {/* Cost Estimates */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Cost Estimates (10 samples)
            </h3>
            <div className="space-y-2">
              {commonModels.map((model) => (
                <div
                  key={model}
                  className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface-elevated)]"
                >
                  <span className="text-sm text-[var(--text-secondary)]">{model}</span>
                  <span className="text-sm font-mono text-[var(--signal-green)]">
                    ${estimateCost(model, benchmark.id, 10).toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Inspect Task */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Inspect AI Task
            </h3>
            <code className="block p-3 rounded-lg bg-[var(--surface-elevated)] text-sm text-[var(--text-secondary)]">
              inspect_evals/{benchmark.id}
            </code>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors"
          >
            Close
          </button>
          <button
            onClick={onRun}
            className="px-4 py-2 rounded-lg bg-[var(--signal-blue)] text-white hover:opacity-90 transition-colors flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Run Benchmark
          </button>
        </div>
      </div>
    </div>
  );
}

// Store run results in localStorage for persistence
function saveRunToStorage(run: {
  id: string;
  benchmark: string;
  timestamp: string;
  results: Array<{
    model: string;
    provider: string;
    score: number;
    correct: number;
    total: number;
    duration_seconds: number;
    status: string;
  }>;
}) {
  try {
    const existing = localStorage.getItem("benchmark_runs");
    const runs = existing ? JSON.parse(existing) : [];
    runs.unshift(run); // Add to front
    // Keep only last 50 runs
    const trimmed = runs.slice(0, 50);
    localStorage.setItem("benchmark_runs", JSON.stringify(trimmed));
  } catch (e) {
    console.error("Failed to save run to localStorage:", e);
  }
}

function RunConfigModal({
  benchmark,
  onClose,
}: {
  benchmark: Benchmark;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<{ message: string; details?: string } | null>(null);

  // Modal accessibility - but prevent closing while running
  const handleClose = useCallback(() => {
    if (!isRunning) {
      onClose();
    }
  }, [isRunning, onClose]);
  const modalRef = useModalAccessibility(handleClose, !isRunning);

  // Comparison mode: "models" (same provider, different models) or "providers" (same model, different providers)
  const [comparisonMode, setComparisonMode] = useState<"models" | "providers">("models");

  // For model comparison mode
  const [selectedModels, setSelectedModels] = useState<string[]>(["openai/gpt-4o"]);
  const [selectedProvider, setSelectedProvider] = useState("openrouter");

  // For provider comparison mode
  const [singleModel, setSingleModel] = useState("openai/gpt-4o");
  const [selectedProviders, setSelectedProviders] = useState<string[]>(["openrouter"]);

  const [samples, setSamples] = useState(10);
  const [seed, setSeed] = useState<string>("");
  const [epochs, setEpochs] = useState(1);
  const [modelProgress, setModelProgress] = useState<Record<string, { current: number; total: number; score: number; status: string; duration_seconds?: number }>>({});

  // AbortController for cancelling running streams
  const abortControllerRef = useRef<AbortController | null>(null);
  const runStartTimeRef = useRef<Record<string, number>>({});

  // Cleanup on unmount - cancel any running streams
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const totalSamples = samples * epochs;
  const estimatedCost = comparisonMode === "models"
    ? selectedModels.reduce((acc, model) => acc + estimateCost(model, benchmark.id, totalSamples), 0)
    : estimateCost(singleModel, benchmark.id, totalSamples) * selectedProviders.length;

  // Expanded model list - OpenRouter provides 200+ models
  const modelCategories = {
    "OpenAI": [
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "openai/gpt-4-turbo",
      "openai/gpt-4",
      "openai/o1-preview",
      "openai/o1-mini",
    ],
    "Anthropic": [
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3-opus",
      "anthropic/claude-3-sonnet",
      "anthropic/claude-3-haiku",
    ],
    "Google": [
      "google/gemini-pro-1.5",
      "google/gemini-flash-1.5",
      "google/gemini-2.0-flash-exp",
    ],
    "Meta Llama": [
      "meta-llama/llama-3.1-405b-instruct",
      "meta-llama/llama-3.1-70b-instruct",
      "meta-llama/llama-3.1-8b-instruct",
      "meta-llama/llama-3.2-90b-vision-instruct",
      "meta-llama/llama-3.2-11b-vision-instruct",
    ],
    "Mistral": [
      "mistralai/mistral-large",
      "mistralai/mistral-medium",
      "mistralai/mixtral-8x22b-instruct",
      "mistralai/mixtral-8x7b-instruct",
      "mistralai/codestral-latest",
    ],
    "Qwen": [
      "qwen/qwen-2.5-72b-instruct",
      "qwen/qwen-2.5-coder-32b-instruct",
      "qwen/qwq-32b-preview",
    ],
    "DeepSeek": [
      "deepseek/deepseek-chat",
      "deepseek/deepseek-coder",
    ],
    "Cohere": [
      "cohere/command-r-plus",
      "cohere/command-r",
    ],
    "Other": [
      "perplexity/llama-3.1-sonar-huge-128k-online",
      "x-ai/grok-beta",
      "databricks/dbrx-instruct",
    ],
  };

  const commonModels = Object.values(modelCategories).flat();

  const toggleModel = (model: string) => {
    setSelectedModels(prev =>
      prev.includes(model)
        ? prev.filter(m => m !== model)
        : [...prev, model]
    );
  };

  const toggleProvider = (providerId: string) => {
    setSelectedProviders(prev =>
      prev.includes(providerId)
        ? prev.filter(p => p !== providerId)
        : [...prev, providerId]
    );
  };

  const selectAll = () => setSelectedModels([...commonModels]);
  const selectNone = () => setSelectedModels([]);
  const selectAllProviders = () => setSelectedProviders(PROVIDERS.map(p => p.id));
  const selectNoProviders = () => setSelectedProviders([]);

  const runModelBenchmark = useCallback(async (
    model: string,
    provider: string = selectedProvider,
    progressKey?: string,
    signal?: AbortSignal
  ) => {
    const key = progressKey || model;
    const startTime = Date.now();
    runStartTimeRef.current[key] = startTime;

    setModelProgress(prev => ({
      ...prev,
      [key]: { current: 0, total: samples, score: 0, status: "running" }
    }));

    try {
      const params = new URLSearchParams({
        model,
        benchmark: benchmark.id,
        limit: samples.toString(),
        provider,
      });
      if (seed) params.set("seed", seed);
      if (epochs > 1) params.set("epochs", epochs.toString());

      const response = await fetch(`/api/eval/stream?${params}`, { signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
                if (event.type === "result" || event.type === "progress") {
                  const currentScore = event.data?.runningScore || event.data?.score || 0;
                  correct = event.data?.correct || Math.round(currentScore * samples);
                  setModelProgress(prev => ({
                    ...prev,
                    [key]: {
                      current: event.data?.currentQuestion || event.data?.questionIndex + 1 || prev[key]?.current || 0,
                      total: samples,
                      score: currentScore,
                      status: "running"
                    }
                  }));
                } else if (event.type === "complete") {
                  finalScore = event.data?.score || 0;
                  correct = event.data?.correct || Math.round(finalScore * samples);
                  const duration = (Date.now() - startTime) / 1000;
                  setModelProgress(prev => ({
                    ...prev,
                    [key]: {
                      current: samples,
                      total: samples,
                      score: finalScore,
                      status: "complete",
                      duration_seconds: duration
                    }
                  }));
                  return {
                    model,
                    provider,
                    score: finalScore,
                    correct,
                    total: samples,
                    duration_seconds: duration,
                    status: "complete"
                  };
                } else if (event.type === "error") {
                  throw new Error(event.data?.error || event.data?.message || "Unknown error");
                }
              } catch (parseError) {
                // Ignore JSON parse errors for partial data
                if (parseError instanceof SyntaxError) continue;
                throw parseError;
              }
            }
          }
        }
      } finally {
        // Always release the reader lock
        reader.releaseLock();
      }

      // If we exit the loop without a complete event, treat as success with last known state
      const duration = (Date.now() - startTime) / 1000;
      return {
        model,
        provider,
        score: finalScore,
        correct,
        total: samples,
        duration_seconds: duration,
        status: "complete"
      };
    } catch (error) {
      // Check if this was an abort
      if (signal?.aborted) {
        setModelProgress(prev => ({
          ...prev,
          [key]: { current: 0, total: samples, score: 0, status: "cancelled" }
        }));
        return { model, provider, score: 0, correct: 0, total: samples, duration_seconds: 0, status: "cancelled" };
      }

      const duration = (Date.now() - startTime) / 1000;
      setModelProgress(prev => ({
        ...prev,
        [key]: { current: 0, total: samples, score: 0, status: "error", duration_seconds: duration }
      }));
      return {
        model,
        provider,
        score: 0,
        correct: 0,
        total: samples,
        duration_seconds: duration,
        status: "error",
        error: String(error)
      };
    }
  }, [benchmark.id, samples, seed, epochs, selectedProvider]);

  const handleRun = async () => {
    if (comparisonMode === "models" && selectedModels.length === 0) return;
    if (comparisonMode === "providers" && selectedProviders.length === 0) return;

    // Create new AbortController for this run
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsRunning(true);
    setModelProgress({});
    setError(null); // Clear any previous errors
    runStartTimeRef.current = {};

    let results: Array<{
      model: string;
      provider: string;
      score: number;
      correct: number;
      total: number;
      duration_seconds: number;
      status: string;
      error?: string;
    }>;

    try {
      if (comparisonMode === "models") {
        // Run multiple models on the same provider in parallel
        results = await Promise.all(
          selectedModels.map(model => runModelBenchmark(model, selectedProvider, undefined, signal))
        );
      } else {
        // Run same model across multiple providers in parallel
        results = await Promise.all(
          selectedProviders.map(provider => runModelBenchmark(singleModel, provider, provider, signal))
        );
      }

      // Filter out cancelled results
      results = results.filter(r => r.status !== "cancelled");

      if (results.length > 0) {
        // Save run to localStorage for persistence
        const runId = `${benchmark.id}_${Date.now()}`;
        const successfulResults = results.filter(r => r.status === "complete");
        const bestResult = successfulResults.sort((a, b) => b.score - a.score)[0];

        const runData = {
          id: runId,
          benchmark: benchmark.id,
          timestamp: new Date().toISOString(),
          config: {
            samples,
            seed: seed || null,
            epochs,
            comparisonMode,
            provider: comparisonMode === "models" ? selectedProvider : null,
          },
          results: results.map(r => ({
            model: r.model,
            provider: r.provider,
            score: r.score,
            correct: r.correct,
            total: r.total,
            duration_seconds: r.duration_seconds,
            status: r.status,
          })),
          summary: {
            total_models: results.length,
            successful: successfulResults.length,
            best_score: bestResult?.score || 0,
            best_model: bestResult?.model || "",
          },
        };

        saveRunToStorage(runData);

        // Check for failed models and show error notification
        const failedResults = results.filter(r => r.status === "error");
        if (failedResults.length > 0) {
          const failedModels = failedResults.map(r => r.model.split("/")[1] || r.model);
          setError({
            message: `${failedResults.length} model${failedResults.length > 1 ? "s" : ""} failed`,
            details: `Failed: ${failedModels.join(", ")}`,
          });
        }

        // Navigate to results using Next.js router
        setTimeout(() => {
          router.push(`/benchmarks/results?run=${runId}`);
        }, 1000);
      }
    } catch (err) {
      console.error("Run failed:", err);
      setError({
        message: "Benchmark run failed",
        details: err instanceof Error ? err.message : "An unexpected error occurred",
      });
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  // Cancel running benchmarks
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
  };

  const completedCount = Object.values(modelProgress).filter(p => p.status === "complete").length;
  const totalToRun = comparisonMode === "models" ? selectedModels.length : selectedProviders.length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="presentation">
      <div
        ref={modalRef}
        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-config-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-[var(--border)]">
          <div>
            <h2 id="run-config-title" className="text-xl font-bold text-[var(--text-primary)]">
              Run {benchmark.name}
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {comparisonMode === "models"
                ? selectedModels.length > 1
                  ? `Compare ${selectedModels.length} models via ${PROVIDERS.find(p => p.id === selectedProvider)?.name}`
                  : "Configure and start the benchmark"
                : `Compare ${singleModel.split("/")[1]} across ${selectedProviders.length} providers`}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-2 hover:bg-[var(--surface-elevated)] rounded-lg transition-colors disabled:opacity-50"
            aria-label="Close configuration modal"
          >
            <X className="w-5 h-5 text-[var(--text-muted)]" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Comparison Mode Toggle */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              <Layers className="w-4 h-4 inline mr-1" />
              Comparison Mode
            </label>
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
              <button
                onClick={() => setComparisonMode("models")}
                disabled={isRunning}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  comparisonMode === "models"
                    ? "bg-[var(--signal-blue)] text-white"
                    : "bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]"
                } disabled:opacity-50`}
              >
                Compare Models
              </button>
              <button
                onClick={() => setComparisonMode("providers")}
                disabled={isRunning}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  comparisonMode === "providers"
                    ? "bg-[var(--signal-blue)] text-white"
                    : "bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]"
                } disabled:opacity-50`}
              >
                Compare Providers
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {comparisonMode === "models"
                ? "Run different models through the same provider"
                : "Run the same model through different providers to compare latency/reliability"}
            </p>
          </div>

          {comparisonMode === "models" ? (
            <>
              {/* Provider Selection (single) */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  <Server className="w-4 h-4 inline mr-1" />
                  Provider
                </label>
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  disabled={isRunning}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--signal-blue)] disabled:opacity-50"
                >
                  {PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} - {provider.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Model Selection - Multi-select by Category */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-[var(--text-secondary)]">
                    Models ({selectedModels.length} of {commonModels.length} selected)
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      disabled={isRunning}
                      className="text-xs text-[var(--signal-blue)] hover:underline disabled:opacity-50"
                    >
                      Select All
                    </button>
                    <span className="text-[var(--text-muted)]">|</span>
                    <button
                      onClick={selectNone}
                      disabled={isRunning}
                      className="text-xs text-[var(--signal-blue)] hover:underline disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] max-h-64 overflow-y-auto">
                  {Object.entries(modelCategories).map(([category, models]) => (
                    <div key={category} className="border-b border-[var(--border)] last:border-b-0">
                      <div className="px-3 py-2 bg-[var(--surface)] sticky top-0 flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                          {category}
                        </span>
                        <button
                          onClick={() => {
                            const allSelected = models.every(m => selectedModels.includes(m));
                            if (allSelected) {
                              setSelectedModels(prev => prev.filter(m => !models.includes(m)));
                            } else {
                              setSelectedModels(prev => [...new Set([...prev, ...models])]);
                            }
                          }}
                          disabled={isRunning}
                          className="text-xs text-[var(--signal-blue)] hover:underline disabled:opacity-50"
                        >
                          {models.every(m => selectedModels.includes(m)) ? "Deselect" : "Select"} all
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1 p-2">
                        {models.map((model) => (
                          <label
                            key={model}
                            className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                              selectedModels.includes(model)
                                ? "bg-[var(--signal-blue-dim)]"
                                : "hover:bg-[var(--surface)]"
                            } ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedModels.includes(model)}
                              onChange={() => toggleModel(model)}
                              disabled={isRunning}
                              className="rounded border-[var(--border)] text-[var(--signal-blue)] focus:ring-[var(--signal-blue)]"
                            />
                            <span className="text-sm text-[var(--text-primary)] truncate">
                              {model.split("/")[1]}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedModels.length > 1 && (
                  <p className="text-xs text-[var(--signal-green)] mt-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Running {selectedModels.length} models in parallel via {PROVIDERS.find(p => p.id === selectedProvider)?.name}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Single Model Selection with Categories */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Model to Compare
                </label>
                <select
                  value={singleModel}
                  onChange={(e) => setSingleModel(e.target.value)}
                  disabled={isRunning}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--signal-blue)] disabled:opacity-50"
                >
                  {Object.entries(modelCategories).map(([category, models]) => (
                    <optgroup key={category} label={category}>
                      {models.map((model) => (
                        <option key={model} value={model}>
                          {model.split("/")[1]}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Provider Selection - Multi-select */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-[var(--text-secondary)]">
                    <Server className="w-4 h-4 inline mr-1" />
                    Providers ({selectedProviders.length} selected)
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllProviders}
                      disabled={isRunning}
                      className="text-xs text-[var(--signal-blue)] hover:underline disabled:opacity-50"
                    >
                      Select All
                    </button>
                    <span className="text-[var(--text-muted)]">|</span>
                    <button
                      onClick={selectNoProviders}
                      disabled={isRunning}
                      className="text-xs text-[var(--signal-blue)] hover:underline disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="space-y-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
                  {PROVIDERS.map((provider) => (
                    <label
                      key={provider.id}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                        selectedProviders.includes(provider.id)
                          ? "bg-[var(--signal-blue-dim)]"
                          : "hover:bg-[var(--surface)]"
                      } ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProviders.includes(provider.id)}
                        onChange={() => toggleProvider(provider.id)}
                        disabled={isRunning}
                        className="rounded border-[var(--border)] text-[var(--signal-blue)] focus:ring-[var(--signal-blue)]"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {provider.name}
                        </span>
                        <p className="text-xs text-[var(--text-muted)]">
                          {provider.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedProviders.length > 1 && (
                  <p className="text-xs text-[var(--signal-green)] mt-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Comparing {singleModel.split("/")[1]} across {selectedProviders.length} providers in parallel
                  </p>
                )}
              </div>
            </>
          )}

          {/* Samples */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              <Target className="w-4 h-4 inline mr-1" />
              Samples
            </label>
            <input
              type="number"
              value={samples}
              onChange={(e) => setSamples(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={isRunning}
              min={1}
              max={1000}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--signal-blue)] disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Seed */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                <Hash className="w-4 h-4 inline mr-1" />
                Seed (optional)
              </label>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                disabled={isRunning}
                placeholder="Random"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--signal-blue)] disabled:opacity-50"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">For reproducibility</p>
            </div>

            {/* Epochs */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                <Repeat className="w-4 h-4 inline mr-1" />
                Epochs
              </label>
              <input
                type="number"
                value={epochs}
                onChange={(e) => setEpochs(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={isRunning}
                min={1}
                max={10}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--signal-blue)] disabled:opacity-50"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">For variance analysis</p>
            </div>
          </div>

          {/* Cost Estimate */}
          <div className="p-4 rounded-lg bg-[var(--surface-elevated)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[var(--signal-green)]" />
              <span className="text-sm text-[var(--text-secondary)]">Estimated Cost</span>
            </div>
            <span className="text-lg font-bold text-[var(--signal-green)]">
              ${estimatedCost.toFixed(4)}
            </span>
          </div>

          {epochs > 1 && (
            <p className="text-xs text-[var(--text-muted)] text-center">
              {samples} samples × {epochs} epochs = {totalSamples} total per model
            </p>
          )}

          {selectedModels.length > 1 && (
            <p className="text-xs text-[var(--text-muted)] text-center">
              {selectedModels.length} models × {totalSamples} samples = {selectedModels.length * totalSamples} total evaluations
            </p>
          )}

          {/* Progress Tracking */}
          {isRunning && Object.keys(modelProgress).length > 0 && (
            <div className="space-y-3 p-4 rounded-lg bg-[var(--surface-elevated)]">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">
                  {comparisonMode === "models"
                    ? `Running ${selectedModels.length} models in parallel`
                    : `Comparing across ${selectedProviders.length} providers`}
                </span>
                <span className="text-[var(--signal-green)]">
                  {completedCount}/{totalToRun} complete
                </span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(comparisonMode === "models" ? selectedModels : selectedProviders).map((key) => {
                  const progress = modelProgress[key];
                  const pct = progress ? (progress.current / progress.total) * 100 : 0;
                  const displayName = comparisonMode === "models"
                    ? key.split("/")[1]
                    : PROVIDERS.find(p => p.id === key)?.name || key;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-secondary)] truncate max-w-[200px]">
                          {displayName}
                        </span>
                        <span className={
                          progress?.status === "complete" ? "text-[var(--signal-green)]" :
                          progress?.status === "error" ? "text-[var(--signal-red)]" :
                          "text-[var(--text-muted)]"
                        }>
                          {progress?.status === "complete" ? `${(progress.score * 100).toFixed(1)}%` :
                           progress?.status === "error" ? "Error" :
                           progress ? `${progress.current}/${progress.total}` : "Waiting..."}
                        </span>
                      </div>
                      <div className="h-1.5 bg-[var(--surface)] rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            progress?.status === "complete" ? "bg-[var(--signal-green)]" :
                            progress?.status === "error" ? "bg-[var(--signal-red)]" :
                            "bg-[var(--signal-blue)]"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-[var(--border)]">
          <button
            onClick={isRunning ? handleCancel : onClose}
            className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors"
          >
            {isRunning ? "Stop" : "Cancel"}
          </button>
          <button
            onClick={handleRun}
            disabled={isRunning || (comparisonMode === "models" ? selectedModels.length === 0 : selectedProviders.length === 0)}
            className="px-4 py-2 rounded-lg bg-[var(--signal-blue)] text-white hover:opacity-90 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {comparisonMode === "models"
                  ? `Running ${selectedModels.length} model${selectedModels.length > 1 ? "s" : ""}...`
                  : `Comparing ${selectedProviders.length} provider${selectedProviders.length > 1 ? "s" : ""}...`}
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                {comparisonMode === "models"
                  ? selectedModels.length > 1
                    ? `Compare ${selectedModels.length} Models`
                    : "Start Benchmark"
                  : selectedProviders.length > 1
                    ? `Compare ${selectedProviders.length} Providers`
                    : "Start Benchmark"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Notification */}
      {error && (
        <ErrorNotification
          message={error.message}
          details={error.details}
          onDismiss={() => setError(null)}
        />
      )}
    </div>
  );
}
