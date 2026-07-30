import type { AgentDefinition } from "../models/index.js";

/**
 * Declare an agent. A pure function that returns the typed object it was given, frozen.
 *
 * It looks like it does nothing, and that is the point (ADR-AGENT-0005): the value is the
 * **type**, checked at compile time, plus the absence of any runtime registry to look the agent
 * up in. Copying and freezing is the one thing it adds, so a definition shared between runs
 * cannot be changed by one of them. The freeze is shallow: it protects the definition, not the
 * tools inside it, which are objects with a lifecycle of their own.
 */
export function defineAgent(definition: AgentDefinition): AgentDefinition {
  return Object.freeze({ ...definition });
}
