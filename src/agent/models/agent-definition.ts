import type { Tool } from "../../tools/interfaces/index.js";

/**
 * What an agent *is*: a name, a system prompt, and the tools it works with. Declared in
 * TypeScript and imported statically, never looked up by an untyped string (ADR-AGENT-0005).
 *
 * There is no `version` field on purpose: git is the version, and the tests are what says a
 * version is good. A per-agent counter would only have drifted from the package's own.
 */
export type AgentDefinition = {
  /** How the agent is named in a report or a log. Never a key anything is looked up by. */
  readonly name: string;
  /** The system prompt. It is seeded at the head of the history, before the user's request. */
  readonly prompt: string;
  /** The tools this agent works with. The wiring may pass others instead (ADR-AGENT-0010). */
  readonly tools: readonly Tool[];
  /**
   * A model this agent is known to work with. A **recommendation, never an imposition**
   * (ADR-AGENT-0017): what an agent needs is stable and belongs in code, while which model
   * serves it is configuration and arrives at wiring time. The wiring wins whenever it names
   * one, so changing model stays a matter of configuration rather than an edit to this file.
   */
  readonly recommendedModel?: string;
};
