// Capability overrides for models
// This file allows manual specification of capabilities that may not be
// auto-detected from OpenRouter's API data or heuristics.
//
// Users can also override these at runtime via the UI.

export type Capability =
  | "chat"
  | "coding"
  | "reasoning"
  | "vision"
  | "audio"
  | "function_calling"
  | "long_context"
  | "creative"
  | "roleplay"
  | "free";

// All available capabilities that benchmarks can require
export const ALL_CAPABILITIES: Capability[] = [
  "chat",
  "coding",
  "reasoning",
  "vision",
  "audio",
  "function_calling",
  "long_context",
  "creative",
  "roleplay",
  "free",
];

// Capability descriptions for UI
export const CAPABILITY_INFO: Record<Capability, { name: string; description: string }> = {
  chat: {
    name: "Chat / Instruction",
    description: "General conversation and instruction following",
  },
  coding: {
    name: "Coding",
    description: "Code generation, debugging, and programming tasks",
  },
  reasoning: {
    name: "Reasoning",
    description: "Multi-step logical reasoning and problem solving",
  },
  vision: {
    name: "Vision",
    description: "Image understanding and visual reasoning",
  },
  audio: {
    name: "Audio",
    description: "Audio input processing and understanding",
  },
  function_calling: {
    name: "Function Calling",
    description: "Tool use and function/API calling",
  },
  long_context: {
    name: "Long Context",
    description: "100K+ token context window",
  },
  creative: {
    name: "Creative Writing",
    description: "Story generation, creative content, and narrative writing",
  },
  roleplay: {
    name: "Roleplay",
    description: "Character consistency, persona maintenance, and immersive dialogue",
  },
  free: {
    name: "Free Tier",
    description: "Available at no cost",
  },
};

// Static capability overrides for specific models
// Format: modelId -> { add: capabilities to add, remove: capabilities to remove }
export const MODEL_CAPABILITY_OVERRIDES: Record<
  string,
  { add?: Capability[]; remove?: Capability[] }
> = {
  // OpenAI models - ensure function calling is set
  "openai/gpt-4o": { add: ["vision", "function_calling", "chat", "coding", "reasoning"] },
  "openai/gpt-4o-mini": { add: ["vision", "function_calling", "chat", "coding"] },
  "openai/gpt-4-turbo": { add: ["vision", "function_calling", "chat", "coding"] },
  "openai/o1": { add: ["reasoning", "chat", "coding"] },
  "openai/o1-mini": { add: ["reasoning", "chat", "coding"] },
  "openai/o1-preview": { add: ["reasoning", "chat", "coding"] },
  "openai/o3-mini": { add: ["reasoning", "chat", "coding"] },

  // Anthropic models
  "anthropic/claude-3.5-sonnet": { add: ["vision", "function_calling", "chat", "coding", "reasoning", "creative"] },
  "anthropic/claude-3.5-haiku": { add: ["vision", "function_calling", "chat", "coding"] },
  "anthropic/claude-3-opus": { add: ["vision", "function_calling", "chat", "coding", "reasoning", "creative"] },
  "anthropic/claude-3-sonnet": { add: ["vision", "function_calling", "chat", "coding"] },
  "anthropic/claude-3-haiku": { add: ["vision", "function_calling", "chat"] },

  // Google models
  "google/gemini-2.0-flash-exp": { add: ["vision", "function_calling", "chat", "coding", "reasoning"] },
  "google/gemini-pro-1.5": { add: ["vision", "function_calling", "chat", "coding", "long_context"] },
  "google/gemini-flash-1.5": { add: ["vision", "function_calling", "chat", "coding", "long_context"] },

  // DeepSeek models
  "deepseek/deepseek-r1": { add: ["reasoning", "chat", "coding"] },
  "deepseek/deepseek-chat": { add: ["chat", "coding", "function_calling"] },
  "deepseek/deepseek-coder": { add: ["coding", "chat"] },

  // Meta Llama models
  "meta-llama/llama-3.3-70b-instruct": { add: ["chat", "function_calling", "coding"] },
  "meta-llama/llama-3.1-405b-instruct": { add: ["chat", "function_calling", "coding", "long_context"] },
  "meta-llama/llama-3.1-70b-instruct": { add: ["chat", "function_calling", "coding", "long_context"] },

  // Mistral models
  "mistralai/mistral-large": { add: ["chat", "function_calling", "coding", "reasoning"] },
  "mistralai/mistral-medium": { add: ["chat", "function_calling", "coding"] },
  "mistralai/codestral-latest": { add: ["coding", "chat"] },

  // Qwen models
  "qwen/qwen-2.5-72b-instruct": { add: ["chat", "function_calling", "coding"] },
  "qwen/qwq-32b-preview": { add: ["reasoning", "chat", "coding"] },

  // xAI models
  "x-ai/grok-2": { add: ["chat", "function_calling", "coding"] },
  "x-ai/grok-beta": { add: ["chat", "function_calling"] },

  // Roleplay/creative focused models
  "neversleep/llama-3.1-lumimaid-70b": { add: ["roleplay", "creative", "chat"] },
  "sao10k/l3.3-euryale-70b": { add: ["roleplay", "creative", "chat"] },
  "anthracite-org/magnum-v4-72b": { add: ["roleplay", "creative", "chat"] },
  "thedrummer/rocinante-12b": { add: ["roleplay", "creative", "chat"] },
  "undi95/remm-slerp-l2-13b": { add: ["roleplay", "creative", "chat"] },
};

// Apply overrides to a model's capabilities
export function applyCapabilityOverrides(
  modelId: string,
  detectedCapabilities: string[]
): string[] {
  const override = MODEL_CAPABILITY_OVERRIDES[modelId];
  if (!override) {
    return detectedCapabilities;
  }

  let capabilities = [...detectedCapabilities];

  // Add capabilities
  if (override.add) {
    for (const cap of override.add) {
      if (!capabilities.includes(cap)) {
        capabilities.push(cap);
      }
    }
  }

  // Remove capabilities
  if (override.remove) {
    capabilities = capabilities.filter((cap) => !override.remove!.includes(cap as Capability));
  }

  return capabilities;
}

// Local storage key for user overrides
const USER_OVERRIDES_KEY = "model-capability-overrides";

// Get user-defined capability overrides from localStorage
export function getUserCapabilityOverrides(): Record<string, Capability[]> {
  if (typeof window === "undefined") return {};

  try {
    const stored = localStorage.getItem(USER_OVERRIDES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

// Save user-defined capability override for a model
export function setUserCapabilityOverride(modelId: string, capabilities: Capability[]): void {
  if (typeof window === "undefined") return;

  const overrides = getUserCapabilityOverrides();
  overrides[modelId] = capabilities;
  localStorage.setItem(USER_OVERRIDES_KEY, JSON.stringify(overrides));
}

// Remove user-defined capability override for a model
export function removeUserCapabilityOverride(modelId: string): void {
  if (typeof window === "undefined") return;

  const overrides = getUserCapabilityOverrides();
  delete overrides[modelId];
  localStorage.setItem(USER_OVERRIDES_KEY, JSON.stringify(overrides));
}

// Get final capabilities for a model (detected + static overrides + user overrides)
export function getFinalCapabilities(
  modelId: string,
  detectedCapabilities: string[],
  userOverrides?: Record<string, Capability[]>
): string[] {
  // First apply static overrides
  let capabilities = applyCapabilityOverrides(modelId, detectedCapabilities);

  // Then apply user overrides (user overrides take precedence)
  const userCaps = userOverrides?.[modelId];
  if (userCaps && userCaps.length > 0) {
    // User override replaces all capabilities for this model
    capabilities = userCaps;
  }

  return [...new Set(capabilities)];
}
