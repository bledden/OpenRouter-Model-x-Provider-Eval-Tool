import { NextRequest, NextResponse } from "next/server";
import { availableBenchmarks, useCases } from "@/lib/benchmark-config";

export interface Benchmark {
  id: string;
  name: string;
  category: string;
  description: string;
  capabilities: string[];
}

export interface BenchmarkCategory {
  id: string;
  name: string;
  count: number;
  benchmarks: Benchmark[];
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get("category");
  const capability = searchParams.get("capability");
  const useCase = searchParams.get("useCase");

  let benchmarks = [...availableBenchmarks] as Benchmark[];

  // Filter by category
  if (category) {
    benchmarks = benchmarks.filter(
      (b) => b.category.toLowerCase() === category.toLowerCase()
    );
  }

  // Filter by capability (model capability)
  if (capability) {
    const caps = capability.split(",");
    benchmarks = benchmarks.filter((b) =>
      caps.some((cap) => b.capabilities?.includes(cap))
    );
  }

  // Filter by use case (predefined benchmark sets)
  if (useCase) {
    const useCaseData = useCases.find((uc) => uc.id === useCase);
    if (useCaseData) {
      benchmarks = benchmarks.filter((b) =>
        useCaseData.benchmarks.includes(b.id)
      );
    }
  }

  // Group by category
  const categoryMap: Record<string, Benchmark[]> = {};
  for (const benchmark of benchmarks) {
    if (!categoryMap[benchmark.category]) {
      categoryMap[benchmark.category] = [];
    }
    categoryMap[benchmark.category].push(benchmark);
  }

  const categories: BenchmarkCategory[] = Object.entries(categoryMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, items]) => ({
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      count: items.length,
      benchmarks: items,
    }));

  // Get all unique categories for filtering
  const allCategories = [...new Set(availableBenchmarks.map((b) => b.category))].sort();

  // Get all unique capabilities
  const allCapabilities = [
    ...new Set(availableBenchmarks.flatMap((b) => b.capabilities || [])),
  ].sort();

  return NextResponse.json({
    benchmarks,
    categories,
    allCategories,
    allCapabilities,
    useCases: useCases.map((uc) => ({
      id: uc.id,
      name: uc.name,
      description: uc.description,
      benchmarkCount: uc.benchmarks.length,
      benchmarks: uc.benchmarks,
      primaryBenchmark: uc.primaryBenchmark,
      primaryBenchmarkName: uc.primaryBenchmarkName,
      requiredCapabilities: uc.requiredCapabilities,
    })),
    total: benchmarks.length,
    timestamp: new Date().toISOString(),
  });
}
