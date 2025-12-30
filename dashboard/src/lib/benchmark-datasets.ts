/**
 * Benchmark Dataset Service
 * Fetches evaluation questions from official HuggingFace datasets
 *
 * Supported datasets:
 * - cais/mmlu (Official MMLU from Center for AI Safety)
 * - TIGER-Lab/MMLU-Pro (Enhanced MMLU from NeurIPS 2024)
 * - openai/gsm8k (Grade School Math)
 * - openai/humaneval (Code generation)
 */

const HF_DATASETS_API = "https://datasets-server.huggingface.co";

// Dataset configurations for supported benchmarks
// Sources: Official HuggingFace datasets from trusted organizations
export const BENCHMARK_CONFIGS: Record<string, {
  dataset: string;
  config?: string;
  split: string;
  questionField: string;
  choicesField: string;
  answerField: string;
  subjectField?: string;
  formatAnswer: (answer: number | string, row?: Record<string, unknown>) => string;
  formatChoices: (choices: string[], row?: Record<string, unknown>) => string[];
  formatQuestion?: (question: string, row?: Record<string, unknown>) => string;
}> = {
  // === Knowledge Benchmarks ===
  mmlu: {
    dataset: "cais/mmlu", // Official MMLU from Center for AI Safety
    config: "all",
    split: "test",
    questionField: "question",
    choicesField: "choices",
    answerField: "answer",
    subjectField: "subject",
    formatAnswer: (answer) => ["A", "B", "C", "D"][answer as number],
    formatChoices: (choices) => choices.map((c, i) => `${["A", "B", "C", "D"][i]}) ${c}`),
  },
  "mmlu-pro": {
    dataset: "TIGER-Lab/MMLU-Pro", // Enhanced MMLU (NeurIPS 2024)
    split: "test",
    questionField: "question",
    choicesField: "options",
    answerField: "answer",
    subjectField: "category",
    formatAnswer: (answer) => String(answer),
    formatChoices: (choices) => choices.map((c, i) => `${["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"][i]}) ${c}`),
  },
  truthfulqa: {
    dataset: "truthfulqa/truthful_qa", // Official TruthfulQA
    config: "multiple_choice",
    split: "validation",
    questionField: "question",
    choicesField: "mc1_targets",
    answerField: "mc1_targets",
    subjectField: "category",
    formatAnswer: (answer, row) => {
      // mc1_targets has {choices: [], labels: [0,1,0,0]} format - find the 1
      const targets = row?.mc1_targets as { choices: string[]; labels: number[] } | undefined;
      if (targets?.labels) {
        const correctIdx = targets.labels.indexOf(1);
        return ["A", "B", "C", "D", "E"][correctIdx] || "A";
      }
      return "A";
    },
    formatChoices: (choices, row) => {
      const targets = row?.mc1_targets as { choices: string[] } | undefined;
      const actualChoices = targets?.choices || choices;
      return actualChoices.map((c, i) => `${["A", "B", "C", "D", "E"][i]}) ${c}`);
    },
  },

  // === Reasoning Benchmarks ===
  gpqa: {
    dataset: "Idavidrein/gpqa", // Official GPQA Diamond
    config: "gpqa_diamond",
    split: "train", // GPQA uses train split
    questionField: "Question",
    choicesField: "choices",
    answerField: "Answer",
    subjectField: "High-level domain",
    formatAnswer: (answer) => String(answer).charAt(0).toUpperCase(),
    formatChoices: (choices, row) => {
      // GPQA has separate choice columns
      const a = row?.["Choice A"] as string || "";
      const b = row?.["Choice B"] as string || "";
      const c = row?.["Choice C"] as string || "";
      const d = row?.["Choice D"] as string || "";
      return [`A) ${a}`, `B) ${b}`, `C) ${c}`, `D) ${d}`].filter(c => c.length > 3);
    },
  },
  arc: {
    dataset: "allenai/ai2_arc", // Official ARC from Allen AI
    config: "ARC-Challenge",
    split: "test",
    questionField: "question",
    choicesField: "choices",
    answerField: "answerKey",
    formatAnswer: (answer) => String(answer),
    formatChoices: (choices, row) => {
      const choicesObj = row?.choices as { text: string[]; label: string[] } | undefined;
      if (choicesObj?.text && choicesObj?.label) {
        return choicesObj.text.map((t, i) => `${choicesObj.label[i]}) ${t}`);
      }
      return [];
    },
  },
  hellaswag: {
    dataset: "Rowan/hellaswag", // HellaSwag commonsense reasoning
    split: "validation",
    questionField: "ctx",
    choicesField: "endings",
    answerField: "label",
    subjectField: "activity_label",
    formatAnswer: (answer) => ["A", "B", "C", "D"][parseInt(String(answer))],
    formatChoices: (choices) => choices.map((c, i) => `${["A", "B", "C", "D"][i]}) ${c}`),
  },
  winogrande: {
    dataset: "allenai/winogrande", // Winogrande commonsense
    config: "winogrande_xl",
    split: "validation",
    questionField: "sentence",
    choicesField: "choices",
    answerField: "answer",
    formatAnswer: (answer) => String(answer) === "1" ? "A" : "B",
    formatChoices: (choices, row) => {
      const opt1 = row?.option1 as string || "";
      const opt2 = row?.option2 as string || "";
      return [`A) ${opt1}`, `B) ${opt2}`];
    },
  },

  // === Math Benchmarks ===
  gsm8k: {
    dataset: "openai/gsm8k", // Official GSM8K from OpenAI
    config: "main",
    split: "test",
    questionField: "question",
    choicesField: "", // Free-form, not multiple choice
    answerField: "answer",
    formatAnswer: (answer) => {
      const match = String(answer).match(/####\s*(.+)/);
      return match ? match[1].trim() : String(answer);
    },
    formatChoices: () => [],
  },
  math: {
    dataset: "lighteval/MATH", // MATH benchmark
    config: "all",
    split: "test",
    questionField: "problem",
    choicesField: "",
    answerField: "solution",
    subjectField: "type",
    formatAnswer: (answer) => {
      // Extract boxed answer from solution
      const match = String(answer).match(/\\boxed\{([^}]+)\}/);
      return match ? match[1] : String(answer).slice(-20);
    },
    formatChoices: () => [],
  },

  // === Coding Benchmarks ===
  humaneval: {
    dataset: "openai/openai_humaneval", // Official HumanEval from OpenAI
    split: "test",
    questionField: "prompt",
    choicesField: "",
    answerField: "canonical_solution",
    subjectField: "entry_point",
    formatAnswer: (answer) => String(answer),
    formatChoices: () => [],
    formatQuestion: (question, row) => {
      const task = row?.task_id as string || "";
      return `# ${task}\n${question}`;
    },
  },
  mbpp: {
    dataset: "google-research-datasets/mbpp", // MBPP coding benchmark
    config: "sanitized",
    split: "test",
    questionField: "text",
    choicesField: "",
    answerField: "code",
    formatAnswer: (answer) => String(answer),
    formatChoices: () => [],
  },

  // === Instruction Following ===
  ifeval: {
    dataset: "google/IFEval", // Official IFEval from Google
    split: "train",
    questionField: "prompt",
    choicesField: "",
    answerField: "instruction_id_list",
    formatAnswer: (answer) => JSON.stringify(answer),
    formatChoices: () => [],
  },

  // === Long Context ===
  scrolls: {
    dataset: "tau/scrolls", // SCROLLS long context benchmark
    config: "qasper",
    split: "test",
    questionField: "input",
    choicesField: "",
    answerField: "output",
    formatAnswer: (answer) => String(answer),
    formatChoices: () => [],
  },
};

export interface BenchmarkQuestion {
  id: string;
  question: string;
  choices: string[];
  answer: string;
  subject: string;
  benchmark: string;
}

interface HFDatasetRow {
  row_idx: number;
  row: Record<string, unknown>;
}

interface HFDatasetResponse {
  features: Array<{ name: string; type: string }>;
  rows: HFDatasetRow[];
  num_rows_total: number;
  num_rows_per_page: number;
}

// In-memory cache for fetched questions
const questionCache: Map<string, {
  questions: BenchmarkQuestion[];
  fetchedAt: number;
}> = new Map();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

/**
 * Fetch benchmark questions from HuggingFace datasets API
 */
export async function fetchBenchmarkQuestions(
  benchmark: string,
  options: {
    limit?: number;
    offset?: number;
    subject?: string;
    shuffle?: boolean;
  } = {}
): Promise<BenchmarkQuestion[]> {
  const { limit = 100, offset = 0, subject, shuffle = true } = options;

  const config = BENCHMARK_CONFIGS[benchmark];
  if (!config) {
    throw new Error(`Unknown benchmark: ${benchmark}. Supported: ${Object.keys(BENCHMARK_CONFIGS).join(", ")}`);
  }

  // Check cache first
  const cacheKey = `${benchmark}-${config.config || "default"}-${offset}-${limit}`;
  const cached = questionCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    let questions = cached.questions;
    if (subject) {
      questions = questions.filter(q => q.subject.toLowerCase() === subject.toLowerCase());
    }
    if (shuffle) {
      questions = shuffleArray([...questions]);
    }
    return questions.slice(0, limit);
  }

  // Build API URL
  const params = new URLSearchParams({
    dataset: config.dataset,
    split: config.split,
    offset: String(offset),
    length: String(Math.min(limit, 100)), // HF API max is 100 per request
  });

  if (config.config) {
    params.set("config", config.config);
  }

  const url = `${HF_DATASETS_API}/rows?${params}`;

  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HuggingFace API error: ${response.status} - ${errorText}`);
    }

    const data: HFDatasetResponse = await response.json();

    const questions: BenchmarkQuestion[] = data.rows.map((item, idx) => {
      const row = item.row;
      const rawChoices = config.choicesField ? (row[config.choicesField] as string[]) || [] : [];
      const rawAnswer = row[config.answerField];
      const rawQuestion = String(row[config.questionField] || "");

      // Format question (some benchmarks need row context)
      const formattedQuestion = config.formatQuestion
        ? config.formatQuestion(rawQuestion, row)
        : rawQuestion;

      return {
        id: `${benchmark}-${offset + idx}`,
        question: formattedQuestion,
        choices: config.formatChoices(rawChoices, row),
        answer: config.formatAnswer(rawAnswer as number | string, row),
        subject: config.subjectField ? String(row[config.subjectField] || "general") : "general",
        benchmark,
      };
    }).filter(q => q.question.length > 0);

    // Cache the results
    questionCache.set(cacheKey, {
      questions,
      fetchedAt: Date.now(),
    });

    let result = questions;
    if (subject) {
      result = result.filter(q => q.subject.toLowerCase() === subject.toLowerCase());
    }
    if (shuffle) {
      result = shuffleArray([...result]);
    }

    return result.slice(0, limit);
  } catch (error) {
    console.error(`Failed to fetch ${benchmark} questions:`, error);
    throw error;
  }
}

/**
 * Fetch multiple pages of questions for larger evaluations
 */
export async function fetchBenchmarkQuestionsLarge(
  benchmark: string,
  totalQuestions: number,
  options: { subject?: string; shuffle?: boolean } = {}
): Promise<BenchmarkQuestion[]> {
  const pageSize = 100;
  const pages = Math.ceil(totalQuestions / pageSize);
  const allQuestions: BenchmarkQuestion[] = [];

  for (let page = 0; page < pages; page++) {
    const offset = page * pageSize;
    const limit = Math.min(pageSize, totalQuestions - allQuestions.length);

    const questions = await fetchBenchmarkQuestions(benchmark, {
      limit,
      offset,
      subject: options.subject,
      shuffle: false, // Don't shuffle individual pages
    });

    allQuestions.push(...questions);

    if (allQuestions.length >= totalQuestions) break;
  }

  if (options.shuffle) {
    return shuffleArray(allQuestions).slice(0, totalQuestions);
  }

  return allQuestions.slice(0, totalQuestions);
}

/**
 * Get available subjects for a benchmark
 */
export async function getBenchmarkSubjects(benchmark: string): Promise<string[]> {
  const questions = await fetchBenchmarkQuestions(benchmark, { limit: 100, shuffle: false });
  const subjects = [...new Set(questions.map(q => q.subject))];
  return subjects.sort();
}

/**
 * Get benchmark metadata
 */
export function getBenchmarkInfo(benchmark: string) {
  const config = BENCHMARK_CONFIGS[benchmark];
  if (!config) return null;

  return {
    id: benchmark,
    dataset: config.dataset,
    split: config.split,
    isMultipleChoice: !!config.choicesField,
    source: `https://huggingface.co/datasets/${config.dataset}`,
  };
}

/**
 * List all supported benchmarks
 */
export function listSupportedBenchmarks() {
  return Object.keys(BENCHMARK_CONFIGS).map(id => ({
    id,
    ...getBenchmarkInfo(id),
  }));
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Clear the question cache
 */
export function clearBenchmarkCache() {
  questionCache.clear();
}
