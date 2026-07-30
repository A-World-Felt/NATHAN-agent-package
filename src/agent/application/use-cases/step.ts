import { LLMError } from "../../../llm/models/index.js";
import type { CompletionOptions } from "../../../llm/interfaces/index.js";
import type { LLMResponse, Message, ToolCall, Usage } from "../../../llm/models/index.js";
import { dispatchTool, toToolDefinition } from "../../../tools/index.js";
import type { Tool, ToolResult } from "../../../tools/index.js";
import type { AgentDeps, AgentInput, AgentResult, AgentState, StopReason } from "../dtos/index.js";

/**
 * What the model is told when a bound falls. Overridable through `AgentDeps.landingInstruction`,
 * which is also how a consumer says it in the user's language.
 */
export const DEFAULT_LANDING_INSTRUCTION =
  "You have reached the budget for this request. Do not call any more tools. " +
  "Answer now with what you already have, and say plainly what is still missing.";

/** The last net against a loop bug, so a bound exists even when nothing is configured. */
const DEFAULT_MAX_ITERATIONS = 10;

/** Three repetitions, the floor ADR-AGENT-0011 argues for. A lower value is honoured, not clamped. */
const DEFAULT_REPETITION_THRESHOLD = 3;

/**
 * One iteration of the loop, as a pure function of `(state, deps)`. `AgenticLLM.run()` is a
 * `while` around it, so everything worth testing is testable without instantiating the class
 * (ADR-AGENT-0009), and a caller that needs to interpose between two iterations drives this.
 *
 * An iteration builds the context, calls the model, then either stops because no tool was asked
 * for, or runs the tools and hands the results back. Before any of that it asks whether the run
 * has to land, in which case the model is called one last time **without tools**.
 */
export async function step(state: AgentState, deps: AgentDeps): Promise<AgentState> {
  const forced = forcedExit(state, deps);
  if (forced !== undefined) return land(state, deps, forced);

  const tools = resolveTools(deps);
  const messages = await deps.context.build(state.history);
  const response = await deps.llm.complete(messages, toCompletionOptions(deps, tools));
  const assistant = toAssistantMessage(response);

  if (response.toolCalls.length === 0) {
    await observe(deps, [assistant]);
    return advance(state, response, [assistant], { stopReason: "completed" });
  }

  const results = await runToolCalls(response.toolCalls, tools);
  const delta = [assistant, ...results.map(toToolMessage)];
  await observe(deps, delta);
  return advance(state, response, delta, {
    repetition: nextRepetition(state.repetition, response.toolCalls),
  });
}

/** The state a run starts from: the agent's prompt, then what the user asked. */
export function initialState(input: AgentInput, deps: AgentDeps): AgentState {
  const system: Message = { role: "system", content: deps.agent.prompt };
  const user: Message = { role: "user", content: input };
  return {
    history: [system, user],
    iterations: 0,
    startedAt: clock(deps)(),
    tokensUsed: 0,
    lastContent: "",
    toolCalls: [],
  };
}

/** Read a finished state as a result. */
export function toResult(state: AgentState): AgentResult {
  return {
    content: state.lastContent,
    toolCalls: state.toolCalls,
    // Unreachable through `run()`, which only stops once a reason is set. It is here so that a
    // state read too early cannot produce a result claiming the agent completed.
    stopReason: state.stopReason ?? "error",
    iterations: state.iterations,
  };
}

/**
 * Run the calls the model asked for, in the order it asked for them.
 *
 * **Sequential, never concurrent**: a simulator's tools share one mutable state, so running them
 * in parallel would make the outcome depend on interleaving and the harness would stop being
 * deterministic (ADR-AGENT-0006). `dispatchTool` never throws, so a failing tool becomes a result
 * the model reads rather than an exception crossing the loop.
 */
async function runToolCalls(calls: ToolCall[], tools: readonly Tool[]): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of calls) {
    const result = await dispatchTool(call, tools);
    results.push(result);
  }
  return results;
}

/** What the call needs: the model, and the tools the agent may name. */
function toCompletionOptions(deps: AgentDeps, tools: readonly Tool[]): CompletionOptions {
  const model = resolveModel(deps);
  // No `tools` key at all when the agent has none, rather than an empty array: an empty list is
  // something a provider may still put on the wire, and it says something we do not mean.
  if (tools.length === 0) return { model };
  return { model, tools: tools.map(toToolDefinition) };
}

/**
 * Which model answers: the wiring's, else the agent's recommendation, else the first the provider
 * declares (ADR-AGENT-0017). Never a lookup in a table keyed by an untyped string.
 */
function resolveModel(deps: AgentDeps): string {
  if (deps.model !== undefined) return deps.model;
  if (deps.agent.recommendedModel !== undefined) return deps.agent.recommendedModel;

  const declared = deps.llm.models();
  const first = declared[0];
  if (first === undefined) {
    // A provider that declares nothing can serve nothing. Saying so here beats sending an empty
    // model name and letting the vendor answer with a 404 nobody can read.
    throw new LLMError(
      "MODEL_NOT_FOUND",
      `Provider '${deps.llm.id}' declares no model, and neither the wiring nor the agent names one.`,
    );
  }
  return first.id;
}

/** The wiring's tools when it passes any, else the agent's own (ADR-AGENT-0010). */
function resolveTools(deps: AgentDeps): readonly Tool[] {
  if (deps.tools !== undefined) return deps.tools;
  return deps.agent.tools;
}

/**
 * Why the run must land, if it must. Repetition is checked first: it triggers the same landing,
 * but it fires earlier than budget exhaustion and saves the iterations in between
 * (ADR-AGENT-0011).
 */
function forcedExit(state: AgentState, deps: AgentDeps): ForcedReason | undefined {
  if (isStuck(state, deps)) return "stuck";
  if (isOverBudget(state, deps)) return "budget";
  return undefined;
}

/** The two reasons the loop itself decides. `completed` comes from the model, `error` from nothing. */
type ForcedReason = Extract<StopReason, "budget" | "stuck">;

function isStuck(state: AgentState, deps: AgentDeps): boolean {
  const repetition = state.repetition;
  if (repetition === undefined) return false;
  const threshold = deps.budget?.repetitionThreshold ?? DEFAULT_REPETITION_THRESHOLD;
  return repetition.count >= threshold;
}

/** The first bound reached wins, and one always exists: `maxIterations` defaults to 10. */
function isOverBudget(state: AgentState, deps: AgentDeps): boolean {
  const budget = deps.budget;
  const maxIterations = budget?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  if (state.iterations >= maxIterations) return true;

  if (budget?.maxTokens !== undefined && state.tokensUsed >= budget.maxTokens) return true;

  if (budget?.maxDurationMs !== undefined) {
    const elapsed = clock(deps)() - state.startedAt;
    if (elapsed >= budget.maxDurationMs) return true;
  }

  return false;
}

/**
 * The forced exit, and it is a landing rather than a cutoff. The model is asked to conclude and
 * called again **with no tools at all**, which is the whole guarantee: it cannot call anything,
 * so it writes (ADR-AGENT-0011). A cutoff would throw the work away and leave someone who
 * dictated a request waiting on silence, which is the accessibility case this package exists for.
 */
async function land(state: AgentState, deps: AgentDeps, reason: ForcedReason): Promise<AgentState> {
  // The instruction goes into the history, before `build()`, because the strategy owns the whole
  // outbound list and nothing is appended to what it returns (ADR-AGENT-0016). A `user` message
  // rather than a `system` one: mid-conversation, that is the role every provider accepts.
  const instruction: Message = {
    role: "user",
    content: deps.landingInstruction ?? DEFAULT_LANDING_INSTRUCTION,
  };
  const history = [...state.history, instruction];
  const messages = await deps.context.build(history);
  const response = await deps.llm.complete(messages, { model: resolveModel(deps) });
  // Plain content, even if the model named a call anyway: it was offered no tool, nothing was
  // dispatched, and recording the call would leave a request no result ever answers.
  const assistant: Message = { role: "assistant", content: response.content };

  await observe(deps, [instruction, assistant]);

  return {
    ...state,
    history: [...history, assistant],
    iterations: state.iterations + 1,
    tokensUsed: state.tokensUsed + tokensOf(response.usage),
    lastContent: response.content,
    stopReason: reason,
  };
}

/** Fold one model response and its consequences into the next state. */
function advance(
  state: AgentState,
  response: LLMResponse,
  delta: Message[],
  extra: Partial<AgentState>,
): AgentState {
  return {
    ...state,
    history: [...state.history, ...delta],
    iterations: state.iterations + 1,
    tokensUsed: state.tokensUsed + tokensOf(response.usage),
    lastContent: response.content,
    toolCalls: [...state.toolCalls, ...response.toolCalls],
    ...extra,
  };
}

/**
 * Hand the iteration's delta to the context strategy: once per iteration, awaited, and carrying
 * only what is new (ADR-AGENT-0016). A no-op in V1, and memory's entry point in V3, which is why
 * the call is wired now rather than retrofitted into a published loop.
 *
 * The contract asks implementations not to throw; this catches anyway, because losing a memory
 * write is less bad than losing the answer owed to someone who dictated a request.
 */
async function observe(deps: AgentDeps, exchange: Message[]): Promise<void> {
  try {
    await deps.context.observe(exchange);
  } catch {
    return;
  }
}

function toAssistantMessage(response: LLMResponse): Message {
  if (response.toolCalls.length === 0) {
    return { role: "assistant", content: response.content };
  }
  return { role: "assistant", content: response.content, toolCalls: response.toolCalls };
}

function toToolMessage(result: ToolResult): Message {
  return { role: "tool", content: result.content, toolCallId: result.toolCallId };
}

function tokensOf(usage: Usage | undefined): number {
  if (usage === undefined) return 0;
  return usage.tokensIn + usage.tokensOut;
}

function clock(deps: AgentDeps): () => number {
  return deps.now ?? Date.now;
}

/**
 * The repetition detector's memory. Being stuck is not something an agent can be asked about: a
 * run that has gone off the rails reports progress indefinitely. It is observed from the outside
 * instead, as the same calls with the same arguments several turns in a row (ADR-AGENT-0011).
 */
function nextRepetition(
  previous: AgentState["repetition"],
  calls: ToolCall[],
): AgentState["repetition"] {
  const signature = signatureOf(calls);
  if (previous?.signature === signature) {
    return { signature, count: previous.count + 1 };
  }
  return { signature, count: 1 };
}

/** One turn's whole set of calls, so asking for the same two tools twice counts as a repetition. */
function signatureOf(calls: ToolCall[]): string {
  return calls.map((call) => `${call.name}(${stableStringify(call.arguments)})`).join("|");
}

/**
 * Serialize the arguments so that key order cannot hide a repetition. Only the top level is
 * sorted: a nested object reordered between two turns still reads as a different call, which
 * costs a missed detection rather than a false one, and the run then lands on its budget.
 */
function stableStringify(args: Record<string, unknown>): string {
  const keys = Object.keys(args).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${JSON.stringify(args[key])}`);
  return `{${pairs.join(",")}}`;
}
