// Tools framework models (ADR-AGENT-0012: tools owns what a tool produces).
// The parameter schema lives in core/models; a tool declares it via core's ToolSchema.

/**
 * What a tool itself produces: an answer for the model, and whether that answer is a failure.
 *
 * A tool cannot know which call it is answering, so the correlation id is not its business. That
 * is the whole reason this type exists next to `ToolResult`: a tool author writes
 * `return { content, isError: false }` and nothing more, and `dispatchTool` pairs the outcome
 * with the call.
 */
export type ToolOutcome = {
  content: string;
  isError: boolean;
};

/**
 * An outcome once the dispatcher has paired it with the call it answers, ready to be fed back
 * into the conversation.
 *
 * A tool that fails returns an outcome with `isError: true`; it does NOT throw, so it does not
 * bring down the loop (safety rule, CLAUDE.md).
 */
export type ToolResult = ToolOutcome & {
  /** The id of the `ToolCall` this answers. Set by the dispatcher, never by a tool. */
  toolCallId: string;
};
