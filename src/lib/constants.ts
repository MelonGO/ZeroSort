import {
  Bot,
  Cloud,
  Code,
  Cpu,
  Globe,
  Layers,
  Plus,
  Sparkles,
  Zap,
} from "lucide-react";
import React from "react";
import { Model, ProviderID, ProviderTemplate } from "../types/model";

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    color: "text-purple-600",
    defaultUrl: "https://api.anthropic.com/v1",
  },
  {
    id: "openai",
    name: "ChatGPT",
    color: "text-gray-800",
    defaultUrl: "https://api.openai.com/v1",
  },
  {
    id: "gemini",
    name: "Gemini",
    color: "text-blue-500",
    defaultUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  {
    id: "mistral",
    name: "Mistral",
    color: "text-orange-600",
    defaultUrl: "https://api.mistral.ai/v1",
  },
  {
    id: "moonshotai",
    name: "MoonshotAI",
    color: "text-rose-600",
    defaultUrl: "https://api.moonshot.ai/v1",
  },
  {
    id: "grok",
    name: "Grok",
    color: "text-black",
    defaultUrl: "https://api.x.ai/v1",
  },
  {
    id: "ollama",
    name: "Ollama",
    color: "text-gray-600",
    defaultUrl: "http://localhost:11434/api",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    color: "text-blue-600",
    defaultUrl: "https://api.deepseek.com/v1",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    color: "text-sky-600",
    defaultUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "openai-compatible",
    name: "OpenAI Compatible",
    color: "text-emerald-600",
    defaultUrl: "",
  },
];

export const INITIAL_MODELS: Partial<Record<ProviderID, Model[]>> = {
  openai: [
    { id: "gpt-5", name: "GPT-5", family: "GPT-5" },
    { id: "gpt-5-mini", name: "GPT-5 Mini", family: "GPT-5" },
    { id: "gpt-5-nano", name: "GPT-5 Nano", family: "GPT-5" },
    { id: "o3", name: "o3", family: "o3" },
    { id: "o3-mini", name: "o3 Mini", family: "o3" },
  ],
  anthropic: [
    {
      id: "claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      family: "Claude 4.5",
    },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", family: "Claude 4.5" },
    { id: "claude-opus-4-5", name: "Claude Opus 4.5", family: "Claude 4.5" },
  ],
  gemini: [
    { id: "gemini-3-pro-preview", name: "Gemini 3 Pro", family: "Gemini 3" },
    {
      id: "gemini-3-flash-preview",
      name: "Gemini 3 Flash",
      family: "Gemini 3",
    },
  ],
  mistral: [
    { id: "mistral-large-latest", name: "Mistral Large", family: "Mistral" },
    { id: "mistral-medium-latest", name: "Mistral Medium", family: "Mistral" },
    { id: "ministral-8b-latest", name: "Ministral 8B", family: "Ministral" },
  ],
  moonshotai: [
    { id: "kimi-k2.5", name: "Kimi K2.5", family: "Kimi K2.5" },
    { id: "kimi-k2", name: "Kimi K2", family: "Kimi K2" },
    {
      id: "kimi-k2-thinking",
      name: "Kimi K2 Thinking",
      family: "Kimi K2 Thinking",
    },
  ],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek-V3", family: "DeepSeek" },
    { id: "deepseek-reasoner", name: "DeepSeek-R1", family: "DeepSeek" },
  ],
  openrouter: [
    {
      id: "openai/gpt-5",
      name: "GPT-5",
      family: "OpenAI via OpenRouter",
    },
    {
      id: "anthropic/claude-sonnet-4.5",
      name: "Claude Sonnet 4.5",
      family: "Anthropic via OpenRouter",
    },
    {
      id: "google/gemini-3-flash-preview",
      name: "Gemini 3 Flash",
      family: "Google via OpenRouter",
    },
  ],
  grok: [
    { id: "grok-3", name: "Grok 3", family: "Grok 3" },
    { id: "grok-3-mini", name: "Grok 3 Mini", family: "Grok 3" },
  ],
  ollama: [
    { id: "qwen3:8b", name: "qwen3:8b", family: "qwen3" },
    { id: "glm-4.7-flash", name: "glm-4.7-flash", family: "GLM" },
  ],
};

export const ICON_MAP: Record<string, React.ReactNode> = {
  Zap: React.createElement(Zap, { size: 20 }),
  Bot: React.createElement(Bot, { size: 20 }),
  Sparkles: React.createElement(Sparkles, { size: 20 }),
  Cloud: React.createElement(Cloud, { size: 20 }),
  Cpu: React.createElement(Cpu, { size: 20 }),
  Globe: React.createElement(Globe, { size: 20 }),
  Code: React.createElement(Code, { size: 20 }),
  Layers: React.createElement(Layers, { size: 20 }),
  Plus: React.createElement(Plus, { size: 20 }),
};
