// Tools framework models (ADR-AGENT-0012: tools owns what a tool produces).
// The parameter schema lives in core/models; a tool declares it via core's ToolSchema.

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
