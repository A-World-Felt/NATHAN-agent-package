import { test } from "node:test";
import assert from "node:assert/strict";
import { AgenticLLM, defineAgent, toResult } from "../../../../dist/agent/index.js";
import type { AgentDeps } from "../../../../dist/agent/index.js";
import { HeuristicTokenCounter, SlidingWindowStrategy } from "../../../../dist/context/index.js";
import type { ContextStrategy } from "../../../../dist/context/index.js";
import type { LLMProvider, LLMResponse } from "../../../../dist/llm/index.js";
import type { Tool } from "../../../../dist/tools/index.js";
import { FakeLLMProvider } from "../../../../dist/testing/index.js";

function wideContext(): ContextStrategy {
  return new SlidingWindowStrategy({ maxTokens: 100_000, counter: new HeuristicTokenCounter() });
}

function textResponse(content: string): LLMResponse {
  return { content, toolCalls: [] };
}

function callResponse(id: string, name: string, args: Record<string, unknown>): LLMResponse {
  return { content: "", toolCalls: [{ id, name, arguments: args }] };
}

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

function depsFor(responses: LLMResponse[], tools: readonly Tool[]): AgentDeps {
  return {
    agent: defineAgent({
      name: "navigateur",
      prompt: "Tu aides une personne a naviguer dans l'application.",
      tools,
    }),
    llm: new FakeLLMProvider({ responses }),
    context: wideContext(),
  };
}

/**
 * A provider that always asks for one more tool, and stops itself after `hardStop` calls. The
 * hard stop is what makes a loop that fails to bound itself fail the test instead of hanging it.
 * Every call names a different page, so the repetition detector is never what ends the run.
 */
function endlessCaller(hardStop: number): LLMProvider {
  let made = 0;
  return {
    id: "endless",
    supportsStreaming: () => false,
    models: () => [{ id: "endless-model", supportsTools: true }],
    async complete(): Promise<LLMResponse> {
      made += 1;
      if (made > hardStop) {
        throw new Error(`the loop made ${made} calls without ever bounding itself`);
      }
      return callResponse(`call-${made}`, "navigate", { page: `page-${made}` });
    },
  };
}

test("run returns the agent's answer and why it stopped", async () => {
  const agent = new AgenticLLM(depsFor([textResponse("tu es deja aux reglages")], []));

  const result = await agent.run("ou suis-je");

  assert.equal(result.content, "tu es deja aux reglages");
  assert.equal(result.stopReason, "completed");
  assert.equal(result.iterations, 1);
  assert.deepEqual(result.toolCalls, []);
});

test("run drives a tool round trip to its answer", async () => {
  const navigate = navigateTool();
  const agent = new AgenticLLM(
    depsFor(
      [callResponse("call-1", "navigate", { page: "reglages" }), textResponse("tu y es")],
      [navigate],
    ),
  );

  const result = await agent.run("amene-moi aux reglages");

  assert.deepEqual(navigate.seen, [{ page: "reglages" }]);
  assert.equal(result.content, "tu y es");
  assert.equal(result.stopReason, "completed");
  assert.equal(result.iterations, 2);
  assert.deepEqual(result.toolCalls, [
    { id: "call-1", name: "navigate", arguments: { page: "reglages" } },
  ]);
});

test("run lands on a written answer when the budget falls", async () => {
  const navigate = navigateTool();
  const deps: AgentDeps = {
    ...depsFor(
      [callResponse("call-1", "navigate", { page: "reglages" }), textResponse("voici ce que j'ai")],
      [navigate],
    ),
    budget: { maxIterations: 1 },
  };
  const agent = new AgenticLLM(deps);

  const result = await agent.run("amene-moi aux reglages");

  assert.equal(result.stopReason, "budget");
  assert.equal(result.content, "voici ce que j'ai");
});

test("run still ends when the iteration bound is not a finite number", async () => {
  const navigate = navigateTool();
  const deps: AgentDeps = {
    agent: defineAgent({
      name: "navigateur",
      prompt: "Tu aides une personne a naviguer dans l'application.",
      tools: [navigate],
    }),
    llm: endlessCaller(20),
    context: wideContext(),
    // A bound read from an unset environment variable. The loop's last net has to survive it.
    budget: { maxIterations: Number.NaN },
  };
  const agent = new AgenticLLM(deps);

  const result = await agent.run("amene-moi aux reglages");

  assert.equal(result.stopReason, "budget");
  // Ten iterations on the default bound, then the landing call.
  assert.equal(result.iterations, 11);
});

test("a caller can drive the loop itself, one iteration at a time", async () => {
  const navigate = navigateTool();
  const agent = new AgenticLLM(
    depsFor(
      [callResponse("call-1", "navigate", { page: "reglages" }), textResponse("tu y es")],
      [navigate],
    ),
  );

  let state = agent.initialState("amene-moi aux reglages");
  state = await agent.step(state);
  // This is the seam a consumer interposes on: the tool ran, and nothing has been sent back
  // to the model yet.
  const afterFirstIteration = { calls: state.toolCalls.length, stopReason: state.stopReason };
  state = await agent.step(state);

  assert.deepEqual(afterFirstIteration, { calls: 1, stopReason: undefined });
  assert.deepEqual(toResult(state), {
    content: "tu y es",
    toolCalls: [{ id: "call-1", name: "navigate", arguments: { page: "reglages" } }],
    stopReason: "completed",
    iterations: 2,
  });
});

test("a state read before the run is over does not claim the agent completed", () => {
  const agent = new AgenticLLM(depsFor([textResponse("jamais atteint")], []));

  const result = toResult(agent.initialState("bonjour"));

  assert.equal(result.stopReason, "error");
  assert.equal(result.content, "");
});

test("two runs on the same instance do not share a conversation", async () => {
  const agent = new AgenticLLM(
    depsFor([textResponse("premiere reponse"), textResponse("deuxieme reponse")], []),
  );

  const first = await agent.run("bonjour");
  const second = await agent.run("et maintenant");

  assert.equal(first.content, "premiere reponse");
  assert.equal(second.content, "deuxieme reponse");
  assert.equal(second.iterations, 1);
});
