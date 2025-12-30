import { OpenRouterClient } from "./openrouter.js";
import type {
  EvalResult,
  MMLUQuestion,
  ProviderEndpoint,
  ProviderRouting,
} from "./types.js";

/**
 * Run MMLU evaluation on a specific provider endpoint
 */
export async function runProviderEval(config: {
  model: string;
  endpoint: ProviderEndpoint;
  apiKey: string;
  questions: MMLUQuestion[];
}): Promise<EvalResult> {
  const { model, endpoint, apiKey, questions } = config;
  const startTime = Date.now();
  const client = new OpenRouterClient(apiKey);

  let correct = 0;
  let total = 0;
  const errors: string[] = [];

  // Route to specific provider using the endpoint's provider_name
  const providerRouting: ProviderRouting = {
    order: [endpoint.provider_name],
    allow_fallbacks: false,
  };

  for (const question of questions) {
    try {
      const response = await client.chatCompletion({
        model,
        messages: [
          {
            role: "user",
            content: formatMMLUQuestion(question),
          },
        ],
        provider: providerRouting,
        max_tokens: 10,
        temperature: 0,
      });

      const answer = extractAnswer(response.choices[0]?.message?.content ?? "");
      if (answer === question.answer) {
        correct++;
      }
      total++;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`Q${total + 1}: ${errorMsg}`);
      total++;
    }
  }

  return {
    provider: endpoint.provider_name,
    providerTag: endpoint.tag,
    model,
    benchmark: "mmlu",
    score: total > 0 ? correct / total : null,
    error: errors.length > 0 ? errors.slice(0, 3).join("; ") + (errors.length > 3 ? `... and ${errors.length - 3} more` : "") : undefined,
    duration_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    samples_evaluated: total,
    metadata: {
      quantization: endpoint.quantization,
      context_length: endpoint.context_length,
      pricing: {
        prompt: endpoint.pricing.prompt,
        completion: endpoint.pricing.completion,
      },
      uptime: endpoint.uptime_last_30m,
    },
  };
}

/**
 * Run MMLU evaluation across all providers for a model
 */
export async function runAllProvidersEval(config: {
  model: string;
  apiKey: string;
  questions: MMLUQuestion[];
  providerTags?: string[];
  onProgress?: (result: EvalResult, index: number, total: number) => void;
}): Promise<EvalResult[]> {
  const { model, apiKey, questions, providerTags, onProgress } = config;
  const client = new OpenRouterClient(apiKey);

  // Get all endpoints for this model
  const modelData = await client.getModelEndpoints(model);
  if (!modelData) {
    throw new Error(`Model not found: ${model}`);
  }

  // Filter endpoints if specific tags requested
  let endpoints = modelData.endpoints.filter((e) => e.status === 0);
  if (providerTags && providerTags.length > 0) {
    endpoints = endpoints.filter((e) => providerTags.includes(e.tag));
  }

  if (endpoints.length === 0) {
    throw new Error(`No active endpoints found for model: ${model}`);
  }

  const results: EvalResult[] = [];

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    const result = await runProviderEval({
      model,
      endpoint,
      apiKey,
      questions,
    });
    results.push(result);

    if (onProgress) {
      onProgress(result, i + 1, endpoints.length);
    }
  }

  return results;
}

/**
 * Run MMLU eval directly via OpenRouter API (default routing, no provider specified)
 */
export async function runMMLUDirect(config: {
  model: string;
  apiKey: string;
  limit?: number;
  questions?: MMLUQuestion[];
}): Promise<EvalResult> {
  const { model, apiKey, limit = 10 } = config;
  const startTime = Date.now();
  const client = new OpenRouterClient(apiKey);

  const questions = config.questions ?? (await loadMMLUSample(limit));

  let correct = 0;
  let total = 0;
  const errors: string[] = [];

  for (const question of questions) {
    try {
      const response = await client.chatCompletion({
        model,
        messages: [
          {
            role: "user",
            content: formatMMLUQuestion(question),
          },
        ],
        max_tokens: 10,
        temperature: 0,
      });

      const answer = extractAnswer(response.choices[0]?.message?.content ?? "");
      if (answer === question.answer) {
        correct++;
      }
      total++;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`Q${total + 1}: ${errorMsg}`);
      total++;
    }
  }

  return {
    provider: "openrouter-default",
    providerTag: "default",
    model,
    benchmark: "mmlu",
    score: total > 0 ? correct / total : null,
    error: errors.length > 0 ? errors.join("; ") : undefined,
    duration_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    samples_evaluated: total,
  };
}

function formatMMLUQuestion(q: MMLUQuestion): string {
  const choices = q.choices
    .map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`)
    .join("\n");

  return `The following is a multiple choice question about ${q.subject.replace(/_/g, " ")}.

${q.question}

${choices}

Answer with just the letter (A, B, C, or D):`;
}

function extractAnswer(response: string): string {
  // Extract the first letter A-D from the response
  const match = response.trim().match(/^[ABCD]/i);
  return match ? match[0].toUpperCase() : "";
}

/**
 * Load a sample of MMLU questions
 * These are real MMLU-style questions across different subjects
 */
export async function loadMMLUSample(limit: number): Promise<MMLUQuestion[]> {
  const sampleQuestions: MMLUQuestion[] = [
    {
      subject: "abstract_algebra",
      question:
        "Find the degree for the given field extension Q(sqrt(2), sqrt(3), sqrt(18)) over Q.",
      choices: ["0", "4", "2", "6"],
      answer: "B",
    },
    {
      subject: "anatomy",
      question: "The longest muscle in the human body is the:",
      choices: ["Sartorius", "Gracilis", "Rectus femoris", "Biceps femoris"],
      answer: "A",
    },
    {
      subject: "astronomy",
      question: "What is the largest moon of Saturn?",
      choices: ["Enceladus", "Titan", "Rhea", "Iapetus"],
      answer: "B",
    },
    {
      subject: "business_ethics",
      question:
        "The practice of using environmentally friendly practices as a marketing tool without actually implementing them is called:",
      choices: [
        "Greenwashing",
        "Cause marketing",
        "Social marketing",
        "Sustainable development",
      ],
      answer: "A",
    },
    {
      subject: "clinical_knowledge",
      question: "The longest nerve in the human body is:",
      choices: [
        "Sciatic nerve",
        "Vagus nerve",
        "Femoral nerve",
        "Tibial nerve",
      ],
      answer: "A",
    },
    {
      subject: "college_biology",
      question:
        "In aerobic respiration, the final electron acceptor in the electron transport chain is:",
      choices: ["NAD+", "FAD", "Oxygen", "Cytochrome c"],
      answer: "C",
    },
    {
      subject: "college_chemistry",
      question: "The hybridization of carbon in carbon dioxide is:",
      choices: ["sp", "sp2", "sp3", "sp3d"],
      answer: "A",
    },
    {
      subject: "college_computer_science",
      question: "What is the time complexity of binary search?",
      choices: ["O(n)", "O(log n)", "O(n log n)", "O(1)"],
      answer: "B",
    },
    {
      subject: "college_mathematics",
      question: "The derivative of e^x is:",
      choices: ["x * e^(x-1)", "e^x", "e^x * ln(e)", "x * e^x"],
      answer: "B",
    },
    {
      subject: "college_physics",
      question: "The SI unit of electric current is:",
      choices: ["Volt", "Ohm", "Ampere", "Watt"],
      answer: "C",
    },
    {
      subject: "computer_security",
      question: "What does SQL injection attack exploit?",
      choices: [
        "Buffer overflow vulnerabilities",
        "Improperly filtered user input in SQL queries",
        "Cross-site scripting flaws",
        "Session management weaknesses",
      ],
      answer: "B",
    },
    {
      subject: "conceptual_physics",
      question:
        "An object in free fall near Earth's surface accelerates at approximately:",
      choices: ["5 m/s^2", "10 m/s^2", "15 m/s^2", "20 m/s^2"],
      answer: "B",
    },
    {
      subject: "econometrics",
      question: "Ordinary Least Squares (OLS) estimators are BLUE when:",
      choices: [
        "Errors are normally distributed",
        "The Gauss-Markov assumptions hold",
        "The sample size is large",
        "R-squared is high",
      ],
      answer: "B",
    },
    {
      subject: "electrical_engineering",
      question: "The unit of electrical resistance is:",
      choices: ["Farad", "Henry", "Ohm", "Siemens"],
      answer: "C",
    },
    {
      subject: "elementary_mathematics",
      question: "What is 7 x 8?",
      choices: ["54", "56", "58", "64"],
      answer: "B",
    },
    {
      subject: "formal_logic",
      question:
        "In propositional logic, if P implies Q, and Q implies R, then P implies:",
      choices: ["P", "Q", "R", "Not R"],
      answer: "C",
    },
    {
      subject: "global_facts",
      question: "Which country has the largest population as of 2023?",
      choices: ["United States", "India", "China", "Indonesia"],
      answer: "B",
    },
    {
      subject: "high_school_biology",
      question: "The powerhouse of the cell is the:",
      choices: [
        "Nucleus",
        "Ribosome",
        "Mitochondria",
        "Endoplasmic reticulum",
      ],
      answer: "C",
    },
    {
      subject: "high_school_chemistry",
      question: "Water has a pH of approximately:",
      choices: ["5", "7", "9", "14"],
      answer: "B",
    },
    {
      subject: "high_school_physics",
      question: "Newton's first law of motion is also known as the law of:",
      choices: ["Acceleration", "Inertia", "Action-reaction", "Gravitation"],
      answer: "B",
    },
    {
      subject: "high_school_geography",
      question: "The longest river in the world is:",
      choices: ["Amazon", "Nile", "Yangtze", "Mississippi"],
      answer: "B",
    },
    {
      subject: "high_school_history",
      question: "The French Revolution began in:",
      choices: ["1776", "1789", "1799", "1815"],
      answer: "B",
    },
    {
      subject: "machine_learning",
      question:
        "Which activation function is most commonly used in the output layer for binary classification?",
      choices: ["ReLU", "Sigmoid", "Tanh", "Softmax"],
      answer: "B",
    },
    {
      subject: "management",
      question:
        "The management function that involves setting goals and deciding how to achieve them is:",
      choices: ["Planning", "Organizing", "Leading", "Controlling"],
      answer: "A",
    },
    {
      subject: "marketing",
      question: "The 4 Ps of marketing are Product, Price, Place, and:",
      choices: ["People", "Promotion", "Process", "Performance"],
      answer: "B",
    },
    {
      subject: "medical_genetics",
      question: "Huntington's disease is inherited in what pattern?",
      choices: [
        "Autosomal recessive",
        "Autosomal dominant",
        "X-linked recessive",
        "Mitochondrial",
      ],
      answer: "B",
    },
    {
      subject: "philosophy",
      question: '"I think, therefore I am" was stated by:',
      choices: ["Plato", "Aristotle", "Descartes", "Kant"],
      answer: "C",
    },
    {
      subject: "professional_law",
      question:
        "The doctrine of stare decisis means that courts should:",
      choices: [
        "Always follow statutory law over case law",
        "Follow precedent set by higher courts",
        "Decide cases based on equity",
        "Defer to administrative agencies",
      ],
      answer: "B",
    },
    {
      subject: "world_religions",
      question: "The Five Pillars are central to which religion?",
      choices: ["Buddhism", "Hinduism", "Islam", "Judaism"],
      answer: "C",
    },
    {
      subject: "virology",
      question: "COVID-19 is caused by a virus from which family?",
      choices: ["Orthomyxoviridae", "Coronaviridae", "Flaviviridae", "Retroviridae"],
      answer: "B",
    },
  ];

  return sampleQuestions.slice(0, limit);
}

export { MMLUQuestion };
