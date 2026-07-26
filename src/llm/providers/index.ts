import { LLMError } from "../models/index.js";
import { OllamaLLMProvider } from "./ollama/ollama-llm-provider.js";
import type { LLMProvider } from "../interfaces/index.js";

export { OllamaLLMProvider } from "./ollama/ollama-llm-provider.js";
export type { OllamaConfig } from "./ollama/ollama-llm-provider.js";

/** Closed, typed union of provider ids (CLAUDE.md: a string key must be typed). Grows per provider. */
export type ProviderID = "ollama";

/**
 * Ollama provider factory. A function, not a `new` at module load, so process.env is read
 * at call time: the app loads its .env, the library reads process.env (ADR-AGENT-0002).
 */
function makeOllama(): LLMProvider {
  return new OllamaLLMProvider({ model: process.env.OLLAMA_MODEL ?? "qwen2.5:0.5b" });
}

/**
 * Provider factories keyed by the closed union, driven by env on the consumer side.
 * One entry per provider; the value is a factory, so each resolveProvider call builds a fresh instance.
 */
export const PROVIDERS: Record<ProviderID, () => LLMProvider> = {
  ollama: makeOllama,
};

/** True when a runtime string is one of the declared provider ids; narrows `string` to `ProviderID`. */
function isProviderID(id: string): id is ProviderID {
  return Object.hasOwn(PROVIDERS, id);
}

/** Resolve a runtime string to a provider; throws a typed error on an unknown id. */
export function resolveProvider(id: string): LLMProvider {
  if (!isProviderID(id)) {
    throw new LLMError("UNKNOWN_PROVIDER", `Unknown provider: ${id}`);
  }
  const factory = PROVIDERS[id];
  return factory();
}
