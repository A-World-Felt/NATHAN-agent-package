import type { ToolCall, ToolDefinition } from "../../../llm/models/index.js";
import type { Tool } from "../../interfaces/index.js";
import type { ToolResult } from "../../models/index.js";

/**
 * Run one tool call and turn it into the answer that goes back to the model.
 *
 * **This never throws.** Every failure becomes a `ToolResult` carrying `isError: true`, because
 * a bad tool must not end the run: the model reads the error and can correct itself, where an
 * exception would bring the loop down (safety rule, CLAUDE.md). Three failures are covered here:
 * a tool the agent does not carry, a tool that throws despite its contract, and one that rejects.
 *
 * The design calls for a chain, `record -> [authorize] -> execute` (ADR-AGENT-0004). Only
 * `execute` exists in V1; the other two will be decorators wrapping this call, never branches
 * added inside it.
 */
export async function dispatchTool(call: ToolCall, tools: readonly Tool[]): Promise<ToolResult> {
  const tool = tools.find((candidate) => candidate.name === call.name);
  if (tool === undefined) {
    return {
      toolCallId: call.id,
      content: unknownToolMessage(call.name, tools),
      isError: true,
    };
  }

  try {
    const outcome = await tool.execute(call.arguments);
    return { toolCallId: call.id, ...outcome };
  } catch (cause) {
    // The port forbids throwing, but an interface cannot enforce it, and a consumer's tool is
    // the least trusted code in the loop. Catching here is what keeps the promise true.
    return {
      toolCallId: call.id,
      content: `Tool '${call.name}' threw: ${messageOf(cause)}`,
      isError: true,
    };
  }
}

/**
 * Present a tool to the model. The two shapes are owned by two frameworks that ignore each
 * other, and the agent is where they meet (ADR-AGENT-0012), so this translation lives here
 * rather than inside either type.
 */
export function toToolDefinition(tool: Tool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.schema,
  };
}

/** Name what was asked for and what may be asked instead, so the model can correct itself. */
function unknownToolMessage(name: string, tools: readonly Tool[]): string {
  if (tools.length === 0) {
    return `Unknown tool '${name}'. No tool is available.`;
  }
  const available = tools.map((tool) => tool.name).join(", ");
  return `Unknown tool '${name}'. Available: ${available}.`;
}

function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
