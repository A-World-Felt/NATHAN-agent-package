import { LLMError } from "../models/index.js";
import { OllamaLLMProvider } from "./ollama/ollama-llm-provider.js";
import type { LLMProvider } from "../interfaces/index.js";

export { OllamaLLMProvider } from "./ollama/ollama-llm-provider.js";
export type { OllamaConfig } from "./ollama/ollama-llm-provider.js";

/** Closed, typed union of provider ids (CLAUDE.md: a string key must be typed). Grows per provider. */
export type ProviderID = "ollama";

/**
 * Factories keyed by a closed union, driven by env on the consumer side.
 * The library reads process.env; it never reads a file (ADR-AGENT-0002).
 */
export const PROVIDERS: Record<ProviderID, () => LLMProvider> = {
  ollama: () => new OllamaLLMProvider({ model: process.env.OLLAMA_MODEL ?? "qwen2.5:0.5b" }),
};

/** Resolve a runtime string to a provider; throws a typed error on an unknown id. */
export function resolveProvider(id: string): LLMProvider {
  if (!Object.prototype.hasOwnProperty.call(PROVIDERS, id)) {
    throw new LLMError("UNKNOWN_PROVIDER", `Unknown provider: ${id}`);
  }
  return PROVIDERS[id as ProviderID]();
}
