import type { ToolSchema } from "../../core/models/index.js";
import type { ToolOutcome } from "../models/index.js";

/**
 * The tool port. The consumer repo brings its own tools and hands them over as objects; the
 * package presents them to the model and runs them, and knows nothing else about them.
 * Substituting a tool is therefore a matter of construction, with no redirection table in
 * between (ADR-AGENT-0010).
 *
 * `execute` returns a {@link ToolOutcome} rather than a `ToolResult`: a tool does not know which
 * call it is answering, so the dispatcher is what attaches the id.
 *
 * `execute` **must not throw**. A failing tool returns `{ isError: true }` and its message goes
 * back to the model, which can then correct itself; an exception crossing the loop makes the
 * agent fragile (safety rule, CLAUDE.md). An interface cannot enforce that promise, so
 * `dispatchTool` catches anyway.
 */
export interface Tool {
  /** How the model names this tool. It is what a `ToolCall` carries. */
  readonly name: string;
  /** What the tool does, in the model's language: this is what it picks on. */
  readonly description: string;
  /** JSON Schema of the parameters. Mandatory: the model cannot call what it cannot describe. */
  readonly schema: ToolSchema;
  /**
   * Run the call. `args` arrives already parsed: a provider turns the model's arguments into an
   * object before the loop ever sees them, so a tool narrows fields rather than parsing JSON.
   */
  execute(args: Record<string, unknown>): Promise<ToolOutcome>;
}
