import type {
  Message,
  ToolDefinition,
  LLMResponse,
  LLMChunk,
} from "../models/index.js";

/**
 * The LLM port (ADR-AGENT-0013). Implemented by the consumer's own providers.
 * Capabilities are required methods: the type system forces every implementer to
 * declare them (impossible to forget). Streaming is an optional capability.
 */
export interface ILLMProvider {
  /** Join key for rate tables (ADR-AGENT-0007). One instance = one model. */
  readonly model: string;
  /** Does this model support tool/function calling? */
  supportsTools(): boolean;
  /** Does this provider support streaming? `false` unless proven. */
  supportsStreaming(): boolean;
  /** One non-streamed completion. Empty `toolCalls` in the response is the stop signal. */
  complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;
  /** Streamed completion. Present only if `supportsStreaming()` is true. */
  stream?(messages: Message[], tools?: ToolDefinition[]): AsyncIterable<LLMChunk>;
}
