import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Simple MMLU questions for testing
const MMLU_SAMPLE = [
  {
    question: "What is the capital of France?",
    choices: ["A) London", "B) Berlin", "C) Paris", "D) Madrid"],
    answer: "C",
    subject: "geography",
  },
  {
    question: "What is the chemical symbol for gold?",
    choices: ["A) Go", "B) Au", "C) Ag", "D) Gd"],
    answer: "B",
    subject: "chemistry",
  },
  {
    question: "Who wrote 'Romeo and Juliet'?",
    choices: ["A) Charles Dickens", "B) Jane Austen", "C) William Shakespeare", "D) Mark Twain"],
    answer: "C",
    subject: "literature",
  },
  {
    question: "What is the largest planet in our solar system?",
    choices: ["A) Earth", "B) Saturn", "C) Jupiter", "D) Neptune"],
    answer: "C",
    subject: "astronomy",
  },
  {
    question: "What is the powerhouse of the cell?",
    choices: ["A) Nucleus", "B) Mitochondria", "C) Ribosome", "D) Golgi apparatus"],
    answer: "B",
    subject: "biology",
  },
];

interface EvalRequest {
  model: string;
  provider?: string;
  benchmark: string;
  limit?: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callOpenRouter(
  model: string,
  messages: ChatMessage[],
  provider?: string
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: 10,
    temperature: 0,
  };

  if (provider) {
    body.provider = {
      order: [provider],
      allow_fallbacks: false,
    };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://eval-dashboard.local",
      "X-Title": "Provider Eval Dashboard",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content ?? "";
}

export async function POST(request: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const body: EvalRequest = await request.json();
    const { model, provider, benchmark, limit = 5 } = body;

    if (!model || !benchmark) {
      return NextResponse.json(
        { error: "Model and benchmark required" },
        { status: 400 }
      );
    }

    // Currently only support MMLU
    if (benchmark !== "mmlu") {
      return NextResponse.json(
        { error: "Only MMLU benchmark currently supported" },
        { status: 400 }
      );
    }

    const questions = MMLU_SAMPLE.slice(0, Math.min(limit, MMLU_SAMPLE.length));
    const results: Array<{
      question: string;
      expected: string;
      predicted: string;
      correct: boolean;
      latencyMs: number;
    }> = [];

    const startTime = Date.now();

    for (const q of questions) {
      const prompt = `Answer the following multiple choice question. Respond with only the letter (A, B, C, or D).

Question: ${q.question}
${q.choices.join("\n")}

Answer:`;

      const questionStart = Date.now();

      try {
        const response = await callOpenRouter(
          model,
          [{ role: "user", content: prompt }],
          provider
        );

        // Extract answer letter from response
        const predicted = response.trim().toUpperCase().charAt(0);
        const correct = predicted === q.answer;

        results.push({
          question: q.question,
          expected: q.answer,
          predicted,
          correct,
          latencyMs: Date.now() - questionStart,
        });
      } catch (error) {
        results.push({
          question: q.question,
          expected: q.answer,
          predicted: "ERROR",
          correct: false,
          latencyMs: Date.now() - questionStart,
        });
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const correctCount = results.filter((r) => r.correct).length;
    const score = correctCount / results.length;

    return NextResponse.json({
      model,
      provider: provider ?? "default",
      benchmark,
      score,
      samplesEvaluated: results.length,
      correctCount,
      durationMs: totalDurationMs,
      avgLatencyMs: totalDurationMs / results.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Evaluation error:", error);
    return NextResponse.json(
      { error: `Evaluation failed: ${error}` },
      { status: 500 }
    );
  }
}
