import { test } from "node:test";
import assert from "node:assert/strict";
import { defineAgent, initialState, step } from "../../../../dist/agent/index.js";
import type { AgentDeps, AgentState } from "../../../../dist/agent/index.js";
import { HeuristicTokenCounter, SlidingWindowStrategy } from "../../../../dist/context/index.js";
import type { ContextStrategy } from "../../../../dist/context/index.js";
import { LLMError } from "../../../../dist/llm/index.js";
import type {
  CompletionOptions,
  LLMProvider,
  LLMResponse,
  Message,
} from "../../../../dist/llm/index.js";
import type { Tool } from "../../../../dist/tools/index.js";
import { FakeLLMProvider } from "../../../../dist/testing/index.js";

/** Wide enough that nothing is ever truncated: these tests are about the loop, not the window. */
function wideContext(): ContextStrategy {
  return new SlidingWindowStrategy({ maxTokens: 100_000, counter: new HeuristicTokenCounter() });
}

function textResponse(content: string): LLMResponse {
  return { content, toolCalls: [] };
}

function callResponse(id: string, name: string, args: Record<string, unknown>): LLMResponse {
  return { content: "", toolCalls: [{ id, name, arguments: args }] };
}

/** A tool that succeeds and keeps what it was handed, so the round trip is observable. */
function navigateTool(): Tool & { readonly seen: Record<string, unknown>[] } {
  const seen: Record<string, unknown>[] = [];
  return {
    name: "navigate",
    description: "Go to a page of the application",
    schema: { type: "object", properties: { page: { type: "string" } }, required: ["page"] },
    seen,
    async execute(args) {
      seen.push(args);
      return { content: `page = ${String(args.page)}`, isError: false };
    },
  };
}

/** A tool that answers with its own name, for turns where only the shape of the calls matters. */
function namedTool(name: string): Tool {
  return {
    name,
    description: `Do what ${name} does`,
    schema: { type: "object", properties: {} },
    async execute() {
      return { content: `${name} done`, isError: false };
    },
  };
}

/**
 * Two tools writing into one shared trace, each yielding between its entry and its exit. Run in
 * sequence the trace reads `start,end,start,end`; run concurrently the two would interleave, and
 * that difference is the whole point of the assertion.
 */
function tracingTools(trace: string[]): Tool[] {
  const tracing = (name: string): Tool => ({
    name,
    description: `Do what ${name} does, and say when it starts and ends`,
    schema: { type: "object", properties: {} },
    async execute() {
      trace.push(`${name}:start`);
      await yieldToTheEventLoop();
      trace.push(`${name}:end`);
      return { content: `${name} done`, isError: false };
    },
  });
  return [tracing("navigate"), tracing("describe")];
}

/** Hand control back to the event loop, so a concurrent dispatch would have room to interleave. */
function yieldToTheEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** One turn asking for two tools at once, which is what a model does when the calls are independent. */
function twoCallResponse(firstId: string, secondId: string, second: string): LLMResponse {
  return {
    content: "",
    toolCalls: [
      { id: firstId, name: "navigate", arguments: { page: "reglages" } },
      { id: secondId, name: second, arguments: {} },
    ],
  };
}

function agentWith(tools: readonly Tool[], recommendedModel?: string) {
  return defineAgent({
    name: "navigateur",
    prompt: "Tu aides une personne a naviguer dans l'application.",
    tools,
    recommendedModel,
  });
}

/** Drive the pure function to a stop, without instantiating anything. */
async function driveWithStep(deps: AgentDeps, input: string): Promise<AgentState> {
  let state = initialState(input, deps);
  while (state.stopReason === undefined) {
    state = await step(state, deps);
  }
  return state;
}

/**
 * A strategy that keeps what the loop hands to `observe`, delegating the rest to the real
 * window. Recording is the only way to assert the delta contract of ADR-AGENT-0016.
 */
function recordingContext(): { strategy: ContextStrategy; observed: Message[][] } {
  const inner = wideContext();
  const observed: Message[][] = [];
  const strategy: ContextStrategy = {
    maxTokens: inner.maxTokens,
    build: (history) => inner.build(history),
    async observe(exchange) {
      observed.push(exchange);
    },
  };
  return { strategy, observed };
}

/**
 * A provider that answers anything and declares two models. The shipped fake cannot serve the
 * resolution tests: it declares exactly one model and refuses every other (ADR-AGENT-0017), so
 * it can only ever exercise one of the three branches.
 */
function multiModelProvider(): { provider: LLMProvider; calls: CompletionOptions[] } {
  const calls: CompletionOptions[] = [];
  const provider: LLMProvider = {
    id: "multi",
    supportsStreaming: () => false,
    models: () => [
      { id: "declared-first", supportsTools: true },
      { id: "declared-second", supportsTools: true },
    ],
    async complete(_messages, opts) {
      calls.push(opts);
      return textResponse("ok");
    },
  };
  return { provider, calls };
}

test("the run starts on the agent's prompt, then on what the user asked", () => {
  const deps: AgentDeps = {
    agent: agentWith([]),
    llm: new FakeLLMProvider({ responses: [] }),
    context: wideContext(),
  };

  const state = initialState("amene-moi aux reglages", deps);

  assert.deepEqual(state.history, [
    { role: "system", content: "Tu aides une personne a naviguer dans l'application." },
    { role: "user", content: "amene-moi aux reglages" },
  ]);
  assert.equal(state.iterations, 0);
  assert.equal(state.stopReason, undefined);
});

test("a response with no tool call ends the run as completed", async () => {
  const deps: AgentDeps = {
    agent: agentWith([navigateTool()]),
    llm: new FakeLLMProvider({ responses: [textResponse("tu es deja aux reglages")] }),
    context: wideContext(),
  };

  const state = await step(initialState("ou suis-je", deps), deps);

  assert.equal(state.stopReason, "completed");
  assert.equal(state.lastContent, "tu es deja aux reglages");
  assert.equal(state.iterations, 1);
  assert.deepEqual(state.toolCalls, []);
});

test("a tool round trip runs the tool and hands its answer back to the model", async () => {
  const navigate = navigateTool();
  const llm = new FakeLLMProvider({
    responses: [callResponse("call-1", "navigate", { page: "reglages" }), textResponse("tu y es")],
  });
  const deps: AgentDeps = { agent: agentWith([navigate]), llm, context: wideContext() };

  const state = await driveWithStep(deps, "amene-moi aux reglages");

  assert.deepEqual(navigate.seen, [{ page: "reglages" }]);
  assert.equal(state.stopReason, "completed");
  assert.equal(state.lastContent, "tu y es");
  assert.equal(state.iterations, 2);
  assert.deepEqual(state.toolCalls, [
    { id: "call-1", name: "navigate", arguments: { page: "reglages" } },
  ]);
  // The tool's answer must reach the second call, or the model is answering blind.
  const secondCall = llm.calls[1];
  assert.deepEqual(secondCall.messages.at(-1), {
    role: "tool",
    content: "page = reglages",
    toolCallId: "call-1",
  });
});

test("the two calls of one turn run one after the other, never interleaved", async () => {
  const trace: string[] = [];
  const tools = tracingTools(trace);
  const llm = new FakeLLMProvider({
    responses: [twoCallResponse("call-1", "call-2", "describe"), textResponse("voila la page")],
  });
  const deps: AgentDeps = { agent: agentWith(tools), llm, context: wideContext() };

  const state = await driveWithStep(deps, "amene-moi aux reglages et decris-la");

  // A simulator's tools share one mutable state (ADR-AGENT-0006): each call must see what the
  // previous one left behind, and concurrency would make that depend on the interleaving.
  assert.deepEqual(trace, ["navigate:start", "navigate:end", "describe:start", "describe:end"]);
  // Both answers go back, in the order asked, each carrying its own call id.
  const answers = state.history.filter((message) => message.role === "tool");
  assert.deepEqual(answers, [
    { role: "tool", content: "navigate done", toolCallId: "call-1" },
    { role: "tool", content: "describe done", toolCallId: "call-2" },
  ]);
  assert.equal(state.stopReason, "completed");
});

test("a tool that throws is caught, and the run carries on to an answer", async () => {
  const exploding: Tool = {
    name: "navigate",
    description: "Go to a page of the application",
    schema: { type: "object", properties: {} },
    execute() {
      throw new Error("boom");
    },
  };
  const llm = new FakeLLMProvider({
    responses: [
      callResponse("call-1", "navigate", { page: "reglages" }),
      textResponse("je n'ai pas pu ouvrir les reglages"),
    ],
  });
  const deps: AgentDeps = { agent: agentWith([exploding]), llm, context: wideContext() };

  const state = await driveWithStep(deps, "amene-moi aux reglages");

  assert.equal(state.stopReason, "completed");
  assert.equal(state.lastContent, "je n'ai pas pu ouvrir les reglages");
  const answer = state.history.find((message) => message.role === "tool");
  assert.ok(answer !== undefined);
  assert.match(answer.content, /boom/);
});

test("an exhausted iteration budget still returns a written answer", async () => {
  const navigate = navigateTool();
  const llm = new FakeLLMProvider({
    responses: [
      callResponse("call-1", "navigate", { page: "reglages" }),
      callResponse("call-2", "navigate", { page: "profil" }),
      textResponse("voici ce que j'ai trouve"),
    ],
  });
  const deps: AgentDeps = {
    agent: agentWith([navigate]),
    llm,
    context: wideContext(),
    budget: { maxIterations: 2 },
  };

  const state = await driveWithStep(deps, "amene-moi aux reglages");

  assert.equal(state.stopReason, "budget");
  assert.equal(state.lastContent, "voici ce que j'ai trouve");
});

test("the landing call carries no tools at all, which is what forces the answer", async () => {
  const navigate = navigateTool();
  const llm = new FakeLLMProvider({
    responses: [
      callResponse("call-1", "navigate", { page: "reglages" }),
      textResponse("voici ce que j'ai trouve"),
    ],
  });
  const deps: AgentDeps = {
    agent: agentWith([navigate]),
    llm,
    context: wideContext(),
    budget: { maxIterations: 1 },
  };

  await driveWithStep(deps, "amene-moi aux reglages");

  // The first call offered the tools, so the absence on the last one means something.
  assert.deepEqual(llm.calls[0].opts.tools?.map((definition) => definition.name), ["navigate"]);
  assert.equal(Object.hasOwn(llm.calls[1].opts, "tools"), false);
});

test("an iteration bound that is not a finite number falls back to the default", async () => {
  const navigate = navigateTool();
  const llm = new FakeLLMProvider({ responses: [textResponse("je conclus sur le net de secours")] });
  const deps: AgentDeps = {
    agent: agentWith([navigate]),
    llm,
    context: wideContext(),
    // What `Number(process.env.AGENT_MAX_ITERATIONS)` yields when the variable is not set. `??`
    // does not catch it, so an unguarded bound would compare false forever and never land.
    budget: { maxIterations: Number.NaN },
  };
  // The default bound, already reached: one step must land rather than call the model again.
  const state: AgentState = { ...initialState("amene-moi aux reglages", deps), iterations: 10 };

  const landed = await step(state, deps);

  assert.equal(landed.stopReason, "budget");
  assert.equal(landed.lastContent, "je conclus sur le net de secours");
});

test("a repetition threshold that is not a finite number falls back to the default", async () => {
  const navigate = navigateTool();
  const repeated = () => callResponse("call-1", "navigate", { page: "reglages" });
  const llm = new FakeLLMProvider({
    responses: [repeated(), repeated(), repeated(), textResponse("je tourne en rond")],
  });
  const deps: AgentDeps = {
    agent: agentWith([navigate]),
    llm,
    context: wideContext(),
    budget: { repetitionThreshold: Number.NaN },
  };

  const state = await driveWithStep(deps, "amene-moi aux reglages");

  assert.equal(state.stopReason, "stuck");
  // Three repetitions on the default threshold, then the landing call.
  assert.equal(llm.calls.length, 4);
});

test("optional bounds that are not finite numbers are no bounds, not bounds already reached", async () => {
  const navigate = navigateTool();
  const llm = new FakeLLMProvider({
    responses: [callResponse("call-1", "navigate", { page: "reglages" }), textResponse("tu y es")],
  });
  const deps: AgentDeps = {
    agent: agentWith([navigate]),
    llm,
    context: wideContext(),
    budget: { maxTokens: Number.NaN, maxDurationMs: Number.NaN },
  };

  const state = await driveWithStep(deps, "amene-moi aux reglages");

  assert.equal(state.stopReason, "completed");
  assert.equal(state.lastContent, "tu y es");
});

test("the elapsed-time bound lands the run, on the injected clock", async () => {
  const navigate = navigateTool();
  const llm = new FakeLLMProvider({
    responses: [
      callResponse("call-1", "navigate", { page: "reglages" }),
      textResponse("le temps imparti est ecoule"),
    ],
  });
  let clock = 0;
  const deps: AgentDeps = {
    agent: agentWith([navigate]),
    llm,
    context: wideContext(),
    budget: { maxDurationMs: 5_000 },
    now: () => clock,
  };

  const first = await step(initialState("amene-moi aux reglages", deps), deps);
  clock = 5_000;
  const landed = await step(first, deps);

  assert.equal(first.stopReason, undefined);
  assert.equal(landed.stopReason, "budget");
  assert.equal(landed.lastContent, "le temps imparti est ecoule");
});

test("the token bound lands the run once the provider has reported enough", async () => {
  const navigate = navigateTool();
  const spent: LLMResponse = {
    ...callResponse("call-1", "navigate", { page: "reglages" }),
    usage: { tokensIn: 7, tokensOut: 5 },
  };
  const llm = new FakeLLMProvider({ responses: [spent, textResponse("je conclus ici")] });
  const deps: AgentDeps = {
    agent: agentWith([navigate]),
    llm,
    context: wideContext(),
    budget: { maxTokens: 10 },
  };

  const state = await driveWithStep(deps, "amene-moi aux reglages");

  assert.equal(state.tokensUsed, 12);
  assert.equal(state.stopReason, "budget");
  assert.equal(state.lastContent, "je conclus ici");
});

test("the same call three times in a row is stuck, and still lands on an answer", async () => {
  const navigate = navigateTool();
  const repeated = () => callResponse("call-1", "navigate", { page: "reglages" });
  const llm = new FakeLLMProvider({
    responses: [repeated(), repeated(), repeated(), textResponse("je tourne en rond, voici l'etat")],
  });
  const deps: AgentDeps = { agent: agentWith([navigate]), llm, context: wideContext() };

  const state = await driveWithStep(deps, "amene-moi aux reglages");

  assert.equal(state.stopReason, "stuck");
  assert.equal(state.lastContent, "je tourne en rond, voici l'etat");
  // Three repetitions, then the landing call: the budget of 10 iterations never came into play.
  assert.equal(llm.calls.length, 4);
});

test("key order in the arguments cannot hide a repetition", async () => {
  const navigate = navigateTool();
  const sameCall = (args: Record<string, unknown>) => ({
    content: "",
    toolCalls: [{ id: "call-1", name: "navigate", arguments: args }],
  });
  const llm = new FakeLLMProvider({
    responses: [
      sameCall({ page: "reglages", focus: "audio" }),
      sameCall({ focus: "audio", page: "reglages" }),
      textResponse("je tourne en rond"),
    ],
  });
  const deps: AgentDeps = {
    agent: agentWith([navigate]),
    llm,
    context: wideContext(),
    budget: { repetitionThreshold: 2 },
  };

  const state = await driveWithStep(deps, "amene-moi aux reglages");

  assert.equal(state.stopReason, "stuck");
});

test("a repetition threshold below three is honoured rather than clamped", async () => {
  const navigate = navigateTool();
  const repeated = () => callResponse("call-1", "navigate", { page: "reglages" });
  const llm = new FakeLLMProvider({
    responses: [repeated(), repeated(), textResponse("je conclus")],
  });
  const deps: AgentDeps = {
    agent: agentWith([navigate]),
    llm,
    context: wideContext(),
    budget: { repetitionThreshold: 2 },
  };

  const state = await driveWithStep(deps, "amene-moi aux reglages");

  assert.equal(state.stopReason, "stuck");
  assert.equal(llm.calls.length, 3);
});

test("two different calls in a row are not a repetition", async () => {
  const navigate = navigateTool();
  const llm = new FakeLLMProvider({
    responses: [
      callResponse("call-1", "navigate", { page: "reglages" }),
      callResponse("call-2", "navigate", { page: "profil" }),
      textResponse("les deux pages existent"),
    ],
  });
  const deps: AgentDeps = {
    agent: agentWith([navigate]),
    llm,
    context: wideContext(),
    budget: { repetitionThreshold: 2 },
  };

  const state = await driveWithStep(deps, "amene-moi aux reglages");

  assert.equal(state.stopReason, "completed");
});

test("an agent with no tools sends no tools field at all", async () => {
  const llm = new FakeLLMProvider({ responses: [textResponse("je n'ai pas d'outil")] });
  const deps: AgentDeps = { agent: agentWith([]), llm, context: wideContext() };

  await step(initialState("bonjour", deps), deps);

  assert.equal(Object.hasOwn(llm.calls[0].opts, "tools"), false);
});

test("the wiring's tools replace the agent's own", async () => {
  const owned = navigateTool();
  const substituted: Tool & { readonly seen: Record<string, unknown>[] } = {
    ...navigateTool(),
    name: "simulated-navigate",
    seen: [],
    async execute(args) {
      return { content: `simulated ${String(args.page)}`, isError: false };
    },
  };
  const llm = new FakeLLMProvider({
    responses: [
      callResponse("call-1", "simulated-navigate", { page: "reglages" }),
      textResponse("fait"),
    ],
  });
  const deps: AgentDeps = {
    agent: agentWith([owned]),
    llm,
    context: wideContext(),
    tools: [substituted],
  };

  const state = await driveWithStep(deps, "amene-moi aux reglages");

  assert.deepEqual(llm.calls[0].opts.tools?.map((definition) => definition.name), [
    "simulated-navigate",
  ]);
  assert.deepEqual(owned.seen, []);
  assert.equal(state.stopReason, "completed");
  const answer = state.history.find((message) => message.role === "tool");
  assert.equal(answer?.content, "simulated reglages");
});

test("the wiring's model wins over the agent's recommendation", async () => {
  const llm = new FakeLLMProvider({ responses: [textResponse("ok")] });
  const deps: AgentDeps = {
    // The recommendation points at a model this provider refuses, so a wrong resolution
    // order raises MODEL_NOT_FOUND instead of quietly picking the other one.
    agent: agentWith([], "some-other-model"),
    llm,
    context: wideContext(),
    model: FakeLLMProvider.MODEL_ID,
  };

  await step(initialState("bonjour", deps), deps);

  assert.equal(llm.calls[0].opts.model, FakeLLMProvider.MODEL_ID);
});

test("the agent's recommendation wins over the first model the provider declares", async () => {
  const { provider, calls } = multiModelProvider();
  const deps: AgentDeps = {
    agent: agentWith([], "declared-second"),
    llm: provider,
    context: wideContext(),
  };

  await step(initialState("bonjour", deps), deps);

  assert.equal(calls[0].model, "declared-second");
});

test("with neither a wiring model nor a recommendation, the first declared model answers", async () => {
  const { provider, calls } = multiModelProvider();
  const deps: AgentDeps = { agent: agentWith([]), llm: provider, context: wideContext() };

  await step(initialState("bonjour", deps), deps);

  assert.equal(calls[0].model, "declared-first");
});

test("observe is called once per iteration, carrying only what that iteration added", async () => {
  const navigate = navigateTool();
  const { strategy, observed } = recordingContext();
  const llm = new FakeLLMProvider({
    responses: [callResponse("call-1", "navigate", { page: "reglages" }), textResponse("tu y es")],
  });
  const deps: AgentDeps = { agent: agentWith([navigate]), llm, context: strategy };

  await driveWithStep(deps, "amene-moi aux reglages");

  assert.equal(observed.length, 2);
  assert.deepEqual(observed[0], [
    { role: "assistant", content: "", toolCalls: [{ id: "call-1", name: "navigate", arguments: { page: "reglages" } }] },
    { role: "tool", content: "page = reglages", toolCallId: "call-1" },
  ]);
  assert.deepEqual(observed[1], [{ role: "assistant", content: "tu y es" }]);
});

test("a context strategy whose observe fails does not bring the run down", async () => {
  const inner = wideContext();
  const failing: ContextStrategy = {
    maxTokens: inner.maxTokens,
    build: (history) => inner.build(history),
    async observe() {
      throw new Error("the memory store is down");
    },
  };
  const llm = new FakeLLMProvider({ responses: [textResponse("la reponse arrive quand meme")] });
  const deps: AgentDeps = { agent: agentWith([]), llm, context: failing };

  const state = await driveWithStep(deps, "bonjour");

  assert.equal(state.stopReason, "completed");
  assert.equal(state.lastContent, "la reponse arrive quand meme");
});

test("a provider error propagates instead of becoming a result", async () => {
  const llm = new FakeLLMProvider({ responses: [textResponse("jamais atteint")] });
  const deps: AgentDeps = {
    agent: agentWith([]),
    llm,
    context: wideContext(),
    model: "a-model-this-provider-never-declared",
  };
  const state = initialState("bonjour", deps);

  await assert.rejects(
    () => step(state, deps),
    (error: unknown) => {
      assert.ok(error instanceof LLMError);
      assert.equal(error.code, "MODEL_NOT_FOUND");
      return true;
    },
  );
});

test("step leaves the state it was given untouched", async () => {
  const navigate = navigateTool();
  const llm = new FakeLLMProvider({
    responses: [callResponse("call-1", "navigate", { page: "reglages" }), textResponse("tu y es")],
  });
  const deps: AgentDeps = { agent: agentWith([navigate]), llm, context: wideContext() };
  const state = initialState("amene-moi aux reglages", deps);
  const before = structuredClone(state);

  const next = await step(state, deps);

  assert.deepEqual(state, before);
  assert.notEqual(next.history, state.history);
});
