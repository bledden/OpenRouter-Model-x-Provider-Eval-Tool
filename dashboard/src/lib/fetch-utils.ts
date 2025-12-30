/**
 * Fetch utility with timeout, retry, and request ID support.
 */

interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  requestId?: string;
}

export class FetchError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public requestId?: string
  ) {
    super(message);
    this.name = "FetchError";
  }
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with automatic timeout, retry, and request ID injection.
 *
 * @param url - URL to fetch
 * @param options - Fetch options with additional timeout, retries, retryDelay, requestId
 * @returns Parsed JSON response
 * @throws FetchError on failure
 */
export async function fetchWithRetry<T>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    timeout = 30000,
    retries = 3,
    retryDelay = 1000,
    requestId = generateRequestId(),
    ...fetchOptions
  } = options;

  // Inject request ID header
  const headers = new Headers(fetchOptions.headers);
  headers.set("X-Request-ID", requestId);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Don't retry 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          const errorBody = await response.json().catch(() => ({}));
          throw new FetchError(
            errorBody.detail || `HTTP ${response.status}`,
            response.status,
            errorBody.code,
            requestId
          );
        }

        // Retry 5xx errors (server errors)
        throw new FetchError(
          `HTTP ${response.status}`,
          response.status,
          undefined,
          requestId
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof FetchError && error.status && error.status < 500) {
        // Don't retry client errors
        throw error;
      }

      lastError = error as Error;

      // Check if this was an abort (timeout)
      if ((error as Error).name === "AbortError") {
        lastError = new FetchError(
          `Request timed out after ${timeout}ms`,
          undefined,
          "TIMEOUT",
          requestId
        );
      }

      // Don't wait on last attempt
      if (attempt < retries) {
        // Exponential backoff: 1s, 2s, 4s, etc.
        const delay = retryDelay * Math.pow(2, attempt);
        console.warn(
          `[${requestId}] Fetch attempt ${attempt + 1} failed, retrying in ${delay}ms...`
        );
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  throw (
    lastError ||
    new FetchError("Unknown fetch error", undefined, "UNKNOWN", requestId)
  );
}

/**
 * Create an abort controller that times out after the specified duration.
 * Useful for streaming requests where fetchWithRetry doesn't apply.
 *
 * @param timeout - Timeout in milliseconds
 * @returns AbortController and cleanup function
 */
export function createTimeoutController(timeout: number): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return {
    controller,
    cleanup: () => clearTimeout(timeoutId),
  };
}

/**
 * Helper to check if an error is a fetch timeout
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof FetchError) {
    return error.code === "TIMEOUT";
  }
  if (error instanceof Error) {
    return error.name === "AbortError";
  }
  return false;
}

/**
 * Helper to check if an error is a network error (offline, DNS, etc.)
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }
  return false;
}

/**
 * Get a user-friendly error message from a fetch error
 */
export function getFetchErrorMessage(error: unknown): string {
  if (error instanceof FetchError) {
    if (error.code === "TIMEOUT") {
      return "Request timed out. Please check your connection and try again.";
    }
    if (error.status === 429) {
      return "Rate limit exceeded. Please wait a moment and try again.";
    }
    if (error.status === 404) {
      return "Resource not found.";
    }
    if (error.status && error.status >= 500) {
      return "Server error. Please try again later.";
    }
    return error.message;
  }
  if (isNetworkError(error)) {
    return "Network error. Please check your internet connection.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred.";
}
