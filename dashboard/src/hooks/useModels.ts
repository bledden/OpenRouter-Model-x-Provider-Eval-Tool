"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchWithRetry, getFetchErrorMessage } from "@/lib/fetch-utils";

export interface Model {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  pricing: { input: number; output: number };
  capabilities: string[];
  modality?: string;
  isModerated?: boolean;
}

export interface ModelCategory {
  id: string;
  name: string;
  count: number;
}

interface ModelsResponse {
  models: Model[];
  categories: ModelCategory[];
  capabilities: Record<string, number>;
  total: number;
  returned: number;
}

interface UseModelsOptions {
  provider?: string;
  capability?: string;
  search?: string;
  limit?: number;
  sort?: "name" | "context" | "price";
}

export function useModels(options: UseModelsOptions = {}) {
  const [models, setModels] = useState<Model[]>([]);
  const [categories, setCategories] = useState<ModelCategory[]>([]);
  const [capabilities, setCapabilities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchModels = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.provider) params.set("provider", options.provider);
      if (options.capability) params.set("capability", options.capability);
      if (options.search) params.set("search", options.search);
      if (options.limit) params.set("limit", options.limit.toString());
      if (options.sort) params.set("sort", options.sort);

      const data = await fetchWithRetry<ModelsResponse>(`/api/models?${params}`, {
        signal: abortControllerRef.current.signal,
      });
      setModels(data.models);
      setCategories(data.categories);
      setCapabilities(data.capabilities);
      setTotal(data.total);
    } catch (err) {
      // Ignore abort errors
      if ((err as Error).name === "AbortError") return;
      setError(getFetchErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [options.provider, options.capability, options.search, options.limit, options.sort]);

  useEffect(() => {
    fetchModels();

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchModels]);

  return {
    models,
    categories,
    capabilities,
    total,
    loading,
    error,
    refetch: fetchModels,
  };
}
