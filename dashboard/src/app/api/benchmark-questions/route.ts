import { NextRequest, NextResponse } from "next/server";
import {
  fetchBenchmarkQuestions,
  fetchBenchmarkQuestionsLarge,
  getBenchmarkInfo,
  listSupportedBenchmarks,
  BENCHMARK_CONFIGS,
} from "@/lib/benchmark-datasets";

/**
 * GET /api/benchmark-questions
 *
 * Fetch evaluation questions from official HuggingFace datasets
 *
 * Query params:
 * - benchmark: string (required) - e.g., "mmlu", "mmlu-pro", "gsm8k"
 * - limit: number (default: 10) - number of questions to fetch
 * - subject: string (optional) - filter by subject
 * - shuffle: boolean (default: true) - randomize question order
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const benchmark = searchParams.get("benchmark");
  const limit = parseInt(searchParams.get("limit") || "10");
  const subject = searchParams.get("subject") || undefined;
  const shuffle = searchParams.get("shuffle") !== "false";

  // If no benchmark specified, return list of supported benchmarks
  if (!benchmark) {
    return NextResponse.json({
      supported: listSupportedBenchmarks(),
      usage: "GET /api/benchmark-questions?benchmark=mmlu&limit=10",
    });
  }

  // Validate benchmark
  if (!BENCHMARK_CONFIGS[benchmark]) {
    return NextResponse.json(
      {
        error: `Unknown benchmark: ${benchmark}`,
        supported: Object.keys(BENCHMARK_CONFIGS),
      },
      { status: 400 }
    );
  }

  try {
    // Use large fetch for > 100 questions
    const questions = limit > 100
      ? await fetchBenchmarkQuestionsLarge(benchmark, limit, { subject, shuffle })
      : await fetchBenchmarkQuestions(benchmark, { limit, subject, shuffle });

    const info = getBenchmarkInfo(benchmark);

    return NextResponse.json({
      benchmark,
      info,
      count: questions.length,
      questions,
      source: `https://huggingface.co/datasets/${BENCHMARK_CONFIGS[benchmark].dataset}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch benchmark questions:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch benchmark questions",
        details: error instanceof Error ? error.message : "Unknown error",
        benchmark,
      },
      { status: 500 }
    );
  }
}
