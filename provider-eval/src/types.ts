// OpenRouter API types

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  architecture?: {
    modality: string;
    tokenizer: string;
    instruct_type?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  top_provider?: {
    context_length: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  per_request_limits?: {
    prompt_tokens?: string;
    completion_tokens?: string;
  };
  supported_parameters?: string[];
}

/**
 * Provider endpoint for a specific model
 * Retrieved from /api/v1/models/{model_id}/endpoints
 */
export interface ProviderEndpoint {
  name: string;
  model_name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image: string;
    image_output?: string;
    web_search?: string;
    internal_reasoning?: string;
    discount?: number;
  };
  provider_name: string;
  /** The slug used to route to this specific provider, e.g., "hyperbolic/fp8" */
  tag: string;
  quantization: string;
  max_completion_tokens: number | null;
  max_prompt_tokens: number | null;
  supported_parameters: string[];
  /** Status code: 0 = active */
  status: number;
  /** Uptime percentage in last 30 minutes */
  uptime_last_30m: number;
  supports_implicit_caching: boolean;
}

/**
 * Response from /api/v1/models/{model_id}/endpoints
 */
export interface ModelEndpointsResponse {
  data: {
    id: string;
    name: string;
    created: number;
    description: string;
    architecture: {
      tokenizer: string;
      instruct_type?: string;
      modality: string;
      input_modalities: string[];
      output_modalities: string[];
    };
    endpoints: ProviderEndpoint[];
  };
}

/**
 * Provider routing configuration for OpenRouter API requests
 */
export interface ProviderRouting {
  /** List of provider names to try in order */
  order?: string[];
  /** Whether to allow fallback to other providers if specified ones fail */
  allow_fallbacks?: boolean;
  /** Require providers to support all parameters in the request */
  require_parameters?: boolean;
  /** Data collection policy */
  data_collection?: "allow" | "deny";
  /** Quantization preference */
  quantizations?: string[];
}

export interface OpenRouterProvider {
  id: string;
  name: string;
  context_length?: number;
  max_completion_tokens?: number;
  is_moderated?: boolean;
}

export interface ModelWithProviders {
  model: OpenRouterModel;
  providers: OpenRouterProvider[];
}

export interface ModelWithEndpoints {
  model: {
    id: string;
    name: string;
    description: string;
    architecture: {
      tokenizer: string;
      instruct_type?: string;
      modality: string;
      input_modalities: string[];
      output_modalities: string[];
    };
  };
  endpoints: ProviderEndpoint[];
}

export interface EvalResult {
  provider: string;
  providerTag: string;
  model: string;
  benchmark: string;
  score: number | null;
  error?: string;
  duration_ms: number;
  timestamp: string;
  samples_evaluated: number;
  metadata?: {
    quantization?: string;
    context_length?: number;
    pricing?: {
      prompt: string;
      completion: string;
    };
    uptime?: number;
  };
}

export interface EvalConfig {
  model: string;
  benchmark: string;
  limit?: number;
  providers?: string[];
}

export interface ProviderEvalConfig {
  model: string;
  benchmark: string;
  limit?: number;
  /** Specific provider tags to evaluate, or undefined for all */
  providerTags?: string[];
  /** Questions to use (for consistent comparison) */
  questions?: MMLUQuestion[];
}

export interface MMLUQuestion {
  question: string;
  choices: string[];
  answer: string;
  subject: string;
}
