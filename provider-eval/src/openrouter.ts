import type {
  OpenRouterModel,
  ModelEndpointsResponse,
  ModelWithEndpoints,
  ProviderEndpoint,
  ProviderRouting,
} from "./types.js";

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

export class OpenRouterClient {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required");
    }
    this.apiKey = apiKey;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${OPENROUTER_API_BASE}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get all available models from OpenRouter
   */
  async getModels(): Promise<OpenRouterModel[]> {
    const data = await this.fetch<{ data: OpenRouterModel[] }>("/models");
    return data.data;
  }

  /**
   * Get a specific model by ID
   */
  async getModel(modelId: string): Promise<OpenRouterModel | null> {
    const models = await this.getModels();
    return models.find((m) => m.id === modelId) ?? null;
  }

  /**
   * Get all provider endpoints for a specific model
   * Uses the /models/{model_id}/endpoints API
   */
  async getModelEndpoints(modelId: string): Promise<ModelWithEndpoints | null> {
    try {
      const response = await this.fetch<ModelEndpointsResponse>(
        `/models/${modelId}/endpoints`
      );

      return {
        model: {
          id: response.data.id,
          name: response.data.name,
          description: response.data.description,
          architecture: response.data.architecture,
        },
        endpoints: response.data.endpoints,
      };
    } catch (error) {
      // Model might not exist or have no endpoints
      if (error instanceof Error && error.message.includes("404")) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get active provider endpoints for a model (status = 0, uptime > threshold)
   */
  async getActiveEndpoints(
    modelId: string,
    minUptime: number = 95
  ): Promise<ProviderEndpoint[]> {
    const result = await this.getModelEndpoints(modelId);
    if (!result) return [];

    return result.endpoints.filter(
      (e) => e.status === 0 && e.uptime_last_30m >= minUptime
    );
  }

  /**
   * Get endpoints that support specific parameters
   */
  async getEndpointsWithParameters(
    modelId: string,
    requiredParams: string[]
  ): Promise<ProviderEndpoint[]> {
    const result = await this.getModelEndpoints(modelId);
    if (!result) return [];

    return result.endpoints.filter((e) =>
      requiredParams.every((param) => e.supported_parameters.includes(param))
    );
  }

  /**
   * Get endpoints that support tool/function calling
   */
  async getToolCapableEndpoints(modelId: string): Promise<ProviderEndpoint[]> {
    return this.getEndpointsWithParameters(modelId, ["tools", "tool_choice"]);
  }

  /**
   * Search models by name pattern
   */
  async searchModels(pattern: string): Promise<OpenRouterModel[]> {
    const models = await this.getModels();
    const lowerPattern = pattern.toLowerCase();
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(lowerPattern) ||
        m.name.toLowerCase().includes(lowerPattern)
    );
  }

  /**
   * List all unique provider names across all models
   */
  async getProviders(): Promise<string[]> {
    const models = await this.getModels();
    const providerIds = new Set<string>();

    for (const model of models) {
      const [providerId] = model.id.split("/");
      providerIds.add(providerId);
    }

    return Array.from(providerIds).sort();
  }

  /**
   * Make a chat completion request with optional provider routing
   */
  async chatCompletion(config: {
    model: string;
    messages: { role: string; content: string }[];
    provider?: ProviderRouting;
    max_tokens?: number;
    temperature?: number;
  }): Promise<ChatCompletionResponse> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages: config.messages,
      max_tokens: config.max_tokens ?? 1024,
      temperature: config.temperature ?? 0,
    };

    if (config.provider) {
      body.provider = config.provider;
    }

    const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/provider-eval",
        "X-Title": "Provider Eval CLI",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<ChatCompletionResponse>;
  }
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
