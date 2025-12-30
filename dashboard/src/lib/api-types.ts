/**
 * Standardized API response types for consistent typing across the frontend.
 *
 * These types match the backend API responses and ensure type safety
 * throughout the application.
 */

// ============== Common Types ==============

export interface Pagination {
  total: number;
  returned: number;
  offset?: number;
  limit?: number;
}

export interface Timestamp {
  timestamp: string;
}

// ============== Eval Result Types ==============

/**
 * Result from a single evaluation run.
 * Note: Backend uses both `total` and `total_samples` - this normalizes to `totalSamples`
 */
export interface EvalResult {
  model: string;
  benchmark: string;
  score: number;
  totalSamples: number;
  correct: number;
  durationSeconds: number;
  timestamp: string;
  provider?: string;
  seed?: number;
  epochs?: number;
  epochResults?: EpochResult[];
}

export interface EpochResult {
  epoch: number;
  score: number;
  correct: number;
  total: number;
}

// ============== Streaming Event Types ==============

export type StreamEventType =
  | "start"
  | "progress"
  | "sample"
  | "complete"
  | "error";

export interface StreamEvent<T = unknown> {
  type: StreamEventType;
  data?: T;
  error?: string;
  code?: string;
}

export interface StreamStartEvent {
  type: "start";
  model: string;
  benchmark: string;
  limit: number;
  provider: string;
  providerName: string;
  seed?: number;
  epochs?: number;
}

export interface StreamProgressEvent {
  type: "progress";
  message: string;
  current?: number;
  total?: number;
}

export interface StreamCompleteEvent {
  type: "complete";
  model: string;
  benchmark: string;
  score: number;
  total: number;
  correct: number;
  durationSeconds: number;
  timestamp: string;
  provider?: string;
  seed?: number;
  epochs?: number;
  epochResults?: EpochResult[];
}

export interface StreamErrorEvent {
  type: "error";
  error: string;
  code?: string;
}

// ============== Benchmark Types ==============

export interface Benchmark {
  id: string;
  name: string;
  description: string;
  category: string;
  inspectTask?: string;
  capabilities?: string[];
}

export interface BenchmarkCategory {
  id: string;
  name: string;
  count: number;
  benchmarks?: Benchmark[];
}

export interface BenchmarksResponse extends Timestamp {
  benchmarks: Benchmark[];
  categories: BenchmarkCategory[];
  allCategories: string[];
  allCapabilities: string[];
  total: number;
}

// ============== Model Types ==============

export interface Model {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  pricing: {
    input: number;
    output: number;
  };
  capabilities: string[];
  modality?: string;
  isModerated?: boolean;
}

export interface ModelCategory {
  id: string;
  name: string;
  count: number;
}

export interface ModelsResponse extends Timestamp {
  models: Model[];
  categories: ModelCategory[];
  capabilities: Record<string, number>;
  total: number;
  returned: number;
}

// ============== Provider Types ==============

export type ProviderStatus = "healthy" | "warning" | "error";

export interface Provider {
  id: string;
  name: string;
  tag?: string;
  status: ProviderStatus;
  quantization?: string;
  uptime: number;
  latencyP50: number;
  latencyP95: number;
  pricing: {
    input: number;
    output: number;
  };
  modelCount: number;
  configured?: boolean;
}

export interface ProvidersResponse extends Timestamp {
  providers: Provider[];
  model?: string;
  configured?: Provider[];
  total: number;
}

// ============== Dashboard Types ==============

export interface DashboardStats {
  totalModels: number;
  activeProviders: number;
  uniqueEndpoints: number;
  avgUptime: number;
}

export interface DashboardResponse extends DashboardStats, Timestamp {}

// ============== Alert Types ==============

export type AlertType = "error" | "warning" | "info";

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  provider?: string;
  model?: string;
  timestamp: string;
  severity: number;
}

export interface AlertsSummary {
  total: number;
  critical: number;
  warnings: number;
  info: number;
}

export interface AlertsResponse extends Timestamp {
  alerts: Alert[];
  summary: AlertsSummary;
  monitoredModels: number;
}

// ============== Health Check Types ==============

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthChecks {
  inspectAi: boolean;
  inspectEvals: boolean;
  providersConfigured: boolean;
  providerCount: number;
  configuredProviders?: string[];
}

export interface HealthResponse extends Timestamp {
  status: HealthStatus;
  version: string;
  checks: HealthChecks;
}

// ============== Error Response Types ==============

export interface ApiError {
  detail: string;
  code?: string;
  requestId?: string;
}

// ============== Rate Limit Headers ==============

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Parse rate limit headers from a Response object
 */
export function parseRateLimitHeaders(response: Response): RateLimitInfo | null {
  const limit = response.headers.get("X-RateLimit-Limit");
  const remaining = response.headers.get("X-RateLimit-Remaining");
  const reset = response.headers.get("X-RateLimit-Reset");

  if (limit && remaining && reset) {
    return {
      limit: parseInt(limit, 10),
      remaining: parseInt(remaining, 10),
      reset: parseInt(reset, 10),
    };
  }

  return null;
}

// ============== Type Guards ==============

export function isStreamCompleteEvent(
  event: StreamEvent
): event is StreamCompleteEvent {
  return event.type === "complete";
}

export function isStreamErrorEvent(
  event: StreamEvent
): event is StreamErrorEvent {
  return event.type === "error";
}

export function isHealthy(status: HealthStatus): boolean {
  return status === "healthy";
}
