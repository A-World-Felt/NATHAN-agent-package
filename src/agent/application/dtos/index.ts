import type { ContextStrategy } from "../../../context/interfaces/index.js";
import type { LLMProvider } from "../../../llm/interfaces/index.js";
import type { Message, ToolCall } from "../../../llm/models/index.js";
import type { Tool } from "../../../tools/interfaces/index.js";
import type { AgentDefinition } from "../../models/index.js";

/**
 * Why a run ended.
 *
 * - `completed`: the model asked for no tool. The nominal path (ADR-AGENT-0003).
 * - `budget`: a bound fell, so the agent was asked to conclude (ADR-AGENT-0011).
 * - `stuck`: the same call repeated, so it was asked to conclude, earlier than the budget would.
 * - `error`: **nothing produces it today, deliberately.** A provider failure propagates as an
 *   `LLMError` rather than turning into a result (safety rule, CLAUDE.md), and a failing tool
 *   comes back as a `ToolResult` the model can read. The value is what a state carries if it is
 *   ever read as a result with no reason recorded, which would be a bug in the loop.
 */
export type StopReason = "completed" | "budget" | "stuck" | "error";

/**
 * The bounds that trigger a landing. **The first one reached wins** (ADR-AGENT-0011), and
 * reaching one is never a cutoff: the agent is asked to conclude with what it has.
 *
 * Every field is a knob on purpose. Termination behaviour varies by model, so the harness has to
 * be able to sweep these as axes rather than inherit one hard-coded set.
 */
export type Budget = {
  /**
   * How many model calls a run may make. Default 10. The last net against a loop bug rather than
   * the main mechanism (ADR-AGENT-0011), and the reason a bound always exists even when a
   * consumer configures nothing.
   */
  maxIterations?: number;
  /** Wall-clock bound, measured on the injected clock. Unset means no time bound. */
  maxDurationMs?: number;
  /** Bound on the tokens the provider reported. A provider that reports none never trips it. */
  maxTokens?: number;
  /**
   * How many times in a row the identical set of calls must repeat before the run counts as
   * stuck. Default 3.
   *
   * ADR-AGENT-0011 argues 3 is a floor, because an agent may legitimately re-read the same file
   * twice. A lower value is **honoured rather than clamped**: silently ignoring configuration is
   * worse than a documented trade-off, and measuring where the floor really sits is what the
   * harness exists for. Below 3, expect false positives.
   */
  repetitionThreshold?: number;
};

/**
 * Everything the loop needs from the outside. Substitution happens here, by construction: the
 * harness passes the simulator's tools where production passes the real ones, and no table
 * mediates between them (ADR-AGENT-0010).
 */
export type AgentDeps = {
  /** Who the agent is: its prompt, its tools, and the model it recommends. */
  agent: AgentDefinition;
  /** The vendor. Which of its models answers is resolved per call (ADR-AGENT-0017). */
  llm: LLMProvider;
  /** The one context strategy the loop knows about. Composition happens behind it, not here. */
  context: ContextStrategy;
  /**
   * Which model answers. Resolution order, most specific first: this field, then the agent's
   * `recommendedModel`, then the first model the provider declares (ADR-AGENT-0017). Never a
   * lookup in a table keyed by an untyped string.
   */
  model?: string;
  /** Replaces the agent's own tools. This is how the harness swaps a simulator in. */
  tools?: readonly Tool[];
  budget?: Budget;
  /** What the model is told when a bound falls. The shipped default is English. */
  landingInstruction?: string;
  /** Injectable clock, so a duration bound can be exercised without waiting for one. */
  now?: () => number;
};

/** What a run starts from. A single utterance for now; `VoiceAgenticLLM` widens it in V4. */
export type AgentInput = string;

/**
 * The loop's whole state, threaded through `step`. It is a value, not an object with behaviour:
 * `step` returns a new one instead of mutating the one it was given, which is what makes an
 * iteration testable in isolation and a run suspendable between two of them (ADR-AGENT-0003).
 */
export type AgentState = {
  /** The full conversation, tool results included. `build()` decides what of it is sent. */
  history: Message[];
  /** How many times the model has been called, the landing call included. */
  iterations: number;
  /** Read from the injected clock when the run starts, so elapsed time is measurable. */
  startedAt: number;
  /** Sum of the tokens the provider reported. Stays 0 against a provider that reports none. */
  tokensUsed: number;
  /** The latest assistant text, which becomes the result's `content`. */
  lastContent: string;
  /** Every call made during the run, in order. What a harness asserts "tools used" against. */
  toolCalls: ToolCall[];
  /** The repetition detector's memory: the last set of calls, and how often it has repeated. */
  repetition?: { signature: string; count: number };
  /** Undefined while the run continues. Set exactly once, and the loop stops. */
  stopReason?: StopReason;
};

/** What a finished run gives back to the caller. */
export type AgentResult = {
  /** The agent's written answer. Never empty because of a forced exit (ADR-AGENT-0011). */
  content: string;
  /** Every tool call of the run, not only those of the last response. */
  toolCalls: ToolCall[];
  stopReason: StopReason;
  /** Model calls made, the landing one included. */
  iterations: number;
};
