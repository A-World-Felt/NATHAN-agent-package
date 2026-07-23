// LLM framework models.
// Pure types: no runtime dependency, no SDK import (placement rule, CLAUDE.md).

/** Role of a message in the conversation sent to the model. */
export type Role = "system" | "user" | "assistant" | "tool";

/**
 * A message in the conversation. The role fixes which fields are valid,
 * so illegal combinations (a `user` carrying `toolCalls`, a `tool` without
 * its `toolCallId`) do not typecheck.
 */
export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; content: string; toolCallId: string };

/** The model requests a tool execution. `arguments` is already parsed into an object. */
export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

/**
 * Result of a tool, fed back into the conversation.
 * A tool that fails returns a `ToolResult` with `isError: true`; it does NOT throw,
 * so it does not bring down the loop (safety rule, CLAUDE.md).
 */
export type ToolResult = {
  toolCallId: string;
  content: string;
  isError: boolean;
};

/** Token count for a call. Absent (not zero) when the provider does not supply it. */
export type Usage = {
  tokensIn: number;
  tokensOut: number;
};

/**
 * Model response to a call.
 * An empty `toolCalls` IS the loop's stop signal (ADR-AGENT-0003).
 * `usage` carries the cost; filled in as soon as a provider supplies it (ADR-AGENT-0007).
 */
export type LLMResponse = {
  content: string;
  toolCalls: ToolCall[];
  usage?: Usage;
};

/** Error codes surfaced by a provider. Closed union: a string key must be typed. */
export type LLMErrorCode = "MISSING_API_KEY" | "API_ERROR" | "UNKNOWN_PROVIDER";

/**
 * Provider error. Unlike a tool failure, it propagates up (CLAUDE.md).
 * The `code` lets you distinguish cases without parsing the message.
 */
export class LLMError extends Error {
  readonly code: LLMErrorCode;

  constructor(code: LLMErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LLMError";
    this.code = code;
  }
}
