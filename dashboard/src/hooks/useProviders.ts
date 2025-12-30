"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchWithRetry, getFetchErrorMessage } from "@/lib/fetch-utils";

export interface Provider {
  id: string;
  name: string;
  tag: string;
  status: "healthy" | "warning" | "error";
  quantization: string;
  uptime: number;
  latencyP50: number;
  latencyP95: number;
  pricing: { input: number; output: number };
  modelCount: number;
}

interface ProvidersResponse {
  providers: Provider[];
  model: string;
  timestamp: string;
}

interface UseProvidersOptions {
  model?: string;
}

export function useProviders(options: UseProvidersOptions = {}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchProviders = useCallback(async (modelId?: string) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (modelId) params.set("model", modelId);

      const data = await fetchWithRetry<ProvidersResponse>(`/api/providers?${params}`, {
        signal: abortControllerRef.current.signal,
      });
      setProviders(data.providers);
    } catch (err) {
      // Ignore abort errors
      if ((err as Error).name === "AbortError") return;
      setError(getFetchErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when model changes
  useEffect(() => {
    fetchProviders(options.model);

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [options.model, fetchProviders]);

  return {
    providers,
    loading,
    error,
    refetch: () => fetchProviders(options.model),
  };
}
