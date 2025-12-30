"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchWithRetry, getFetchErrorMessage } from "@/lib/fetch-utils";

export interface DashboardStats {
  totalModels: number;
  activeProviders: number;
  uniqueEndpoints: number;
  avgUptime: number;
}

interface DashboardResponse extends DashboardStats {
  timestamp: string;
}

export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchStats = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setError(null);

    try {
      const data = await fetchWithRetry<DashboardResponse>("/api/dashboard", {
        signal: abortControllerRef.current.signal,
      });
      setStats({
        totalModels: data.totalModels,
        activeProviders: data.activeProviders,
        uniqueEndpoints: data.uniqueEndpoints,
        avgUptime: data.avgUptime,
      });
    } catch (err) {
      // Ignore abort errors
      if ((err as Error).name === "AbortError") return;
      setError(getFetchErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
  };
}
