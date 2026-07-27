import type { Message } from "../../llm/models/index.js";

/**
 * Token counting port (ADR-AGENT-0008). V1 ships a heuristic; an exact tokenizer per model
 * family plugs in here later without touching any context provider.
 */
export interface TokenCounter {
  /** Approximate token cost of a message list, as the provider would receive it. */
  count(messages: Message[]): number;
}
