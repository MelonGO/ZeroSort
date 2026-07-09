export type ProviderID =
  | "deepseek"
  | "anthropic"
  | "openai"
  | "gemini"
  | "mistral"
  | "moonshotai"
  | "grok"
  | "openrouter"
  | "ollama"
  | "openai-compatible";

export interface Model {
  id: string;
  name: string;
  family: string;
}

export interface ProviderTemplate {
  id: ProviderID;
  name: string;
  color: string;
  defaultUrl?: string;
}

export interface ProviderConfig {
  id: string;
  templateId: ProviderID;
  name: string;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  models: Model[];
}

/**
 * Provider configuration as stored in the plaintext store.
 * API key is stored separately in encrypted credential storage.
 */
export interface StoredProviderConfig {
  id: string;
  templateId: ProviderID;
  name: string;
  enabled: boolean;
  /** API key is NOT stored here - it's in encrypted storage */
  baseUrl: string;
  models: Model[];
}
