"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Trophy,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Server,
  Brain,
  Code,
  Calculator,
  BookOpen,
  ListChecks,
  Bot,
  MessageSquare,
  Feather,
  Theater,
  FileText,
  Eye,
  Shield,
  Loader2,
} from "lucide-react";
import { getTopModelsForCategory, hasLimitedData, getStoredLatency } from "@/lib/eval-storage";
import { useCases } from "@/lib/benchmark-config";
import { AlertTriangle } from "lucide-react";
import { useProviders } from "@/hooks/useProviders";
import { useModels } from "@/hooks/useModels";

const categoryIcons: Record<string, React.ReactNode> = {
  coding: <Code className="w-4 h-4" />,
  reasoning: <Brain className="w-4 h-4" />,
  math: <Calculator className="w-4 h-4" />,
  knowledge: <BookOpen className="w-4 h-4" />,
  instruction: <ListChecks className="w-4 h-4" />,
  agentic: <Bot className="w-4 h-4" />,
  conversation: <MessageSquare className="w-4 h-4" />,
  creative: <Feather className="w-4 h-4" />,
  roleplay: <Theater className="w-4 h-4" />,
  "long-context": <FileText className="w-4 h-4" />,
  vision: <Eye className="w-4 h-4" />,
  safety: <Shield className="w-4 h-4" />,
};

// Helper to get benchmark name from useCases
function getBenchmarkName(categoryId: string): string {
  const useCase = useCases.find(u => u.id === categoryId);
  return useCase?.primaryBenchmarkName || "Score";
}

type ViewMode = "eval-spotlight" | "top-providers";

interface EvalSpotlightProps {
  expanded?: boolean;
}

export function EvalSpotlight({ expanded = false }: EvalSpotlightProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("eval-spotlight");
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [selectedModelForProviders, setSelectedModelForProviders] = useState("");

  // Pass selected model to useProviders - it will re-fetch when model changes
  const { providers, loading: providersLoading } = useProviders({
    model: viewMode === "top-providers" ? selectedModelForProviders : undefined,
  });
  const { models, loading: modelsLoading } = useModels({ limit: 100 });

  const categories = useCases.slice(0, 12);
  const currentCategory = categories[currentCategoryIndex];
  const topModels = getTopModelsForCategory(currentCategory.id, expanded ? 5 : 3);

  // Auto-rotation
  useEffect(() => {
    if (viewMode !== "eval-spotlight" || isPaused || isHovered) return;

    const interval = setInterval(() => {
      setCurrentCategoryIndex((prev) => (prev + 1) % categories.length);
    }, 6000);

    return () => clearInterval(interval);
  }, [viewMode, isPaused, isHovered, categories.length]);

  const goToPrevious = useCallback(() => {
    setCurrentCategoryIndex((prev) => (prev - 1 + categories.length) % categories.length);
  }, [categories.length]);

  const goToNext = useCallback(() => {
    setCurrentCategoryIndex((prev) => (prev + 1) % categories.length);
  }, [categories.length]);

  return (
    <div className="card p-6">
      {/* Header with View Toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {viewMode === "eval-spotlight" ? (
            <Trophy className="w-5 h-5 text-[var(--signal-green)]" />
          ) : (
            <Server className="w-5 h-5 text-[var(--signal-blue)]" />
          )}
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {viewMode === "eval-spotlight" ? "Eval Spotlight" : "Top Providers"}
          </h2>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-[var(--surface)] rounded-lg p-1 border border-[var(--border)]">
          <button
            onClick={() => setViewMode("eval-spotlight")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === "eval-spotlight"
                ? "bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            By Eval
          </button>
          <button
            onClick={() => setViewMode("top-providers")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === "top-providers"
                ? "bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            By Provider
          </button>
        </div>
      </div>

      {viewMode === "eval-spotlight" ? (
        <EvalSpotlightView
          currentCategory={currentCategory}
          topModels={topModels}
          currentCategoryIndex={currentCategoryIndex}
          totalCategories={categories.length}
          isPaused={isPaused}
          setIsPaused={setIsPaused}
          setIsHovered={setIsHovered}
          goToPrevious={goToPrevious}
          goToNext={goToNext}
          setCurrentCategoryIndex={setCurrentCategoryIndex}
          expanded={expanded}
        />
      ) : (
        <TopProvidersView
          models={models}
          modelsLoading={modelsLoading}
          providers={providers}
          providersLoading={providersLoading}
          selectedModel={selectedModelForProviders}
          setSelectedModel={setSelectedModelForProviders}
          expanded={expanded}
        />
      )}
    </div>
  );
}

function EvalSpotlightView({
  currentCategory,
  topModels,
  currentCategoryIndex,
  totalCategories,
  isPaused,
  setIsPaused,
  setIsHovered,
  goToPrevious,
  goToNext,
  setCurrentCategoryIndex,
  expanded = false,
}: {
  currentCategory: typeof useCases[0];
  topModels: { modelId: string; score: number; modelName: string }[];
  currentCategoryIndex: number;
  totalCategories: number;
  isPaused: boolean;
  setIsPaused: (v: boolean) => void;
  setIsHovered: (v: boolean) => void;
  goToPrevious: () => void;
  goToNext: () => void;
  setCurrentCategoryIndex: (v: number) => void;
  expanded?: boolean;
}) {
  const isLimitedData = hasLimitedData(currentCategory.id);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Category Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isLimitedData
              ? "bg-[var(--signal-amber-dim)] text-[var(--signal-amber)]"
              : "bg-[var(--signal-green-dim)] text-[var(--signal-green)]"
          }`}>
            {categoryIcons[currentCategory.id] || <Brain className="w-4 h-4" />}
          </div>
          <div>
            <div className="font-medium text-[var(--text-primary)] flex items-center gap-2">
              Top {currentCategory.name}
              {isLimitedData && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--signal-amber-dim)] text-[var(--signal-amber)] flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Limited Data
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              {isLimitedData
                ? "No standardized benchmark available"
                : `Based on ${getBenchmarkName(currentCategory.id)}`}
            </div>
          </div>
        </div>

        {/* Navigation Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="p-1.5 rounded-md hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title={isPaused ? "Resume rotation" : "Pause rotation"}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={goToPrevious}
            className="p-1.5 rounded-md hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToNext}
            className="p-1.5 rounded-md hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Top Models List */}
      <div className="space-y-2 mb-4">
        {topModels.length > 0 ? (
          topModels.map((model, index) => (
            <div
              key={model.modelId}
              className={`flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors ${
                index === 0
                  ? "bg-[var(--signal-green-dim)] border border-[var(--signal-green)]/20"
                  : "bg-[var(--surface-elevated)]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0
                      ? "bg-[var(--signal-green)] text-[var(--void)]"
                      : index === 1
                      ? "bg-[var(--signal-blue-dim)] text-[var(--signal-blue)]"
                      : "bg-[var(--surface-hover)] text-[var(--text-muted)]"
                  }`}
                >
                  {index === 0 ? <Trophy className="w-4 h-4" /> : `#${index + 1}`}
                </div>
                <div>
                  <div className="font-medium text-[var(--text-primary)] text-sm">
                    {model.modelName}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {model.modelId.split("/")[0]}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`font-mono font-bold ${
                    index === 0 ? "text-[var(--signal-green)]" : "text-[var(--text-primary)]"
                  }`}
                >
                  {model.score.toFixed(1)}%
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {getBenchmarkName(currentCategory.id).split(" ")[0]}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-6 text-[var(--text-muted)]">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No verified benchmark data available</p>
            <p className="text-xs mt-1">
              {isLimitedData
                ? "No standardized benchmark exists for this category"
                : "Run evaluations to add data for this category"}
            </p>
          </div>
        )}
      </div>

      {/* Category Dots */}
      <div className="flex items-center justify-center gap-1.5">
        {Array.from({ length: totalCategories }).map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentCategoryIndex(index)}
            className={`w-2 h-2 rounded-full transition-all ${
              index === currentCategoryIndex
                ? "bg-[var(--signal-green)] w-4"
                : "bg-[var(--border)] hover:bg-[var(--border-accent)]"
            }`}
            title={useCases[index]?.name}
          />
        ))}
      </div>
    </div>
  );
}

function TopProvidersView({
  models,
  modelsLoading,
  providers,
  providersLoading,
  selectedModel,
  setSelectedModel,
  expanded = false,
}: {
  models: { id: string; name: string }[];
  modelsLoading: boolean;
  providers: {
    id: string;
    name: string;
    tag?: string;
    status: string;
    uptime: number;
    latencyP50: number;
    latencyP95: number;
    pricing: { input: number; output: number };
  }[];
  providersLoading: boolean;
  selectedModel: string;
  setSelectedModel: (v: string) => void;
  expanded?: boolean;
}) {
  // Filter to models that likely have multiple providers (open models)
  const modelsWithProviders = models.filter((m) => {
    const id = m.id.toLowerCase();
    return (
      id.includes("llama") ||
      id.includes("mixtral") ||
      id.includes("mistral") ||
      id.includes("qwen") ||
      id.includes("gemma") ||
      id.includes("deepseek") ||
      id.includes("yi-") ||
      id.includes("command")
    );
  });

  return (
    <div>
      {/* Model Selector */}
      <div className="mb-4">
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
          Select a model to compare hosting providers
        </label>
        <select
          className="select w-full"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={modelsLoading}
        >
          <option value="">Choose a model...</option>
          {modelsWithProviders.slice(0, 30).map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>

      {/* Providers List */}
      {selectedModel ? (
        providersLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : providers.length > 0 ? (
          <div className="space-y-2">
            {providers.slice(0, expanded ? 8 : 5).map((provider, index) => (
              <div
                key={provider.tag || provider.id}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${
                  index === 0
                    ? "bg-[var(--signal-blue-dim)] border border-[var(--signal-blue)]/20"
                    : "bg-[var(--surface-elevated)]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0
                        ? "bg-[var(--signal-blue)] text-[var(--void)]"
                        : "bg-[var(--surface-hover)] text-[var(--text-muted)]"
                    }`}
                  >
                    {index === 0 ? <Trophy className="w-4 h-4" /> : `#${index + 1}`}
                  </div>
                  <div>
                    <div className="font-medium text-[var(--text-primary)] text-sm">
                      {provider.name}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {provider.tag || provider.id}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-center">
                    <div className="font-mono text-[var(--text-primary)]">
                      {provider.uptime}%
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">Uptime</div>
                  </div>
                  <div className="text-center">
                    {(() => {
                      // Check for stored eval latency first
                      const storedLatency = getStoredLatency(selectedModel, provider.name);
                      if (storedLatency) {
                        return (
                          <>
                            <div className="font-mono text-[var(--text-primary)]">
                              {Math.round(storedLatency.avgPerQuestion)}ms
                            </div>
                            <div className="text-xs text-[var(--text-muted)]">Measured</div>
                          </>
                        );
                      }
                      // Fall back to API-provided latency (if ever available)
                      if (provider.latencyP50 > 0) {
                        return (
                          <>
                            <div className="font-mono text-[var(--text-primary)]">
                              {provider.latencyP50}ms
                            </div>
                            <div className="text-xs text-[var(--text-muted)]">P50</div>
                          </>
                        );
                      }
                      // No data available
                      return (
                        <>
                          <div className="text-xs text-[var(--signal-blue)] italic">
                            Run eval
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">Latency</div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="text-center">
                    <div className="font-mono text-[var(--signal-green)]">
                      ${provider.pricing.input.toFixed(2)}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">$/M in</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-[var(--text-muted)]">
            <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No provider data available for this model</p>
            <p className="text-xs mt-1">This model may only have one hosting provider</p>
          </div>
        )
      ) : (
        <div className="text-center py-8 text-[var(--text-muted)]">
          <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Select a model to see hosting providers</p>
          <p className="text-xs mt-1">Compare uptime, latency, and pricing across providers</p>
        </div>
      )}
    </div>
  );
}
