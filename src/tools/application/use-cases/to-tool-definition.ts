import type { ToolDefinition } from "../../../llm/models/index.js";
import type { Tool } from "../../interfaces/index.js";

/**
 * Present a tool to the model. The two shapes are owned by two frameworks that ignore each
 * other, and the agent is where they meet (ADR-AGENT-0012), so this translation lives here
 * rather than inside either type.
 *
 * It sits in `application/use-cases/` rather than `services/` for one reason: it reads the `Tool`
 * port, and a pure service never imports `interfaces/`.
 */
export function toToolDefinition(tool: Tool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.schema,
  };
}
