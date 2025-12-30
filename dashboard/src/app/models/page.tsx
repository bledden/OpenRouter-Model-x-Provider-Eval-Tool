"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Brain,
  Code,
  Calculator,
  BookOpen,
  ListChecks,
  Bot,
  Trophy,
  ChevronRight,
  Sparkles,
  DollarSign,
  Zap,
  Info,
  Play,
  Loader2,
  MessageSquare,
  Feather,
  Eye,
  Shield,
  FileText,
  Theater,
  Database,
  User,
  HelpCircle,
  TrendingUp,
} from "lucide-react";
import { useModels, Model } from "@/hooks/useModels";
import { useBenchmarks } from "@/hooks/useBenchmarks";
import { CapabilityOverrideModal } from "@/components/CapabilityOverrideModal";
import { getUserCapabilityOverrides, Capability } from "@/lib/capability-overrides";
import { Settings2 } from "lucide-react";
import { getModelScores, getMultiCategoryScore, getModelCountForCategory, getStoredLatency } from "@/lib/eval-storage";

const useCaseIcons: Record<string, React.ReactNode> = {
  coding: <Code className="w-5 h-5" />,
  reasoning: <Brain className="w-5 h-5" />,
  math: <Calculator className="w-5 h-5" />,
  knowledge: <BookOpen className="w-5 h-5" />,
  instruction: <ListChecks className="w-5 h-5" />,
  agentic: <Bot className="w-5 h-5" />,
  conversation: <MessageSquare className="w-5 h-5" />,
  creative: <Feather className="w-5 h-5" />,
  roleplay: <Theater className="w-5 h-5" />,
  "long-context": <FileText className="w-5 h-5" />,
  vision: <Eye className="w-5 h-5" />,
  safety: <Shield className="w-5 h-5" />,
};

interface ModelWithScore extends Model {
  overallScore: number;
  useCaseScore: number | null;
  combinedScore: number | null;
  scoreBreakdown: Record<string, number>;
  scoreSource: "user" | "baseline" | "heuristic";
  estimatedLatency: number;
}

// Fallback heuristic score when no real data exists
function estimateHeuristicScore(model: Model): number {
  let score = 65; // Lower base score for heuristic

  // Major providers tend to have higher quality
  const topProviders = ["anthropic", "openai", "google", "deepseek", "meta-llama"];
  if (topProviders.includes(model.provider)) {
    score += 8;
  }

  // Larger context = generally more capable
  if (model.contextLength >= 128000) score += 3;
  else if (model.contextLength >= 32000) score += 2;

  // More capabilities = more versatile
  score += Math.min(model.capabilities.length * 1, 5);

  // Flagship model indicators
  const name = model.name.toLowerCase();
  if (name.includes("opus") || name.includes("pro") || name.includes("large")) score += 2;
  if (name.includes("405b") || name.includes("405")) score += 4;

  // Cap at 85 for heuristic (real data should always be higher priority)
  return Math.min(Math.round(score * 10) / 10, 85);
}

// Get actual score from eval data, with fallback to heuristic
function getModelScore(
  model: Model,
  useCase: string | null
): { score: number; source: "user" | "baseline" | "heuristic"; useCaseScore: number | null } {
  const modelScores = getModelScores(model.id, model.capabilities);

  if (useCase && modelScores.useCaseScores[useCase]) {
    return {
      score: modelScores.overallScore,
      useCaseScore: modelScores.useCaseScores[useCase].score,
      source: modelScores.useCaseScores[useCase].source,
    };
  }

  // If we have real data, use it
  if (modelScores.scoreSource !== "heuristic") {
    return {
      score: modelScores.overallScore,
      useCaseScore: useCase ? modelScores.useCaseScores[useCase]?.score || null : null,
      source: modelScores.scoreSource,
    };
  }

  // Fallback to heuristic
  return {
    score: estimateHeuristicScore(model),
    useCaseScore: null,
    source: "heuristic",
  };
}

// Estimate latency based on model size indicators
function estimateLatency(model: Model): number {
  const id = model.id.toLowerCase();

  // Very large models
  if (id.includes("405b") || id.includes("opus")) return 2500;
  if (id.includes("70b") || id.includes("72b") || id.includes("large")) return 1200;
  if (id.includes("claude-3") || id.includes("gpt-4")) return 1000;

  // Medium models
  if (id.includes("35b") || id.includes("32b") || id.includes("sonnet")) return 800;
  if (id.includes("8b") || id.includes("7b") || id.includes("mini") || id.includes("flash")) return 400;

  // Small/fast models
  if (id.includes("haiku") || id.includes("instant") || id.includes("nano")) return 200;

  return 600; // Default
}

export default function ModelsPage() {
  const { models, loading: modelsLoading } = useModels({ limit: 500 });
  const { useCases, benchmarks } = useBenchmarks();
  const [selectedUseCases, setSelectedUseCases] = useState<Set<string>>(new Set());
  const [prioritize, setPrioritize] = useState<"quality" | "cost" | "speed" | "value">("quality");
  const [showAll, setShowAll] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelWithScore | null>(null);
  const [userOverrides, setUserOverrides] = useState<Record<string, Capability[]>>({});

  // Helper functions for multi-select
  const toggleUseCase = (useCaseId: string) => {
    setSelectedUseCases(prev => {
      const next = new Set(prev);
      if (next.has(useCaseId)) {
        next.delete(useCaseId);
      } else {
        next.add(useCaseId);
      }
      return next;
    });
  };

  const selectAllUseCases = () => {
    setSelectedUseCases(new Set(useCases.slice(0, 12).map(u => u.id)));
  };

  const clearUseCases = () => {
    setSelectedUseCases(new Set());
  };

  const selectedUseCasesArray = Array.from(selectedUseCases);

  // Load user overrides on mount
  useEffect(() => {
    setUserOverrides(getUserCapabilityOverrides());
  }, []);

  // Transform and score models using real eval data when available
  const scoredModels: ModelWithScore[] = useMemo(() => {
    return models.map((model) => {
      // For single selection, use the first selected item
      const singleUseCase = selectedUseCasesArray.length === 1 ? selectedUseCasesArray[0] : null;
      const scoreData = getModelScore(model, singleUseCase);

      // Calculate combined score for multi-selection
      let combinedScore: number | null = null;
      let scoreBreakdown: Record<string, number> = {};
      let combinedSource = scoreData.source;

      if (selectedUseCasesArray.length > 1) {
        const combined = getMultiCategoryScore(model.id, selectedUseCasesArray, model.capabilities);
        if (combined) {
          combinedScore = combined.score;
          scoreBreakdown = combined.breakdown;
          combinedSource = combined.source;
        }
      }

      return {
        ...model,
        overallScore: scoreData.score,
        useCaseScore: scoreData.useCaseScore,
        combinedScore,
        scoreBreakdown,
        scoreSource: selectedUseCasesArray.length > 1 ? combinedSource : scoreData.source,
        estimatedLatency: estimateLatency(model),
      };
    });
  }, [models, selectedUseCasesArray]);

  // Filter and sort models based on use case and priority
  const sortedModels = useMemo(() => {
    let filtered = [...scoredModels];

    // Filter by use case capabilities (any of the selected use cases)
    if (selectedUseCasesArray.length > 0) {
      const selectedUseCaseObjects = useCases.filter(u => selectedUseCases.has(u.id));
      const allRequiredCaps = selectedUseCaseObjects.flatMap(u => u.requiredCapabilities);
      const uniqueCaps = [...new Set(allRequiredCaps)];

      if (uniqueCaps.length > 0) {
        filtered = filtered.filter((model) =>
          uniqueCaps.some((cap) => model.capabilities.includes(cap))
        );
      }
    }

    // Sort based on priority
    filtered.sort((a, b) => {
      // Helper to get the appropriate score based on selection
      const getScore = (model: ModelWithScore) => {
        if (selectedUseCasesArray.length > 1) {
          return model.combinedScore ?? model.overallScore;
        } else if (selectedUseCasesArray.length === 1) {
          return model.useCaseScore ?? model.overallScore;
        }
        return model.overallScore;
      };

      switch (prioritize) {
        case "quality":
        case "speed":
          // Speed falls back to quality sorting since we don't have real latency data
          // Users need to run evals to get actual latency measurements
          const aScore = getScore(a);
          const bScore = getScore(b);
          // Prioritize models with real data over heuristics
          if (a.scoreSource !== "heuristic" && b.scoreSource === "heuristic") return -1;
          if (b.scoreSource !== "heuristic" && a.scoreSource === "heuristic") return 1;
          return bScore - aScore;
        case "cost":
          return a.pricing.input - b.pricing.input;
        case "value":
          // Price-to-performance: score / price (higher is better value)
          // Uses average of input+output pricing for fairness
          const aValueScore = getScore(a);
          const bValueScore = getScore(b);
          const aAvgPrice = (a.pricing.input + a.pricing.output) / 2;
          const bAvgPrice = (b.pricing.input + b.pricing.output) / 2;
          // Avoid division by zero - free models get max value
          const aValue = aAvgPrice > 0 ? aValueScore / aAvgPrice : aValueScore * 1000;
          const bValue = bAvgPrice > 0 ? bValueScore / bAvgPrice : bValueScore * 1000;
          // Prioritize models with real data over heuristics
          if (a.scoreSource !== "heuristic" && b.scoreSource === "heuristic") return -1;
          if (b.scoreSource !== "heuristic" && a.scoreSource === "heuristic") return 1;
          return bValue - aValue;
        default:
          return 0;
      }
    });

    return showAll ? filtered : filtered.slice(0, 50);
  }, [scoredModels, selectedUseCasesArray, selectedUseCases, useCases, prioritize, showAll]);

  if (modelsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--signal-blue)] mx-auto mb-4" />
          <p className="text-[var(--text-muted)]">Loading models from OpenRouter...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-in stagger-1">
        <div className="flex items-center gap-3 mb-2">
          <Brain className="w-8 h-8 text-[var(--signal-green)]" />
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Model Evaluation
          </h1>
        </div>
        <p className="text-[var(--text-secondary)] text-lg">
          Find the best model for your specific use case ({models.length} models available)
        </p>
      </div>

      {/* Question Banner */}
      <div className="card card-glow p-6 bg-gradient-to-r from-[var(--signal-green-dim)] to-transparent animate-in stagger-2">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--signal-green)] flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-[var(--void)]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              &quot;What&apos;s the best model for my use case?&quot;
            </h2>
            <p className="text-[var(--text-secondary)]">
              Select your use case and priorities to get personalized recommendations
            </p>
          </div>
        </div>
      </div>

      {/* Use Case Selection */}
      <div className="animate-in stagger-3">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            What will you use the model for?
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--text-secondary)]">
              {selectedUseCases.size} of {useCases.slice(0, 12).length} selected
            </span>
            <button
              onClick={selectAllUseCases}
              className="text-sm text-[var(--signal-blue)] hover:text-[var(--text-primary)] transition-colors"
            >
              Select All
            </button>
            <button
              onClick={clearUseCases}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              disabled={selectedUseCases.size === 0}
            >
              Clear
            </button>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-3">
          {useCases.slice(0, 12).map((useCase) => {
            const isSelected = selectedUseCases.has(useCase.id);
            return (
              <button
                key={useCase.id}
                onClick={() => toggleUseCase(useCase.id)}
                className={`card p-4 text-center transition-all duration-200 hover:border-[var(--border-accent)] relative ${
                  isSelected
                    ? "border-[var(--signal-blue)] bg-[var(--signal-blue-dim)]"
                    : ""
                }`}
              >
                {/* Checkbox indicator */}
                <div
                  className={`absolute top-2 right-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-[var(--signal-blue)] border-[var(--signal-blue)]"
                      : "border-[var(--border)] bg-transparent"
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div
                  className={`w-10 h-10 rounded-lg mx-auto mb-3 flex items-center justify-center ${
                    isSelected
                      ? "bg-[var(--signal-blue)] text-[var(--void)]"
                      : "bg-[var(--surface-elevated)] text-[var(--text-muted)]"
                  }`}
                >
                  {useCaseIcons[useCase.id] || <Brain className="w-5 h-5" />}
                </div>
                <div className="font-medium text-sm text-[var(--text-primary)]">
                  {useCase.name}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {getModelCountForCategory(useCase.id)} models ranked
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Priority Selection */}
      <div className="card p-6 animate-in stagger-4">
        <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
          What&apos;s most important to you?
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <PriorityCard
            selected={prioritize === "quality"}
            onSelect={() => setPrioritize("quality")}
            icon={<Trophy className="w-6 h-6" />}
            title="Best Quality"
            description="Highest capability scores, most accurate responses"
            gradient="from-[var(--signal-green)] to-[var(--signal-blue)]"
          />
          <PriorityCard
            selected={prioritize === "cost"}
            onSelect={() => setPrioritize("cost")}
            icon={<DollarSign className="w-6 h-6" />}
            title="Lowest Cost"
            description="Most affordable option, best value for money"
            gradient="from-[var(--signal-amber)] to-[var(--signal-green)]"
          />
          <PriorityCard
            selected={prioritize === "speed"}
            onSelect={() => setPrioritize("speed")}
            icon={<Zap className="w-6 h-6" />}
            title="Fastest Response"
            description="Run evals to measure latency"
            gradient="from-[var(--signal-blue)] to-[var(--signal-purple)]"
          />
          <PriorityCard
            selected={prioritize === "value"}
            onSelect={() => setPrioritize("value")}
            icon={<TrendingUp className="w-6 h-6" />}
            title="Best Value"
            description="Highest quality per dollar spent"
            gradient="from-[var(--signal-purple)] to-[var(--signal-green)]"
          />
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-5 gap-6">
        {/* Model Rankings */}
        <div className="col-span-4 animate-in stagger-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                Model Rankings{" "}
                {selectedUseCasesArray.length > 1 ? (
                  <span className="text-[var(--signal-blue)]">
                    Combined ({selectedUseCasesArray.length})
                  </span>
                ) : selectedUseCasesArray.length === 1 ? (
                  `for ${useCases.find((u) => u.id === selectedUseCasesArray[0])?.name}`
                ) : null}
              </h3>
              <span className="text-sm text-[var(--text-muted)]">
                Showing {sortedModels.length} of {scoredModels.length} models
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                  className="rounded border-[var(--border)]"
                />
                Show All
              </label>
              <button className="btn-secondary flex items-center gap-2">
                <Play className="w-4 h-4" />
                Run Custom Benchmark
              </button>
            </div>
          </div>

          {sortedModels.length > 0 ? (
            <div className="space-y-3">
              {sortedModels.map((model, index) => {
                const isTop = index === 0;
                return (
                  <div
                    key={model.id}
                    className={`card p-5 ${
                      isTop ? "border-[var(--signal-green)] border-opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center">
                      {/* Rank & Model Info */}
                      <div className="flex items-center gap-3 w-[300px] flex-shrink-0">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono text-lg font-bold flex-shrink-0 ${
                            isTop
                              ? "bg-[var(--signal-green-dim)] text-[var(--signal-green)]"
                              : index === 1
                              ? "bg-[var(--signal-blue-dim)] text-[var(--signal-blue)]"
                              : index === 2
                              ? "bg-[var(--signal-amber-dim)] text-[var(--signal-amber)]"
                              : "bg-[var(--surface-elevated)] text-[var(--text-muted)]"
                          }`}
                        >
                          {isTop ? <Trophy className="w-5 h-5" /> : `#${index + 1}`}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div
                            className="font-semibold text-[var(--text-primary)] truncate cursor-default"
                            title={model.name}
                          >
                            {model.name}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {model.provider} · {(model.contextLength / 1000).toFixed(0)}K context
                          </div>
                        </div>
                      </div>

                      {/* Divider after model name */}
                      <div className="w-px h-8 bg-[var(--border)] mx-4 flex-shrink-0" />

                      {/* Metrics with dividers - spread across remaining space */}
                      <div className="flex items-center flex-1 justify-between">

                        {/* Score with source indicator */}
                        <div className="text-center group relative px-2">
                          {(() => {
                            // Determine which score to display
                            const displayScore = selectedUseCasesArray.length > 1
                              ? (model.combinedScore ?? model.overallScore)
                              : selectedUseCasesArray.length === 1
                              ? (model.useCaseScore ?? model.overallScore)
                              : model.overallScore;

                            return (
                              <>
                                <div className="flex items-center justify-center gap-0.5">
                                  <div
                                    className={`font-mono text-xl font-bold ${
                                      displayScore >= 90
                                        ? "text-[var(--signal-green)]"
                                        : displayScore >= 80
                                        ? "text-[var(--signal-blue)]"
                                        : displayScore >= 70
                                        ? "text-[var(--signal-amber)]"
                                        : "text-[var(--text-muted)]"
                                    }`}
                                  >
                                    {displayScore.toFixed(1)}
                                  </div>
                                  {/* Score source indicator */}
                                  <div
                                    className={`p-0.5 rounded ${
                                      model.scoreSource === "user"
                                        ? "text-[var(--signal-green)]"
                                        : model.scoreSource === "baseline"
                                        ? "text-[var(--signal-blue)]"
                                        : "text-[var(--text-muted)] opacity-50"
                                    }`}
                                    title={
                                      model.scoreSource === "user"
                                        ? "Score from your eval runs"
                                        : model.scoreSource === "baseline"
                                        ? "Score from published benchmarks"
                                        : "Estimated (no eval data)"
                                    }
                                  >
                                    {model.scoreSource === "user" ? (
                                      <User className="w-3 h-3" />
                                    ) : model.scoreSource === "baseline" ? (
                                      <Database className="w-3 h-3" />
                                    ) : (
                                      <HelpCircle className="w-3 h-3" />
                                    )}
                                  </div>
                                </div>
                                <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[80px]">
                                  {selectedUseCasesArray.length > 1
                                    ? "Combined"
                                    : selectedUseCasesArray.length === 1
                                    ? useCases.find((u) => u.id === selectedUseCasesArray[0])?.primaryBenchmarkName || "Score"
                                    : "Overall"}
                                </div>
                                {/* Breakdown tooltip for combined scores */}
                                {selectedUseCasesArray.length > 1 && Object.keys(model.scoreBreakdown).length > 0 && (
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                                    <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg p-3 shadow-lg min-w-[140px]">
                                      <div className="text-xs font-medium text-[var(--text-primary)] mb-2">Score Breakdown</div>
                                      {Object.entries(model.scoreBreakdown).map(([useCase, score]) => (
                                        <div key={useCase} className="flex justify-between text-xs text-[var(--text-secondary)] py-0.5">
                                          <span className="capitalize">{useCase}</span>
                                          <span className="font-mono">{score.toFixed(1)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        {/* Divider */}
                        <div className="w-px h-8 bg-[var(--border)] mx-3" />

                        {/* Capabilities */}
                        <div className="flex items-center gap-1">
                          {(userOverrides[model.id] || model.capabilities).slice(0, 2).map((cap) => (
                            <span
                              key={cap}
                              className={`px-1.5 py-0.5 text-[10px] rounded whitespace-nowrap ${
                                userOverrides[model.id]
                                  ? "bg-[var(--signal-blue-dim)] text-[var(--signal-blue)]"
                                  : "bg-[var(--surface-elevated)] text-[var(--text-muted)]"
                              }`}
                            >
                              {cap}
                            </span>
                          ))}
                          {(userOverrides[model.id] || model.capabilities).length > 2 && (
                            <span className="text-[10px] text-[var(--text-muted)]">
                              +{(userOverrides[model.id] || model.capabilities).length - 2}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingModel(model);
                            }}
                            className="p-0.5 hover:bg-[var(--surface-hover)] rounded transition-colors"
                            title="Edit capabilities"
                          >
                            <Settings2 className="w-3 h-3 text-[var(--text-muted)]" />
                          </button>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-8 bg-[var(--border)] mx-2" />

                        {/* Price */}
                        <div className="text-center">
                          <div className="font-mono text-sm text-[var(--signal-green)]">
                            ${model.pricing.input.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">$/M</div>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-8 bg-[var(--border)] mx-2" />

                        {/* Latency - shows measured data if available */}
                        <div className="text-center group relative">
                          {(() => {
                            const storedLatency = getStoredLatency(model.id);
                            if (storedLatency) {
                              const avgMs = Math.round(storedLatency.avgPerQuestion);
                              return (
                                <>
                                  <div className="font-mono text-sm text-[var(--text-primary)]">
                                    {avgMs}ms
                                  </div>
                                  <div className="text-[10px] text-[var(--text-muted)]">Measured</div>
                                  {/* Tooltip with details */}
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                                    <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg p-2 shadow-lg whitespace-nowrap text-xs">
                                      <div className="text-[var(--text-muted)]">From {storedLatency.benchmark} eval</div>
                                      <div className="text-[var(--text-secondary)]">
                                        {new Date(storedLatency.timestamp).toLocaleDateString()}
                                      </div>
                                    </div>
                                  </div>
                                </>
                              );
                            }
                            return (
                              <>
                                <div className="text-xs text-[var(--text-muted)]">
                                  —
                                </div>
                                <div className="text-[10px] text-[var(--text-muted)]">Latency</div>
                              </>
                            );
                          })()}
                        </div>

                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card p-8 text-center text-[var(--text-muted)]">
              No models match the selected criteria
            </div>
          )}
        </div>

        {/* Recommendation Sidebar */}
        <div className="space-y-4 animate-in stagger-5">
          {/* Top Performers - shows top 3 from actual rankings */}
          {sortedModels.length > 0 && (
            <div className="card card-glow p-6">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-[var(--signal-green)]" />
                <h3 className="font-semibold text-[var(--text-primary)]">
                  Top {prioritize === "quality" ? "Quality" : prioritize === "cost" ? "Value" : "Speed"}
                  {selectedUseCasesArray.length > 1 ? (
                    <span className="text-[var(--signal-blue)] ml-1">(Combined)</span>
                  ) : selectedUseCasesArray.length === 1 ? (
                    ` for ${useCases.find((u) => u.id === selectedUseCasesArray[0])?.name}`
                  ) : null}
                </h3>
              </div>

              <div className="space-y-3">
                {sortedModels.slice(0, 3).map((model, index) => {
                  const score = selectedUseCasesArray.length > 1
                    ? (model.combinedScore ?? model.overallScore)
                    : selectedUseCasesArray.length === 1 && model.useCaseScore !== null
                    ? model.useCaseScore
                    : model.overallScore;
                  const rankColors = [
                    "text-[var(--signal-green)] bg-[var(--signal-green-dim)]",
                    "text-[var(--signal-blue)] bg-[var(--signal-blue-dim)]",
                    "text-[var(--signal-amber)] bg-[var(--signal-amber-dim)]",
                  ];
                  return (
                    <div
                      key={model.id}
                      className={`p-3 rounded-lg ${index === 0 ? "bg-[var(--signal-green-dim)] border border-[var(--signal-green)]/30" : "bg-[var(--surface-elevated)]"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${rankColors[index]}`}>
                          {index === 0 ? <Trophy className="w-4 h-4" /> : `#${index + 1}`}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[var(--text-primary)] truncate text-sm">
                            {model.name}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {model.provider}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-mono font-bold ${index === 0 ? "text-[var(--signal-green)]" : "text-[var(--text-primary)]"}`}>
                            {score.toFixed(1)}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {prioritize === "cost"
                              ? `$${model.pricing.input.toFixed(2)}`
                              : prioritize === "speed"
                              ? (() => {
                                  const latency = getStoredLatency(model.id);
                                  return latency ? `${Math.round(latency.avgPerQuestion)}ms` : "Run eval";
                                })()
                              : selectedUseCasesArray.length === 1
                              ? useCases.find((u) => u.id === selectedUseCasesArray[0])?.primaryBenchmarkName?.split(" ")[0] || "Score"
                              : "Score"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Show what metric is being used */}
              <div className="mt-4 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
                {prioritize === "speed" ? (
                  <span className="text-[var(--signal-blue)]">Run evals to measure latency</span>
                ) : (
                  <>Ranked by {prioritize === "quality"
                    ? selectedUseCasesArray.length > 1
                      ? "weighted average of selected categories"
                      : selectedUseCasesArray.length === 1
                      ? useCases.find((u) => u.id === selectedUseCasesArray[0])?.primaryBenchmarkName || "benchmark score"
                      : "overall benchmark score"
                    : "input price per million tokens"}</>
                )}
              </div>
            </div>
          )}

          {/* Use Case Info - show when 1 or more selected */}
          {selectedUseCasesArray.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-5 h-5 text-[var(--signal-blue)]" />
                <h3 className="font-semibold text-[var(--text-primary)]">
                  {selectedUseCasesArray.length === 1
                    ? useCases.find((u) => u.id === selectedUseCasesArray[0])?.name
                    : `${selectedUseCasesArray.length} Categories Selected`}
                </h3>
              </div>

              {selectedUseCasesArray.length === 1 ? (
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  {useCases.find((u) => u.id === selectedUseCasesArray[0])?.description}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {selectedUseCasesArray.map((id) => (
                    <span
                      key={id}
                      className="px-2 py-1 text-xs rounded bg-[var(--signal-blue-dim)] text-[var(--signal-blue)] capitalize"
                    >
                      {id}
                    </span>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  Key Benchmarks
                </div>
                {benchmarks
                  .filter((b) => {
                    const selectedUseCaseObjects = useCases.filter(u => selectedUseCases.has(u.id));
                    const allCaps = selectedUseCaseObjects.flatMap(u => u.requiredCapabilities);
                    return allCaps.some((cap) => b.capabilities.includes(cap));
                  })
                  .slice(0, 5)
                  .map((bench) => (
                    <div
                      key={bench.id}
                      className="text-sm text-[var(--text-secondary)] flex items-center gap-2"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--signal-blue)]" />
                      {bench.name}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Cost Comparison */}
          {sortedModels.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-[var(--text-primary)] mb-4">
                Monthly Cost Estimate
              </h3>
              <div className="text-xs text-[var(--text-muted)] mb-3">
                Based on 10M tokens/month (70% input, 30% output)
              </div>
              <div className="space-y-3">
                {sortedModels.slice(0, 3).map((model, i) => {
                  // Calculate cost with 70/30 input/output ratio (more realistic than 50/50)
                  const inputTokensM = 7; // 7M input tokens
                  const outputTokensM = 3; // 3M output tokens
                  const monthlyCost = (model.pricing.input * inputTokensM) + (model.pricing.output * outputTokensM);
                  return (
                    <div key={model.id} className="flex items-center justify-between">
                      <span className="text-sm text-[var(--text-secondary)] truncate max-w-[120px]">
                        {model.name}
                      </span>
                      <span
                        className={`font-mono text-sm ${
                          i === 0 ? "text-[var(--signal-green)]" : "text-[var(--text-primary)]"
                        }`}
                      >
                        ${monthlyCost.toFixed(0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Capability Override Modal */}
      {editingModel && (
        <CapabilityOverrideModal
          modelId={editingModel.id}
          modelName={editingModel.name}
          detectedCapabilities={editingModel.capabilities}
          onClose={() => setEditingModel(null)}
          onSave={(newCaps) => {
            setUserOverrides((prev) => ({
              ...prev,
              [editingModel.id]: newCaps as Capability[],
            }));
          }}
        />
      )}
    </div>
  );
}

function PriorityCard({
  selected,
  onSelect,
  icon,
  title,
  description,
  gradient,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
}) {
  return (
    <button
      onClick={onSelect}
      className={`card p-5 text-left transition-all duration-200 hover:border-[var(--border-accent)] ${
        selected ? "border-[var(--signal-green)]" : ""
      }`}
    >
      <div
        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 ${
          selected ? "scale-110" : ""
        } transition-transform`}
      >
        <div className="text-[var(--void)]">{icon}</div>
      </div>
      <h4 className="font-semibold text-[var(--text-primary)] mb-1">{title}</h4>
      <p className="text-sm text-[var(--text-muted)]">{description}</p>
      {selected && (
        <div className="mt-3 flex items-center gap-2 text-sm text-[var(--signal-green)]">
          <div className="w-2 h-2 rounded-full bg-[var(--signal-green)]" />
          Selected
        </div>
      )}
    </button>
  );
}
