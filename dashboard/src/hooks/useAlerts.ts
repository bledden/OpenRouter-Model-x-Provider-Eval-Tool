"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchWithRetry, getFetchErrorMessage } from "@/lib/fetch-utils";

export interface Alert {
  id: string;
  type: "error" | "warning" | "info";
  title: string;
  message: string;
  provider?: string;
  model?: string;
  timestamp: string;
  severity: number;
}

interface AlertsSummary {
  total: number;
  critical: number;
  warnings: number;
  info: number;
}

interface AlertsResponse {
  alerts: Alert[];
  summary: AlertsSummary;
  monitoredModels: number;
  timestamp: string;
}

export function useAlerts(refreshInterval: number = 60000) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState<AlertsSummary>({
    total: 0,
    critical: 0,
    warnings: 0,
    info: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchAlerts = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setError(null);

    try {
      const data = await fetchWithRetry<AlertsResponse>("/api/alerts", {
        signal: abortControllerRef.current.signal,
      });
      setAlerts(data.alerts);
      setSummary(data.summary);
      setLastUpdated(data.timestamp);
    } catch (err) {
      // Ignore abort errors
      if ((err as Error).name === "AbortError") return;
      setError(getFetchErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();

    // Set up polling interval
    const interval = setInterval(fetchAlerts, refreshInterval);
    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchAlerts, refreshInterval]);

  return {
    alerts,
    summary,
    loading,
    error,
    lastUpdated,
    refetch: fetchAlerts,
  };
}
