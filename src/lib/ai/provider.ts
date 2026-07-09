import { ProviderConfig, ProviderID } from "@/types/model";
import { generateText } from "ai";

/**
 * Providers that natively support structured outputs (JSON mode with schema).
 * OpenAI-compatible providers generally don't support this feature.
 */
const PROVIDERS_WITH_STRUCTURED_OUTPUTS: ProviderID[] = [
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "mistral",
  "moonshotai",
  "grok",
];

/**
 * Checks if a provider supports native structured outputs.
 * OpenAI-compatible providers typically don't support the responseFormat feature
 * with JSON schema validation.
 */
export const supportsStructuredOutputs = (templateId: ProviderID): boolean => {
  return PROVIDERS_WITH_STRUCTURED_OUTPUTS.includes(templateId);
};

/**
 * Configures and returns a Google Generative AI provider.
 */
export const getGoogleProvider = async (apiKey: string, baseUrl?: string) => {
  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
  return createGoogleGenerativeAI({
    apiKey,
    baseURL: baseUrl,
  });
};

export const getOpenAIProvider = async (apiKey: string, baseUrl?: string) => {
  const { createOpenAI } = await import("@ai-sdk/openai");
  return createOpenAI({
    apiKey,
    baseURL: baseUrl,
  });
};

export const getDeepSeekProvider = async (apiKey: string, baseUrl?: string) => {
  const { createDeepSeek } = await import("@ai-sdk/deepseek");
  return createDeepSeek({
    apiKey,
    baseURL: baseUrl,
  });
};

export const getAnthropicProvider = async (
  apiKey: string,
  baseUrl?: string,
) => {
  const { createAnthropic } = await import("@ai-sdk/anthropic");
  return createAnthropic({
    apiKey,
    baseURL: baseUrl,
  });
};

export const getOllamaProvider = async (apiKey: string, baseUrl?: string) => {
  const { createOllama } = await import("ollama-ai-provider-v2");
  return createOllama({
    baseURL: baseUrl,
  });
};

export const getOpenRouterProvider = async (
  apiKey: string,
  baseUrl?: string,
) => {
  const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
  return createOpenRouter({
    apiKey,
    baseURL: baseUrl,
    compatibility: "strict",
  });
};

export const getMistralProvider = async (apiKey: string, baseUrl?: string) => {
  const { createMistral } = await import("@ai-sdk/mistral");
  return createMistral({
    apiKey,
    baseURL: baseUrl,
  });
};

export const getMoonshotAIProvider = async (
  apiKey: string,
  baseUrl?: string,
) => {
  const { createMoonshotAI } = await import("@ai-sdk/moonshotai");
  return createMoonshotAI({
    apiKey,
    baseURL: baseUrl,
  });
};

export const getOpenAICompatibleProvider = async (
  apiKey: string,
  baseUrl: string,
  name: string,
) => {
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  return createOpenAICompatible({
    name,
    apiKey,
    baseURL: baseUrl,
  });
};

/**
 * Tests connectivity to a provider using the first available model.
 * Makes a minimal generateText call (maxTokens: 1) to verify the API key and base URL are valid.
 */
export async function testProviderConnection(
  config: ProviderConfig,
): Promise<{ success: boolean; error?: string }> {
  if (config.models.length === 0) {
    return { success: false, error: "No models configured for this provider" };
  }

  const modelId = config.models[0].id;
  const model = await getModelFromConfig(config, modelId);

  try {
    await generateText({
      model,
      prompt: "Hi",
    });
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error occurred";
    return { success: false, error: message };
  }
}

/**
 * Returns a configured model instance based on the provider configuration.
 */
export const getModelFromConfig = async (
  config: ProviderConfig,
  modelId: string,
) => {
  const { templateId, apiKey, baseUrl } = config;

  switch (templateId) {
    case "openai":
      return (await getOpenAIProvider(apiKey, baseUrl)).languageModel(modelId);
    case "anthropic":
      return (await getAnthropicProvider(apiKey, baseUrl)).languageModel(
        modelId,
      );
    case "deepseek":
      return (await getDeepSeekProvider(apiKey, baseUrl)).languageModel(
        modelId,
      );
    case "gemini":
      return (await getGoogleProvider(apiKey, baseUrl)).languageModel(modelId);
    case "mistral":
      return (await getMistralProvider(apiKey, baseUrl)).languageModel(modelId);
    case "moonshotai":
      return (await getMoonshotAIProvider(apiKey, baseUrl)).languageModel(
        modelId,
      );
    case "ollama":
      return (await getOllamaProvider(apiKey, baseUrl)).languageModel(modelId);
    case "openrouter":
      return (await getOpenRouterProvider(apiKey, baseUrl)).languageModel(
        modelId,
      );
    case "openai-compatible":
      return (
        await getOpenAICompatibleProvider(apiKey, baseUrl, config.name)
      ).languageModel(modelId);
    // Add other providers as needed
    default:
      // Fallback to OpenAI-compatible for custom/ollama if baseURL is provided
      return (await getOpenAIProvider(apiKey, baseUrl)).languageModel(modelId);
  }
};
