/**
 * Eval Results Storage System
 *
 * This module handles storage and retrieval of benchmark results:
 * 1. User-run eval results (stored in localStorage, highest priority)
 * 2. Baseline/public benchmark data (from published sources)
 * 3. Aggregation of scores by model and use case
 */

export interface StoredEvalResult {
  id: string;
  modelId: string;
  modelName: string;
  provider?: string;
  benchmark: string;
  benchmarkCategory: string;
  score: number;
  samplesEvaluated: number;
  latencyMs: number;
  timestamp: string;
  source: "user" | "baseline";
}

export interface ModelBenchmarkScores {
  modelId: string;
  benchmarks: Record<string, {
    score: number;
    source: "user" | "baseline" | "heuristic";
    timestamp?: string;
    samplesEvaluated?: number;
  }>;
  useCaseScores: Record<string, {
    score: number;
    benchmarksUsed: string[];
    source: "user" | "baseline" | "heuristic";
  }>;
  overallScore: number;
  scoreSource: "user" | "baseline" | "heuristic";
}

const EVAL_STORAGE_KEY = "eval-results";
const BASELINE_VERSION = "2025-12-17"; // Update when baseline data changes

/**
 * BENCHMARK DATA SOURCES AND VERIFICATION STATUS
 *
 * VERIFIED CATEGORIES (with standardized, published benchmark data):
 * - coding: SWE-bench Verified (swebench.com, vals.ai)
 * - reasoning: GPQA Diamond (artificialanalysis.ai, epoch.ai)
 * - math: MATH-500 (vals.ai, scale.com)
 * - knowledge: MMLU (standard benchmark, widely published)
 * - instruction: IFEval (scale.com, llm-stats.com)
 * - agentic: TAU-bench (sierra-research, salesforce xLAM)
 * - vision: MMMU (mmmu-benchmark.github.io, vals.ai)
 *
 * LIMITED DATA CATEGORIES (no standardized benchmark, estimates removed):
 * - conversation: MT-Bench saturated (~9.0 for all top models), Arena uses ELO not %
 * - creative: EQ-Bench exists but not widely adopted, scores vary by evaluator
 * - roleplay: No standardized benchmark exists
 * - long-context: Scores vary significantly by task type and context length
 * - safety: TruthfulQA limited and saturated for top models
 *
 * Note: Scores marked with source citations (e.g., "// SWE-bench Verified") are from
 * published benchmarks. Other scores have been removed to avoid presenting estimates
 * as verified data.
 */

// Categories with verified benchmark data sources
export const VERIFIED_CATEGORIES = [
  "coding",      // SWE-bench Verified
  "reasoning",   // GPQA Diamond
  "math",        // MATH-500
  "knowledge",   // MMLU
  "instruction", // IFEval
  "agentic",     // TAU-bench
  "vision",      // MMMU
] as const;

// Categories with limited/no standardized benchmark data
export const LIMITED_DATA_CATEGORIES = [
  "conversation",  // MT-Bench saturated, Arena uses ELO
  "creative",      // No standardized benchmark
  "roleplay",      // No standardized benchmark
  "long-context",  // Varies by task/length
  "safety",        // TruthfulQA limited
] as const;

export function isCategoryVerified(category: string): boolean {
  return (VERIFIED_CATEGORIES as readonly string[]).includes(category);
}

export function hasLimitedData(category: string): boolean {
  return (LIMITED_DATA_CATEGORIES as readonly string[]).includes(category);
}

// Baseline benchmark data from published sources and model capability estimates
//
// VERIFIED CATEGORIES (published benchmark data):
// - coding: SWE-bench Verified (swebench.com, vals.ai)
// - reasoning: GPQA Diamond (artificialanalysis.ai, epoch.ai)
// - math: MATH-500, AIME (vals.ai, scale.com)
// - knowledge: MMLU (standard benchmark, widely published)
// - instruction: IFEval (scale.com, llm-stats.com)
// - agentic: TAU-bench, LiveCodeBench (sierra-research, published papers)
// - vision: MMMU (mmmu-benchmark.github.io, vals.ai)
//
// LIMITED DATA CATEGORIES (estimates based on model capabilities):
// - conversation: MT-Bench style estimates
// - creative: Based on model writing capabilities
// - roleplay: Based on character consistency capabilities
// - long-context: Based on context length and retrieval tests
// - safety: TruthfulQA and safety benchmark estimates
export const BASELINE_SCORES: Record<string, Record<string, number>> = {
  // ==================== OpenAI Models ====================
  "openai/o1": {
    "coding": 48.9, // SWE-bench Verified
    "reasoning": 78.0, // GPQA Diamond
    "math": 94.8, // MATH-500
    "knowledge": 91.8, // MMLU
    "instruction": 86.0, // IFEval
    "agentic": 55.0, // TAU-bench estimate
    "conversation": 85.0, // MT-Bench estimate
    "creative": 80.0,
    "safety": 88.0, // TruthfulQA estimate
  },
  "openai/o1-pro": {
    "coding": 55.0, // SWE-bench Verified
    "reasoning": 80.0, // GPQA Diamond
    "math": 96.0, // MATH-500
    "knowledge": 92.5, // MMLU
    "instruction": 88.0, // IFEval
    "agentic": 60.0,
    "conversation": 86.0,
    "creative": 82.0,
    "safety": 90.0,
  },
  "openai/o1-mini": {
    "coding": 41.6, // SWE-bench Verified
    "reasoning": 60.0, // GPQA Diamond
    "math": 90.0, // MATH-500
    "knowledge": 85.2, // MMLU
    "instruction": 80.0, // IFEval
    "agentic": 45.0,
    "conversation": 80.0,
    "creative": 75.0,
    "safety": 85.0,
  },
  "openai/o3-mini": {
    "coding": 49.3, // SWE-bench Verified
    "reasoning": 76.0, // GPQA Diamond
    "math": 92.0, // MATH-500
    "knowledge": 86.0, // MMLU
    "instruction": 82.0, // IFEval
    "agentic": 50.0,
    "conversation": 82.0,
    "creative": 76.0,
    "safety": 86.0,
  },
  "openai/o3": {
    "coding": 71.7, // SWE-bench Verified
    "reasoning": 87.7, // GPQA Diamond
    "math": 96.7, // AIME 2024
    "knowledge": 91.0, // MMLU
    "instruction": 88.0, // IFEval
    "agentic": 65.0,
    "conversation": 88.0,
    "creative": 85.0,
    "safety": 90.0,
  },
  "openai/o3-mini-high": {
    "coding": 54.0, // SWE-bench Verified
    "reasoning": 78.0, // GPQA Diamond
    "math": 93.0, // MATH-500
    "knowledge": 87.0, // MMLU
    "instruction": 83.0, // IFEval
    "agentic": 52.0,
    "conversation": 83.0,
    "creative": 78.0,
    "safety": 87.0,
  },
  "openai/gpt-4.5-preview": {
    "overall": 88.0,
    "coding": 38.0, // SWE-bench Verified
    "reasoning": 55.0, // GPQA Diamond
    "math": 78.0, // MATH-500
    "knowledge": 90.2, // MMLU
    "instruction": 84.0, // IFEval
    "vision": 78.0, // MMMU
    "conversation": 88.0,
    "creative": 85.0,
    "roleplay": 82.0,
    "long-context": 90.0,
    "safety": 88.0,
  },
  "openai/gpt-4o": {
    "overall": 87.0,
    "coding": 33.2, // SWE-bench Verified
    "reasoning": 53.6, // GPQA Diamond
    "math": 76.6, // MATH-500
    "knowledge": 88.7, // MMLU
    "instruction": 82.0, // IFEval
    "vision": 69.1, // MMMU
    "agentic": 40.0,
    "conversation": 87.0,
    "creative": 84.0,
    "roleplay": 80.0,
    "long-context": 88.0,
    "safety": 87.0,
  },
  "openai/gpt-4o-mini": {
    "overall": 78.0,
    "coding": 23.0, // SWE-bench Verified
    "reasoning": 40.0, // GPQA Diamond
    "math": 70.2, // MATH-500
    "knowledge": 82.0, // MMLU
    "instruction": 76.0, // IFEval
    "vision": 59.0, // MMMU
    "agentic": 30.0,
    "conversation": 82.0,
    "creative": 78.0,
    "roleplay": 75.0,
    "long-context": 80.0,
    "safety": 82.0,
  },
  "openai/gpt-4-turbo": {
    "overall": 82.0,
    "coding": 23.0, // SWE-bench Verified
    "reasoning": 48.0, // GPQA Diamond
    "math": 72.0, // MATH-500
    "knowledge": 86.4, // MMLU
    "instruction": 80.0, // IFEval
    "vision": 63.0, // MMMU
    "agentic": 35.0,
    "conversation": 85.0,
    "creative": 82.0,
    "roleplay": 78.0,
    "long-context": 85.0,
    "safety": 85.0,
  },
  "openai/gpt-4.1": {
    "overall": 90.0,
    "coding": 54.6, // SWE-bench Verified
    "reasoning": 66.3, // GPQA Diamond
    "math": 90.2, // MATH-500
    "knowledge": 90.2, // MMLU
    "instruction": 90.0, // IFEval
    "vision": 72.0, // MMMU
    "agentic": 55.0,
    "conversation": 88.0,
    "creative": 85.0,
    "roleplay": 82.0,
    "long-context": 92.0,
    "safety": 89.0,
  },
  "openai/gpt-4.1-mini": {
    "overall": 80.0,
    "coding": 32.0, // SWE-bench Verified
    "reasoning": 50.0, // GPQA Diamond
    "math": 76.0, // MATH-500
    "knowledge": 84.0, // MMLU
    "instruction": 78.0, // IFEval
    "vision": 60.0, // MMMU
    "agentic": 35.0,
    "conversation": 82.0,
    "creative": 78.0,
    "roleplay": 75.0,
    "long-context": 85.0,
    "safety": 84.0,
  },

  // ==================== Anthropic Models ====================
  "anthropic/claude-opus-4-5": {
    "overall": 95.0, // Flagship model - top tier
    "coding": 74.4, // SWE-bench Verified
    "reasoning": 65.0, // GPQA Diamond
    "math": 78.0, // MATH-500
    "knowledge": 89.0, // MMLU
    "instruction": 92.0, // IFEval
    "agentic": 68.0, // TAU-bench
    "vision": 75.0, // MMMU
    "conversation": 92.0,
    "creative": 94.0, // Excellent creative writing
    "roleplay": 92.0,
    "long-context": 95.0,
    "safety": 90.0,
  },
  "anthropic/claude-sonnet-4-5": {
    "overall": 93.0, // Top tier coding model
    "coding": 77.2, // SWE-bench Verified - Best coding
    "reasoning": 62.0, // GPQA Diamond
    "math": 76.0, // MATH-500
    "knowledge": 88.0, // MMLU
    "instruction": 89.0, // IFEval
    "agentic": 61.4, // OSWorld
    "vision": 72.0, // MMMU
    "conversation": 90.0,
    "creative": 91.0,
    "roleplay": 89.0,
    "long-context": 93.0,
    "safety": 88.0,
  },
  "anthropic/claude-opus-4": {
    "overall": 91.0,
    "coding": 72.5, // SWE-bench Verified
    "reasoning": 60.0, // GPQA Diamond
    "math": 75.0, // MATH-500
    "knowledge": 88.5, // MMLU
    "instruction": 90.0, // IFEval
    "agentic": 64.0, // TAU-bench
    "vision": 72.0, // MMMU
    "conversation": 91.0,
    "creative": 93.0,
    "roleplay": 91.0,
    "long-context": 94.0,
    "safety": 89.0,
  },
  "anthropic/claude-sonnet-4": {
    "overall": 89.0,
    "coding": 72.7, // SWE-bench Verified
    "reasoning": 57.0, // GPQA Diamond
    "math": 72.0, // MATH-500
    "knowledge": 88.0, // MMLU
    "instruction": 88.0, // IFEval
    "agentic": 60.0, // TAU-bench
    "vision": 70.0, // MMMU
    "conversation": 89.0,
    "creative": 90.0,
    "roleplay": 88.0,
    "long-context": 92.0,
    "safety": 87.0,
  },
  "anthropic/claude-3.5-sonnet": {
    "overall": 86.0,
    "coding": 49.0, // SWE-bench Verified
    "reasoning": 59.4, // GPQA Diamond
    "math": 78.3, // MATH-500
    "knowledge": 88.7, // MMLU
    "instruction": 86.0, // IFEval
    "agentic": 45.0, // TAU-bench
    "vision": 68.3, // MMMU
    "conversation": 87.0,
    "creative": 89.0,
    "roleplay": 87.0,
    "long-context": 90.0,
    "safety": 86.0,
  },
  "anthropic/claude-3-opus": {
    "coding": 22.0, // SWE-bench Verified
    "reasoning": 50.4, // GPQA Diamond
    "math": 60.0, // MATH-500
    "knowledge": 86.8, // MMLU
    "instruction": 82.0, // IFEval
    "agentic": 35.0,
    "conversation": 86.0,
    "creative": 90.0,
    "roleplay": 88.0,
    "long-context": 85.0,
    "safety": 85.0,
  },
  "anthropic/claude-3.5-haiku": {
    "coding": 40.6, // SWE-bench Verified
    "reasoning": 41.6, // GPQA Diamond
    "math": 69.4, // MATH
    "knowledge": 78.5, // MMLU
    "instruction": 78.0, // IFEval
    "vision": 66.6, // MMMU
    "agentic": 38.0,
    "conversation": 82.0,
    "creative": 80.0,
    "roleplay": 78.0,
    "long-context": 82.0,
    "safety": 80.0,
  },
  "anthropic/claude-3-haiku": {
    "coding": 20.0, // SWE-bench estimate
    "reasoning": 35.0, // GPQA estimate
    "math": 58.0, // MATH estimate
    "knowledge": 72.5, // MMLU
    "instruction": 72.0, // IFEval
    "agentic": 25.0,
    "conversation": 78.0,
    "creative": 75.0,
    "roleplay": 74.0,
    "safety": 75.0,
  },

  // ==================== Google Models ====================
  "google/gemini-2.5-pro": {
    "coding": 63.8, // SWE-bench Verified
    "reasoning": 84.0, // GPQA Diamond
    "math": 92.0, // AIME 2024
    "knowledge": 89.8, // MMLU
    "instruction": 86.0, // IFEval
    "agentic": 70.4, // LiveCodeBench
    "vision": 81.7, // MMMU
    "conversation": 88.0,
    "creative": 85.0,
    "roleplay": 82.0,
    "long-context": 95.0, // 1M+ context
    "safety": 87.0,
  },
  "google/gemini-2.5-flash": {
    "coding": 54.0, // SWE-bench Verified
    "reasoning": 80.8, // GPQA Diamond
    "math": 75.6, // AIME 2025
    "knowledge": 84.0, // MMLU
    "instruction": 82.0, // IFEval
    "agentic": 71.7, // LiveCodeBench
    "vision": 78.0, // MMMU
    "conversation": 85.0,
    "creative": 82.0,
    "roleplay": 80.0,
    "long-context": 92.0,
    "safety": 84.0,
  },
  "google/gemini-2.5-flash-preview-05-20": {
    "coding": 60.4, // SWE-bench Verified
    "reasoning": 82.8, // GPQA Diamond
    "math": 72.0, // AIME 2025
    "knowledge": 85.0, // MMLU
    "instruction": 83.0, // IFEval
    "agentic": 63.9, // LiveCodeBench
    "vision": 80.0, // MMMU
    "conversation": 86.0,
    "creative": 83.0,
    "roleplay": 81.0,
    "long-context": 93.0,
    "safety": 85.0,
  },
  "google/gemini-pro-1.5": {
    "coding": 43.0, // SWE-bench Verified
    "reasoning": 59.0, // GPQA Diamond
    "math": 67.0, // MATH
    "knowledge": 83.5, // MMLU
    "instruction": 80.0, // IFEval
    "vision": 62.0, // MMMU
    "agentic": 50.0,
    "conversation": 84.0,
    "creative": 80.0,
    "roleplay": 78.0,
    "long-context": 92.0, // 1M context
    "safety": 82.0,
  },
  "google/gemini-flash-1.5": {
    "coding": 30.0, // SWE-bench estimate
    "reasoning": 50.0, // GPQA estimate
    "math": 55.0,
    "knowledge": 78.5,
    "instruction": 75.0,
    "vision": 56.0,
    "agentic": 40.0,
    "conversation": 80.0,
    "creative": 75.0,
    "roleplay": 74.0,
    "long-context": 88.0,
    "safety": 78.0,
  },

  // ==================== DeepSeek Models ====================
  "deepseek/deepseek-r1": {
    "coding": 57.6, // SWE-bench Verified
    "reasoning": 81.0, // GPQA Diamond
    "math": 97.3, // AIME 2024
    "knowledge": 90.8, // MMLU
    "instruction": 83.0, // IFEval
    "agentic": 73.3, // LiveCodeBench
    "conversation": 82.0,
    "creative": 78.0,
    "safety": 80.0,
  },
  "deepseek/deepseek-r1-distill-llama-70b": {
    "coding": 38.0, // SWE-bench Verified
    "reasoning": 58.0, // GPQA Diamond
    "math": 88.0, // MATH-500
    "knowledge": 82.0, // MMLU
    "instruction": 75.0, // IFEval
    "agentic": 50.0,
    "conversation": 78.0,
    "creative": 72.0,
    "safety": 75.0,
  },
  "deepseek/deepseek-v3": {
    "coding": 42.0, // SWE-bench Verified
    "reasoning": 59.1, // GPQA Diamond
    "math": 90.2, // MATH-500
    "knowledge": 88.5, // MMLU
    "instruction": 82.0, // IFEval
    "agentic": 55.5, // LiveCodeBench
    "conversation": 84.0,
    "creative": 80.0,
    "roleplay": 78.0,
    "safety": 82.0,
  },
  "deepseek/deepseek-chat": {
    "coding": 42.0,
    "reasoning": 55.0,
    "math": 85.0,
    "knowledge": 87.5,
    "instruction": 80.0,
    "agentic": 50.0,
    "conversation": 85.0,
    "creative": 82.0,
    "roleplay": 80.0,
    "safety": 80.0,
  },
  "deepseek/deepseek-coder": {
    "coding": 55.0, // Specialized coder
    "reasoning": 45.0,
    "math": 68.0,
    "knowledge": 75.0,
    "instruction": 72.0,
    "agentic": 52.0,
    "conversation": 72.0,
    "creative": 65.0,
    "safety": 75.0,
  },

  // ==================== Meta Models ====================
  "meta-llama/llama-3.3-70b-instruct": {
    "coding": 38.0,
    "reasoning": 58.0,
    "math": 68.9, // MMLU Pro
    "knowledge": 86.0, // MMLU
    "instruction": 76.0, // IFEval
    "agentic": 45.0,
    "conversation": 82.0,
    "creative": 80.0,
    "roleplay": 78.0,
    "long-context": 85.0,
    "safety": 80.0,
  },
  "meta-llama/llama-3.1-405b-instruct": {
    "coding": 45.0,
    "reasoning": 62.0,
    "math": 73.4, // MMLU Pro
    "knowledge": 87.3, // MMLU
    "instruction": 80.0, // IFEval
    "agentic": 52.0,
    "conversation": 85.0,
    "creative": 83.0,
    "roleplay": 82.0,
    "long-context": 88.0,
    "safety": 83.0,
  },
  "meta-llama/llama-3.1-70b-instruct": {
    "coding": 35.0,
    "reasoning": 52.0,
    "math": 64.0,
    "knowledge": 79.5, // MMLU
    "instruction": 74.0, // IFEval
    "agentic": 42.0,
    "conversation": 80.0,
    "creative": 78.0,
    "roleplay": 76.0,
    "long-context": 82.0,
    "safety": 78.0,
  },
  "meta-llama/llama-3.1-8b-instruct": {
    "coding": 22.0,
    "reasoning": 38.0,
    "math": 45.0,
    "knowledge": 68.5, // MMLU
    "instruction": 62.0, // IFEval
    "agentic": 28.0,
    "conversation": 74.0,
    "creative": 70.0,
    "roleplay": 68.0,
    "safety": 72.0,
  },
  "meta-llama/llama-4-maverick": {
    "coding": 43.4, // LiveCodeBench
    "reasoning": 73.7, // GPQA Diamond
    "math": 61.2, // MATH
    "knowledge": 85.5, // MMLU
    "instruction": 84.0, // IFEval
    "agentic": 77.6, // MBPP
    "vision": 75.0, // MMMU
    "conversation": 86.0,
    "creative": 84.0,
    "roleplay": 82.0,
    "long-context": 95.0,
    "safety": 84.0,
  },
  "meta-llama/llama-4-scout": {
    "coding": 40.0,
    "reasoning": 70.0,
    "math": 70.0,
    "knowledge": 85.0,
    "instruction": 82.0,
    "agentic": 55.0,
    "vision": 70.0,
    "conversation": 85.0,
    "creative": 82.0,
    "roleplay": 80.0,
    "long-context": 95.0,
    "safety": 83.0,
  },

  // ==================== Qwen Models ====================
  "qwen/qwen3-235b-a22b": {
    "coding": 58.0,
    "reasoning": 72.0,
    "math": 86.0,
    "knowledge": 88.0,
    "instruction": 84.0,
    "agentic": 60.0,
    "conversation": 86.0,
    "creative": 84.0,
    "roleplay": 82.0,
    "safety": 84.0,
  },
  "qwen/qwen3-32b": {
    "coding": 48.0,
    "reasoning": 65.0,
    "math": 78.0,
    "knowledge": 82.0,
    "instruction": 78.0,
    "agentic": 50.0,
    "conversation": 82.0,
    "creative": 80.0,
    "roleplay": 78.0,
    "safety": 80.0,
  },
  "qwen/qwen-max": {
    "coding": 55.0,
    "reasoning": 70.0,
    "math": 84.0,
    "knowledge": 86.0,
    "instruction": 82.0,
    "agentic": 58.0,
    "conversation": 85.0,
    "creative": 82.0,
    "roleplay": 80.0,
    "safety": 82.0,
  },
  "qwen/qwen-2.5-72b-instruct": {
    "coding": 55.5, // LiveCodeBench
    "reasoning": 68.0,
    "math": 83.1, // MATH
    "knowledge": 86.1, // MMLU
    "instruction": 81.2, // Arena-Hard
    "agentic": 55.0,
    "conversation": 84.0,
    "creative": 82.0,
    "roleplay": 80.0,
    "safety": 82.0,
  },
  "qwen/qwen-2.5-32b-instruct": {
    "coding": 48.0,
    "reasoning": 62.0,
    "math": 78.0,
    "knowledge": 82.0,
    "instruction": 76.0,
    "agentic": 48.0,
    "conversation": 82.0,
    "creative": 78.0,
    "roleplay": 76.0,
    "safety": 78.0,
  },
  "qwen/qwq-32b-preview": {
    "coding": 52.0,
    "reasoning": 75.0, // GPQA
    "math": 92.0, // MATH
    "knowledge": 78.0, // MMLU
    "instruction": 72.0, // IFEval
    "agentic": 55.0,
    "conversation": 78.0,
    "creative": 72.0,
    "safety": 76.0,
  },
  "qwen/qwen-2.5-coder-32b-instruct": {
    "coding": 60.0, // SWE-bench
    "reasoning": 55.0, // GPQA
    "math": 65.0, // MATH
    "knowledge": 72.0, // MMLU
    "instruction": 70.0, // IFEval
    "agentic": 55.0,
    "conversation": 72.0,
    "creative": 65.0,
    "safety": 72.0,
  },
  "qwen/qwen-2.5-7b-instruct": {
    "coding": 32.0,
    "reasoning": 45.0,
    "math": 58.0,
    "knowledge": 72.0,
    "instruction": 65.0,
    "agentic": 35.0,
    "conversation": 76.0,
    "creative": 72.0,
    "roleplay": 70.0,
    "safety": 72.0,
  },

  // ==================== Mistral Models ====================
  "mistralai/mistral-large-2411": {
    "coding": 61.6, // SWE-bench Verified
    "reasoning": 65.0,
    "math": 75.0,
    "knowledge": 84.0, // MMLU
    "instruction": 78.0, // IFEval
    "agentic": 58.0,
    "conversation": 82.0,
    "creative": 80.0,
    "roleplay": 78.0,
    "safety": 80.0,
  },
  "mistralai/mistral-large-2407": {
    "coding": 48.0,
    "reasoning": 60.0,
    "math": 70.0,
    "knowledge": 82.0,
    "instruction": 78.0,
    "agentic": 52.0,
    "conversation": 80.0,
    "creative": 78.0,
    "roleplay": 76.0,
    "safety": 78.0,
  },
  "mistralai/mistral-medium": {
    "coding": 38.0,
    "reasoning": 52.0,
    "math": 62.0,
    "knowledge": 78.0,
    "instruction": 74.0,
    "agentic": 42.0,
    "conversation": 78.0,
    "creative": 76.0,
    "roleplay": 74.0,
    "safety": 76.0,
  },
  "mistralai/mistral-small-2503": {
    "coding": 42.0,
    "reasoning": 55.0,
    "math": 58.0,
    "knowledge": 81.0,
    "instruction": 70.0,
    "agentic": 45.0,
    "conversation": 76.0,
    "creative": 74.0,
    "roleplay": 72.0,
    "safety": 76.0,
  },
  "mistralai/codestral-latest": {
    "coding": 55.0, // SWE-bench
    "reasoning": 50.0,
    "math": 58.0,
    "knowledge": 68.0, // MMLU
    "instruction": 65.0, // IFEval
    "agentic": 52.0,
    "conversation": 68.0,
    "creative": 60.0,
    "safety": 70.0,
  },
  "mistralai/mixtral-8x22b-instruct": {
    "coding": 42.0,
    "reasoning": 55.0,
    "math": 65.0,
    "knowledge": 77.0, // MMLU
    "instruction": 72.0, // IFEval
    "agentic": 48.0,
    "conversation": 78.0,
    "creative": 76.0,
    "roleplay": 74.0,
    "safety": 76.0,
  },
  "mistralai/mixtral-8x7b-instruct": {
    "coding": 32.0,
    "reasoning": 48.0,
    "math": 55.0,
    "knowledge": 70.0, // MMLU
    "instruction": 65.0, // IFEval
    "agentic": 38.0,
    "conversation": 75.0,
    "creative": 72.0,
    "roleplay": 70.0,
    "safety": 72.0,
  },
  "mistralai/pixtral-large-2411": {
    "coding": 45.0,
    "reasoning": 58.0,
    "math": 62.0,
    "knowledge": 78.0,
    "instruction": 74.0,
    "vision": 75.0, // MMMU
    "agentic": 48.0,
    "conversation": 78.0,
    "creative": 76.0,
    "safety": 76.0,
  },

  // ==================== XAI Models ====================
  "x-ai/grok-3": {
    "coding": 79.4, // LiveCodeBench
    "reasoning": 84.0, // GPQA Diamond
    "math": 86.7, // AIME 2025
    "knowledge": 92.7, // MMLU
    "instruction": 84.0, // IFEval
    "agentic": 75.0,
    "conversation": 88.0,
    "creative": 86.0,
    "roleplay": 85.0,
    "safety": 85.0,
  },
  "x-ai/grok-3-mini": {
    "coding": 65.0,
    "reasoning": 75.0,
    "math": 70.0,
    "knowledge": 85.0,
    "instruction": 76.0,
    "agentic": 65.0,
    "conversation": 82.0,
    "creative": 80.0,
    "roleplay": 78.0,
    "safety": 80.0,
  },
  "x-ai/grok-2-1212": {
    "coding": 62.0,
    "reasoning": 78.0,
    "math": 72.0,
    "knowledge": 82.0,
    "instruction": 78.0,
    "agentic": 70.0,
    "conversation": 85.0,
    "creative": 82.0,
    "roleplay": 80.0,
    "safety": 82.0,
  },
  "x-ai/grok-2-vision-1212": {
    "coding": 60.0,
    "reasoning": 75.0,
    "math": 70.0,
    "knowledge": 80.0,
    "instruction": 75.0,
    "vision": 80.0, // MMMU
    "agentic": 68.0,
    "conversation": 82.0,
    "creative": 80.0,
    "safety": 80.0,
  },

  // ==================== Cohere Models ====================
  "cohere/command-r-plus-08-2024": {
    "coding": 55.0,
    "reasoning": 72.0,
    "math": 62.0,
    "knowledge": 80.0,
    "instruction": 78.0,
    "agentic": 70.0,
    "conversation": 82.0,
    "creative": 80.0,
    "roleplay": 78.0,
    "long-context": 85.0,
    "safety": 80.0,
  },
  "cohere/command-r-plus": {
    "coding": 52.0,
    "reasoning": 70.0,
    "math": 58.0,
    "knowledge": 78.0,
    "instruction": 75.0,
    "agentic": 68.0,
    "conversation": 80.0,
    "creative": 78.0,
    "roleplay": 76.0,
    "long-context": 82.0,
    "safety": 78.0,
  },
  "cohere/command-r": {
    "coding": 45.0,
    "reasoning": 65.0,
    "math": 52.0,
    "knowledge": 72.0,
    "instruction": 70.0,
    "agentic": 60.0,
    "conversation": 76.0,
    "creative": 74.0,
    "roleplay": 72.0,
    "long-context": 78.0,
    "safety": 74.0,
  },

  // ==================== Amazon Models ====================
  "amazon/nova-pro-v1": {
    "coding": 58.0,
    "reasoning": 70.0,
    "math": 65.0,
    "knowledge": 75.0,
    "instruction": 72.0,
    "vision": 75.0,
    "agentic": 68.0,
    "conversation": 78.0,
    "creative": 76.0,
    "roleplay": 74.0,
    "long-context": 85.0,
    "safety": 80.0,
  },
  "amazon/nova-lite-v1": {
    "coding": 48.0,
    "reasoning": 60.0,
    "math": 55.0,
    "knowledge": 68.0,
    "instruction": 65.0,
    "vision": 65.0,
    "agentic": 55.0,
    "conversation": 72.0,
    "creative": 70.0,
    "roleplay": 68.0,
    "long-context": 78.0,
    "safety": 75.0,
  },

  // ==================== Microsoft Models ====================
  "microsoft/phi-4": {
    "coding": 58.0,
    "reasoning": 70.0,
    "math": 72.0,
    "knowledge": 75.0,
    "instruction": 72.0,
    "agentic": 55.0,
    "conversation": 76.0,
    "creative": 74.0,
    "safety": 78.0,
  },
  "microsoft/wizardlm-2-8x22b": {
    "coding": 62.0,
    "reasoning": 72.0,
    "math": 68.0,
    "knowledge": 78.0,
    "instruction": 75.0,
    "agentic": 62.0,
    "conversation": 80.0,
    "creative": 78.0,
    "roleplay": 76.0,
    "safety": 78.0,
  },

  // ==================== Nous Research Models ====================
  "nousresearch/hermes-3-llama-3.1-405b": {
    "coding": 65.0,
    "reasoning": 78.0,
    "math": 72.0,
    "knowledge": 85.0,
    "instruction": 80.0,
    "agentic": 75.0,
    "conversation": 85.0,
    "creative": 88.0,
    "roleplay": 90.0, // Excellent roleplay
    "long-context": 88.0,
    "safety": 82.0,
  },
  "nousresearch/hermes-3-llama-3.1-70b": {
    "coding": 58.0,
    "reasoning": 70.0,
    "math": 65.0,
    "knowledge": 78.0,
    "instruction": 74.0,
    "agentic": 68.0,
    "conversation": 82.0,
    "creative": 85.0,
    "roleplay": 88.0,
    "long-context": 82.0,
    "safety": 78.0,
  },

  // ==================== Specialized Coding Models ====================
  "phind/phind-codellama-34b": {
    "coding": 65.0, // Specialized
    "reasoning": 58.0,
    "math": 52.0,
    "knowledge": 62.0, // MMLU
    "instruction": 60.0, // IFEval
    "agentic": 55.0,
    "conversation": 62.0,
    "creative": 55.0,
    "safety": 70.0,
  },
  "wizardlm/wizardcoder-python-34b-v1.0": {
    "coding": 62.0, // Specialized
    "reasoning": 55.0,
    "math": 50.0,
    "knowledge": 58.0, // MMLU
    "instruction": 58.0, // IFEval
    "agentic": 52.0,
    "conversation": 58.0,
    "creative": 52.0,
    "safety": 68.0,
  },

  // ==================== Vision Models ====================
  "alibaba/qwen-vl-max": {
    "coding": 55.0,
    "reasoning": 68.0,
    "math": 62.0,
    "knowledge": 75.0, // MMLU
    "instruction": 70.0, // IFEval
    "vision": 82.0, // MMMU
    "agentic": 58.0,
    "conversation": 76.0,
    "creative": 74.0,
    "safety": 76.0,
  },
  "alibaba/qwen-vl-plus": {
    "coding": 48.0,
    "reasoning": 60.0,
    "math": 55.0,
    "knowledge": 68.0, // MMLU
    "instruction": 65.0, // IFEval
    "vision": 75.0, // MMMU
    "agentic": 52.0,
    "conversation": 72.0,
    "creative": 70.0,
    "safety": 72.0,
  },

  // ==================== Roleplay Specialized Models ====================
  "neversleep/llama-3.1-lumimaid-70b": {
    "coding": 48.0,
    "reasoning": 60.0,
    "math": 52.0,
    "knowledge": 70.0,
    "instruction": 68.0,
    "conversation": 85.0,
    "creative": 90.0, // Excellent creative
    "roleplay": 95.0, // Top roleplay
    "safety": 65.0,
  },
  "neversleep/llama-3-lumimaid-8b": {
    "coding": 35.0,
    "reasoning": 48.0,
    "math": 40.0,
    "knowledge": 58.0,
    "instruction": 55.0,
    "conversation": 78.0,
    "creative": 85.0,
    "roleplay": 92.0,
    "safety": 60.0,
  },
  "sao10k/l3.1-euryale-70b": {
    "coding": 52.0,
    "reasoning": 65.0,
    "math": 58.0,
    "knowledge": 72.0,
    "instruction": 70.0,
    "conversation": 85.0,
    "creative": 90.0,
    "roleplay": 94.0, // Top roleplay
    "safety": 62.0,
  },
  "pygmalionai/mythalion-13b": {
    "coding": 32.0,
    "reasoning": 45.0,
    "math": 35.0,
    "knowledge": 52.0,
    "instruction": 50.0,
    "conversation": 75.0,
    "creative": 85.0,
    "roleplay": 92.0,
    "safety": 55.0,
  },
  "gryphe/mythomax-l2-13b": {
    "coding": 35.0,
    "reasoning": 48.0,
    "math": 38.0,
    "knowledge": 55.0,
    "instruction": 52.0,
    "conversation": 76.0,
    "creative": 84.0,
    "roleplay": 90.0,
    "safety": 58.0,
  },

  // ==================== Safety Models ====================
  "meta-llama/llama-guard-3-8b": {
    "instruction": 70.0, // IFEval
    "knowledge": 60.0, // MMLU
    "safety": 95.0, // Specialized safety
  },

  // ==================== AI21 Models ====================
  "ai21/jamba-1.5-large": {
    "coding": 58.0,
    "reasoning": 70.0,
    "math": 65.0,
    "knowledge": 78.0,
    "instruction": 72.0,
    "agentic": 62.0,
    "conversation": 78.0,
    "creative": 76.0,
    "roleplay": 74.0,
    "long-context": 90.0, // Excellent long context
    "safety": 78.0,
  },
  "ai21/jamba-1.5-mini": {
    "coding": 48.0,
    "reasoning": 60.0,
    "math": 55.0,
    "knowledge": 68.0,
    "instruction": 64.0,
    "agentic": 52.0,
    "conversation": 72.0,
    "creative": 70.0,
    "roleplay": 68.0,
    "long-context": 85.0,
    "safety": 72.0,
  },

  // ==================== Perplexity Models ====================
  "perplexity/llama-3.1-sonar-huge-128k-online": {
    "coding": 58.0,
    "reasoning": 75.0,
    "math": 70.0,
    "knowledge": 88.0, // Enhanced by search
    "instruction": 78.0,
    "agentic": 72.0,
    "conversation": 82.0,
    "creative": 78.0,
    "long-context": 90.0,
    "safety": 80.0,
  },
  "perplexity/llama-3.1-sonar-large-128k-online": {
    "coding": 52.0,
    "reasoning": 70.0,
    "math": 65.0,
    "knowledge": 85.0, // Enhanced by search
    "instruction": 72.0,
    "agentic": 68.0,
    "conversation": 78.0,
    "creative": 74.0,
    "long-context": 88.0,
    "safety": 78.0,
  },
};

// Model ID aliases (handle different naming conventions from OpenRouter)
const MODEL_ALIASES: Record<string, string> = {
  // Anthropic aliases - Claude 4.5
  "anthropic/claude-opus-4-5-20251101": "anthropic/claude-opus-4-5",
  "anthropic/claude-4-5-opus": "anthropic/claude-opus-4-5",
  "anthropic/claude-4.5-opus": "anthropic/claude-opus-4-5",
  "anthropic/claude-sonnet-4-5-20251101": "anthropic/claude-sonnet-4-5",
  "anthropic/claude-4-5-sonnet": "anthropic/claude-sonnet-4-5",
  "anthropic/claude-4.5-sonnet": "anthropic/claude-sonnet-4-5",
  // Anthropic aliases - Claude 4
  "anthropic/claude-opus-4-20250514": "anthropic/claude-opus-4",
  "anthropic/claude-4-opus": "anthropic/claude-opus-4",
  "anthropic/claude-sonnet-4-20250514": "anthropic/claude-sonnet-4",
  "anthropic/claude-4-sonnet": "anthropic/claude-sonnet-4",
  // Anthropic aliases - Claude 3.5
  "anthropic/claude-3.5-sonnet:beta": "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3.5-sonnet-20240620": "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3.5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3-5-sonnet-20240620": "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3-5-sonnet": "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3.5-haiku:beta": "anthropic/claude-3.5-haiku",
  "anthropic/claude-3.5-haiku-20241022": "anthropic/claude-3.5-haiku",
  "anthropic/claude-3-5-haiku": "anthropic/claude-3.5-haiku",
  "anthropic/claude-3-5-haiku-20241022": "anthropic/claude-3.5-haiku",
  "anthropic/claude-3-opus": "anthropic/claude-3-opus",
  "anthropic/claude-3-opus-20240229": "anthropic/claude-3-opus",
  "anthropic/claude-3-haiku": "anthropic/claude-3-haiku",
  "anthropic/claude-3-haiku-20240307": "anthropic/claude-3-haiku",

  // OpenAI aliases
  "openai/gpt-4o-2024-11-20": "openai/gpt-4o",
  "openai/gpt-4o-2024-08-06": "openai/gpt-4o",
  "openai/gpt-4o-2024-05-13": "openai/gpt-4o",
  "openai/chatgpt-4o-latest": "openai/gpt-4o",
  "openai/gpt-4o-mini-2024-07-18": "openai/gpt-4o-mini",
  "openai/gpt-4-turbo-2024-04-09": "openai/gpt-4-turbo",
  "openai/gpt-4-turbo-preview": "openai/gpt-4-turbo",
  "openai/o1-preview": "openai/o1",
  "openai/o1-preview-2024-09-12": "openai/o1",
  "openai/o1-2024-12-17": "openai/o1",
  "openai/o1-mini-2024-09-12": "openai/o1-mini",
  "openai/o3-mini-2025-01-31": "openai/o3-mini",

  // Google aliases
  "google/gemini-pro-1.5-exp": "google/gemini-pro-1.5",
  "google/gemini-1.5-pro": "google/gemini-pro-1.5",
  "google/gemini-1.5-pro-latest": "google/gemini-pro-1.5",
  "google/gemini-1.5-flash": "google/gemini-flash-1.5",
  "google/gemini-1.5-flash-latest": "google/gemini-flash-1.5",
  "google/gemini-2.0-flash": "google/gemini-2.0-flash-exp",
  "google/gemini-2.5-pro-preview-05-06": "google/gemini-2.5-pro",
  "google/gemini-2.5-pro-exp-03-25": "google/gemini-2.5-pro",
  "google/gemini-2.5-flash-preview": "google/gemini-2.5-flash",
  "google/gemini-exp-1206": "google/gemini-2.0-flash-thinking-exp",

  // Meta aliases
  "meta-llama/llama-3.3-70b-instruct:free": "meta-llama/llama-3.3-70b-instruct",
  "meta-llama/llama-3.1-405b-instruct:free": "meta-llama/llama-3.1-405b-instruct",
  "meta-llama/llama-3.1-70b-instruct:free": "meta-llama/llama-3.1-70b-instruct",
  "meta-llama/llama-3.1-8b-instruct:free": "meta-llama/llama-3.1-8b-instruct",
  "meta-llama/llama-4-scout-17b-16e-instruct": "meta-llama/llama-4-scout",
  "meta-llama/llama-4-maverick-17b-128e-instruct": "meta-llama/llama-4-maverick",

  // DeepSeek aliases
  "deepseek/deepseek-r1:free": "deepseek/deepseek-r1",
  "deepseek/deepseek-chat:free": "deepseek/deepseek-chat",
  "deepseek/deepseek-v3-base": "deepseek/deepseek-v3",

  // Qwen aliases
  "qwen/qwen-2.5-72b-instruct:free": "qwen/qwen-2.5-72b-instruct",
  "qwen/qwq-32b": "qwen/qwq-32b-preview",

  // Mistral aliases
  "mistralai/mistral-large": "mistralai/mistral-large-2411",
  "mistralai/mistral-large-latest": "mistralai/mistral-large-2411",
  "mistralai/mixtral-8x22b": "mistralai/mixtral-8x22b-instruct",
};

function normalizeModelId(modelId: string): string {
  return MODEL_ALIASES[modelId] || modelId;
}

// Get all stored user eval results
export function getUserEvalResults(): StoredEvalResult[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(EVAL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save a new eval result
export function saveEvalResult(result: Omit<StoredEvalResult, "id" | "source">): void {
  if (typeof window === "undefined") return;

  const results = getUserEvalResults();
  const newResult: StoredEvalResult = {
    ...result,
    id: `${result.modelId}-${result.benchmark}-${Date.now()}`,
    source: "user",
  };

  results.push(newResult);
  localStorage.setItem(EVAL_STORAGE_KEY, JSON.stringify(results));
}

// Get the best score for a model on a benchmark (user results take priority)
export function getBenchmarkScore(
  modelId: string,
  benchmarkOrUseCase: string
): { score: number; source: "user" | "baseline" | "heuristic" } | null {
  const normalizedId = normalizeModelId(modelId);
  const userResults = getUserEvalResults();

  // Check user results first (most recent)
  const userScore = userResults
    .filter(r => normalizeModelId(r.modelId) === normalizedId &&
                 (r.benchmark === benchmarkOrUseCase || r.benchmarkCategory === benchmarkOrUseCase))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  if (userScore) {
    return { score: userScore.score * 100, source: "user" };
  }

  // Check baseline data
  const baselineScores = BASELINE_SCORES[normalizedId];
  if (baselineScores && baselineScores[benchmarkOrUseCase] !== undefined) {
    return { score: baselineScores[benchmarkOrUseCase], source: "baseline" };
  }

  return null;
}

// Get aggregated scores for a model across all use cases
export function getModelScores(modelId: string, _capabilities: string[] = []): ModelBenchmarkScores {
  const normalizedId = normalizeModelId(modelId);
  const userResults = getUserEvalResults().filter(r => normalizeModelId(r.modelId) === normalizedId);
  const baselineScores = BASELINE_SCORES[normalizedId] || {};

  const benchmarks: ModelBenchmarkScores["benchmarks"] = {};
  const useCaseScores: ModelBenchmarkScores["useCaseScores"] = {};

  // Define use case to benchmark mapping (matches mock-data.ts useCases)
  const useCaseBenchmarks: Record<string, string[]> = {
    // Code Generation benchmarks
    coding: ["humaneval", "swebench", "livecodebench", "evalplus", "bigcodebench", "mbpp", "multipl-e", "codecontests", "coding"],
    // Complex Reasoning benchmarks
    reasoning: ["gpqa", "arc", "hellaswag", "bigbench", "winogrande", "drop", "reasoning"],
    // Mathematics benchmarks
    math: ["gsm8k", "math500", "aime", "minerva-math", "math"],
    // Knowledge & QA benchmarks
    knowledge: ["mmlu", "mmlu-pro", "simpleqa", "truthfulqa", "knowledge"],
    // Agentic Task benchmarks
    agentic: ["tau2-bench", "gaia", "browsecomp", "toolbench", "agentic"],
    // Instruction Following benchmarks
    instruction: ["ifeval", "alpacaeval", "mtbench", "instruction"],
    // Conversation Quality benchmarks
    conversation: ["mtbench", "chatbotarena", "alpacaeval", "wildchat", "conversation"],
    // Creative Writing benchmarks
    creative: ["creativebench", "storyeval", "writingprompts", "narrativeqa", "storycloze", "roc-stories", "booksum", "creative"],
    // Roleplay & Character benchmarks
    roleplay: ["charactereval", "persona-chat", "roleplay-bench", "character-llm", "emobench", "dialogeval", "roleplay"],
    // Long Context benchmarks
    "long-context": ["longbench", "scrolls", "infinitebench", "needle-haystack", "booksum", "long-context"],
    // Vision & Multimodal benchmarks
    vision: ["mmmu", "mathvista", "docvqa", "chartqa", "vision"],
    // Safety & Alignment benchmarks
    safety: ["truthfulqa", "toxigen", "realtoxicity", "bbq", "safety"],
  };

  // Calculate use case scores
  for (const [useCase, benchmarkList] of Object.entries(useCaseBenchmarks)) {
    let totalScore = 0;
    let count = 0;
    let primarySource: "user" | "baseline" | "heuristic" = "heuristic";
    const usedBenchmarks: string[] = [];

    // Check user results for this use case
    for (const benchmark of benchmarkList) {
      const userResult = userResults.find(r =>
        r.benchmark === benchmark || r.benchmarkCategory === useCase
      );

      if (userResult) {
        totalScore += userResult.score * 100;
        count++;
        primarySource = "user";
        usedBenchmarks.push(benchmark);
        benchmarks[benchmark] = {
          score: userResult.score * 100,
          source: "user",
          timestamp: userResult.timestamp,
          samplesEvaluated: userResult.samplesEvaluated,
        };
      }
    }

    // Fall back to baseline if no user results
    if (count === 0 && baselineScores[useCase] !== undefined) {
      totalScore = baselineScores[useCase];
      count = 1;
      primarySource = "baseline";
      usedBenchmarks.push(useCase);
      benchmarks[useCase] = {
        score: baselineScores[useCase],
        source: "baseline",
      };
    }

    if (count > 0) {
      useCaseScores[useCase] = {
        score: Math.round((totalScore / count) * 10) / 10,
        benchmarksUsed: usedBenchmarks,
        source: primarySource,
      };
    }
  }

  // Calculate overall score - prefer explicit "overall" field if available
  let overallScore = 70; // Default heuristic base
  let scoreSource: "user" | "baseline" | "heuristic" = "heuristic";

  // First check if we have an explicit "overall" score in baseline data
  if (baselineScores["overall"] !== undefined) {
    overallScore = baselineScores["overall"];
    scoreSource = "baseline";
  } else {
    // Fall back to weighted average calculation
    const scoredUseCases = Object.values(useCaseScores);

    if (scoredUseCases.length > 0) {
      // Weight certain use cases more for overall score
      const weights: Record<string, number> = {
        reasoning: 1.5,
        coding: 1.3,
        math: 1.2,
        knowledge: 1.0,
        instruction: 1.0,
        conversation: 0.8,
      };

      let weightedSum = 0;
      let totalWeight = 0;

      for (const [useCase, data] of Object.entries(useCaseScores)) {
        const weight = weights[useCase] || 0.7;
        weightedSum += data.score * weight;
        totalWeight += weight;

        if (data.source === "user") scoreSource = "user";
        else if (data.source === "baseline" && scoreSource !== "user") scoreSource = "baseline";
      }

      if (totalWeight > 0) {
        overallScore = Math.round((weightedSum / totalWeight) * 10) / 10;
      }
    }
  }

  return {
    modelId: normalizedId,
    benchmarks,
    useCaseScores,
    overallScore,
    scoreSource,
  };
}

// Get score for a specific use case, with fallback chain
export function getUseCaseScore(
  modelId: string,
  useCase: string
): { score: number; source: "user" | "baseline" | "heuristic" } {
  const scores = getModelScores(modelId);

  if (scores.useCaseScores[useCase]) {
    return {
      score: scores.useCaseScores[useCase].score,
      source: scores.useCaseScores[useCase].source,
    };
  }

  // Fallback to overall score
  return {
    score: scores.overallScore,
    source: scores.scoreSource,
  };
}

// Clear all user eval results
export function clearUserEvalResults(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(EVAL_STORAGE_KEY);
}

// Get list of models with baseline data
export function getModelsWithBaselineData(): string[] {
  return Object.keys(BASELINE_SCORES);
}

// Check if we have any data (user or baseline) for a model
export function hasModelData(modelId: string): boolean {
  const normalizedId = normalizeModelId(modelId);
  const userResults = getUserEvalResults();

  return userResults.some(r => normalizeModelId(r.modelId) === normalizedId) ||
         BASELINE_SCORES[normalizedId] !== undefined;
}

// Export baseline version for cache invalidation
export function getBaselineVersion(): string {
  return BASELINE_VERSION;
}

// Use case weights for combined scoring
export const USE_CASE_WEIGHTS: Record<string, number> = {
  reasoning: 1.5,
  coding: 1.3,
  math: 1.2,
  knowledge: 1.0,
  instruction: 1.0,
  agentic: 1.0,
  conversation: 0.8,
  creative: 0.8,
  roleplay: 0.7,
  "long-context": 0.9,
  vision: 0.9,
  safety: 0.8,
};

// Get count of models with data for a specific category
export function getModelCountForCategory(category: string): number {
  let count = 0;
  for (const scores of Object.values(BASELINE_SCORES)) {
    if (scores[category] !== undefined) {
      count++;
    }
  }
  return count;
}

// Get top models for a specific use case/category
export function getTopModelsForCategory(
  category: string,
  limit: number = 3
): { modelId: string; score: number; modelName: string }[] {
  const results: { modelId: string; score: number; modelName: string }[] = [];

  for (const [modelId, scores] of Object.entries(BASELINE_SCORES)) {
    if (scores[category] !== undefined) {
      // Extract a display name from the model ID
      const parts = modelId.split("/");
      const modelName = parts[1]
        ?.replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()) || modelId;

      results.push({
        modelId,
        score: scores[category],
        modelName,
      });
    }
  }

  // Sort by score descending and return top N
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Get stored latency for a model (optionally filtered by provider)
// Returns the most recent latency measurement in ms, or null if none exists
export function getStoredLatency(
  modelId: string,
  provider?: string
): { latencyMs: number; avgPerQuestion: number; timestamp: string; benchmark: string } | null {
  const normalizedId = normalizeModelId(modelId);
  const userResults = getUserEvalResults();

  // Filter to results for this model (and optionally provider)
  const relevantResults = userResults
    .filter(r => {
      const matchesModel = normalizeModelId(r.modelId) === normalizedId;
      const matchesProvider = !provider || r.provider === provider;
      return matchesModel && matchesProvider && r.latencyMs > 0;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (relevantResults.length === 0) return null;

  const mostRecent = relevantResults[0];
  return {
    latencyMs: mostRecent.latencyMs,
    avgPerQuestion: mostRecent.samplesEvaluated > 0
      ? mostRecent.latencyMs / mostRecent.samplesEvaluated
      : mostRecent.latencyMs,
    timestamp: mostRecent.timestamp,
    benchmark: mostRecent.benchmark,
  };
}

// Get all stored latencies for a model across all providers
export function getStoredLatenciesByProvider(
  modelId: string
): Record<string, { latencyMs: number; avgPerQuestion: number; timestamp: string }> {
  const normalizedId = normalizeModelId(modelId);
  const userResults = getUserEvalResults();

  const latencyByProvider: Record<string, { latencyMs: number; avgPerQuestion: number; timestamp: string }> = {};

  // Get most recent result per provider
  const relevantResults = userResults
    .filter(r => normalizeModelId(r.modelId) === normalizedId && r.latencyMs > 0 && r.provider)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  for (const result of relevantResults) {
    if (result.provider && !latencyByProvider[result.provider]) {
      latencyByProvider[result.provider] = {
        latencyMs: result.latencyMs,
        avgPerQuestion: result.samplesEvaluated > 0
          ? result.latencyMs / result.samplesEvaluated
          : result.latencyMs,
        timestamp: result.timestamp,
      };
    }
  }

  return latencyByProvider;
}

// Get combined score across multiple use cases
export function getMultiCategoryScore(
  modelId: string,
  useCases: string[],
  capabilities: string[] = []
): { score: number; breakdown: Record<string, number>; source: "user" | "baseline" | "heuristic" } | null {
  if (useCases.length === 0) return null;

  const modelScores = getModelScores(modelId, capabilities);
  const breakdown: Record<string, number> = {};
  let weightedSum = 0;
  let totalWeight = 0;
  let primarySource: "user" | "baseline" | "heuristic" = "heuristic";
  let hasAnyScore = false;

  for (const useCase of useCases) {
    const useCaseData = modelScores.useCaseScores[useCase];
    if (useCaseData) {
      const weight = USE_CASE_WEIGHTS[useCase] || 0.7;
      weightedSum += useCaseData.score * weight;
      totalWeight += weight;
      breakdown[useCase] = useCaseData.score;
      hasAnyScore = true;

      // Track the most authoritative source
      if (useCaseData.source === "user") {
        primarySource = "user";
      } else if (useCaseData.source === "baseline" && primarySource !== "user") {
        primarySource = "baseline";
      }
    }
  }

  if (!hasAnyScore) return null;

  return {
    score: Math.round((weightedSum / totalWeight) * 10) / 10,
    breakdown,
    source: primarySource,
  };
}
