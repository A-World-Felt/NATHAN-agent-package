import type { AgentDeps, AgentInput, AgentResult, AgentState } from "../dtos/index.js";
import { initialState, step, toResult } from "./step.js";

/**
 * The agentic loop, and the package's public API.
 *
 * A class rather than a factory because a published library needs a **discoverable** surface:
 * `agent.` offers `run`, `step` and `initialState` to autocompletion, where a function returned
 * by a factory offers nothing (ADR-AGENT-0009). The mechanics stay pure functions; this is the
 * handle a consumer holds.
 *
 * ```ts
 * const agent = new AgenticLLM({ agent: navigateur, llm, context });
 * const result = await agent.run("amene-moi aux reglages");
 * ```
 */
export class AgenticLLM {
  private readonly deps: AgentDeps;

  constructor(deps: AgentDeps) {
    this.deps = deps;
  }

  /**
   * Run until the agent stops, and say why it stopped.
   *
   * The loop always ends: `step` sets a reason on the natural path, and otherwise a bound
   * eventually forces a landing, which sets one unconditionally. `maxIterations` defaults to 10
   * precisely so a bound exists even when a consumer configures nothing.
   *
   * Each run starts from a fresh state, so two runs on the same instance share the wiring and
   * nothing else.
   */
  async run(input: AgentInput): Promise<AgentResult> {
    let state = this.initialState(input);
    while (state.stopReason === undefined) {
      state = await step(state, this.deps);
    }
    return toResult(state);
  }

  /**
   * One iteration, for a caller that drives the loop itself. Suspension is the primitive and
   * `run()` is the sugar (ADR-AGENT-0003): a consumer that needs to interpose between two
   * iterations, to ask a user to confirm an action for instance, drives this instead.
   */
  async step(state: AgentState): Promise<AgentState> {
    return step(state, this.deps);
  }

  /** The state a run starts from. Pairs with `step()` for a caller driving the loop. */
  initialState(input: AgentInput): AgentState {
    return initialState(input, this.deps);
  }
}
