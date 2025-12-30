"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchWithRetry, getFetchErrorMessage } from "@/lib/fetch-utils";

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

export interface UseCase {
  id: string;
  name: string;
  description: string;
  benchmarkCount: number;
  benchmarks: string[];
  primaryBenchmark: string;
  primaryBenchmarkName: string;
  requiredCapabilities: string[];
}

interface BenchmarksResponse {
  benchmarks: Benchmark[];
  categories: BenchmarkCategory[];
  allCategories: string[];
  allCapabilities: string[];
  useCases: UseCase[];
  total: number;
}

interface UseBenchmarksOptions {
  category?: string;
  capability?: string;
  useCase?: string;
}

export function useBenchmarks(options: UseBenchmarksOptions = {}) {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [categories, setCategories] = useState<BenchmarkCategory[]>([]);
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [allCapabilities, setAllCapabilities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchBenchmarks = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.category) params.set("category", options.category);
      if (options.capability) params.set("capability", options.capability);
      if (options.useCase) params.set("useCase", options.useCase);

      const data = await fetchWithRetry<BenchmarksResponse>(`/api/benchmarks?${params}`, {
        signal: abortControllerRef.current.signal,
      });
      setBenchmarks(data.benchmarks);
      setCategories(data.categories);
      setUseCases(data.useCases);
      setAllCategories(data.allCategories);
      setAllCapabilities(data.allCapabilities);
    } catch (err) {
      // Ignore abort errors
      if ((err as Error).name === "AbortError") return;
      setError(getFetchErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [options.category, options.capability, options.useCase]);

  useEffect(() => {
    fetchBenchmarks();

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchBenchmarks]);

  return {
    benchmarks,
    categories,
    useCases,
    allCategories,
    allCapabilities,
    loading,
    error,
    refetch: fetchBenchmarks,
  };
}

// Helper to get benchmarks suitable for a model based on its capabilities
export function getBenchmarksForModel(
  benchmarks: Benchmark[],
  modelCapabilities: string[]
): Benchmark[] {
  if (modelCapabilities.length === 0) {
    // If no capabilities specified, return all general benchmarks
    return benchmarks.filter(
      (b) => b.capabilities.includes("chat") || b.capabilities.length === 0
    );
  }

  return benchmarks.filter((b) =>
    b.capabilities.some((cap) => modelCapabilities.includes(cap))
  );
}
