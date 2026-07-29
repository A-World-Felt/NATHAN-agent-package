import type {
  Message,
  ModelInfo,
  ToolDefinition,
  LLMResponse,
  LLMChunk,
} from "../models/index.js";

/** What a call needs beyond the conversation: which model answers, and which tools it may name. */
export type CompletionOptions = {
  model: string;
  tools?: ToolDefinition[];
};

/**
 * The LLM port (ADR-AGENT-0013, reshaped by ADR-AGENT-0017). Implemented by the consumer's
 * own providers.
 *
 * A provider is a **vendor**, not a client bound to one model: it offers several models, and
 * the model travels per call, where the wire already puts it. Streaming is declared here
 * because it is a property of the transport; tool calling is declared per model, on
 * {@link ModelInfo}, because that is where it varies.
 */
export interface LLMProvider {
  /**
   * Which vendor this is, for the rows of a metrics or harness report. A plain string, not
   * `ProviderID`: that union types the shipped registry's keys, and a consumer's own provider
   * carries an id it does not list.
   */
  readonly id: string;
  /** Does this provider support streaming? `false` unless proven. */
  supportsStreaming(): boolean;
  /** The models this provider offers, as declared at construction. Synchronous: no request. */
  models(): ModelInfo[];
  /** One non-streamed completion. Empty `toolCalls` in the response is the stop signal. */
  complete(messages: Message[], opts: CompletionOptions): Promise<LLMResponse>;
  /** Streamed completion. Present only if `supportsStreaming()` is true. */
  stream?(messages: Message[], opts: CompletionOptions): AsyncIterable<LLMChunk>;
}
