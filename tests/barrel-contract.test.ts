import { test } from "node:test";
import assert from "node:assert/strict";
import * as root from "@a-world-felt/nathan-agent-core";
import * as llm from "@a-world-felt/nathan-agent-core/llm";
import * as tools from "@a-world-felt/nathan-agent-core/tools";
import * as testing from "@a-world-felt/nathan-agent-core/testing";
import type {
  AgentDefinition,
  AgentDeps,
  AgentInput,
  AgentResult,
  AgentState,
  Budget,
  CompletionOptions,
  LLMProvider,
  ModelInfo,
  StopReason,
  Tool,
  ToolCall,
  ToolDefinition,
  ToolOutcome,
  ToolResult,
} from "@a-world-felt/nathan-agent-core";

test("`.` exposes the engine surface", () => {
  for (const name of ["LLMError", "OllamaLLMProvider", "PROVIDERS", "resolveProvider", "DEFAULT_OLLAMA_MODEL"]) {
    assert.equal(typeof (root as Record<string, unknown>)[name] !== "undefined", true, `missing ${name}`);
  }
});

test("`./llm` exposes the llm layer standalone (incl. core types at runtime it re-exports value symbols)", () => {
  assert.equal(typeof llm.LLMError, "function");
  assert.equal(typeof llm.OllamaLLMProvider, "function");
  assert.equal(typeof llm.PROVIDERS, "object");
});

// The fourth branch of the exports map, and the one the other three tests left unlocked. A
// declared entry point that throws on import is worse than one never declared, so it must resolve
// from the day it is declared, even while the file tools it will carry are still to come
// (ADR-AGENT-0002). Importing it at the top of this file is half the assertion.
test("`./tools` resolves, and carries no tool yet", () => {
  assert.deepEqual(Object.keys(tools), []);
});

test("`./testing` exposes the fake and the provider contract check", () => {
  assert.equal(typeof testing.FakeLLMProvider, "function");
  assert.equal(typeof testing.checkProviderContract, "function");
});

test("`.` and `./llm` do not leak the testing surface", () => {
  for (const barrel of [root, llm]) {
    const surface = barrel as Record<string, unknown>;
    assert.equal(surface.FakeLLMProvider, undefined);
    assert.equal(surface.checkProviderContract, undefined);
  }
});

test("`.` exposes the context layer", () => {
  const surface = root as Record<string, unknown>;
  for (const name of ["SlidingWindowStrategy", "HeuristicTokenCounter"]) {
    assert.equal(typeof surface[name], "function", `missing ${name}`);
  }
});

// The tests above probe value symbols, which is all a runtime check can reach. A type that left
// the barrel would slip through: `node --test` strips types without checking them. The lock for
// those is an annotation, and the gate that enforces it is `npm run typecheck`, not `npm test`.
// Every name below annotates a value that really comes from the package, never a literal written
// alongside: an assertion on a local object would pass on a barrel stripped of its port.
test("`.` exposes the port and the types its calls need", async () => {
  const shipped: LLMProvider = new testing.FakeLLMProvider({
    responses: [{ content: "ok", toolCalls: [] }],
  });
  const declared: ModelInfo[] = shipped.models();
  const opts: CompletionOptions = { model: declared[0]?.id ?? "" };

  const response = await shipped.complete([{ role: "user", content: "hi" }], opts);

  assert.equal(response.content, "ok");
  assert.equal(opts.model, testing.FakeLLMProvider.MODEL_ID);
});

test("`.` exposes the tools framework's pure half", () => {
  const surface = root as Record<string, unknown>;
  for (const name of ["dispatchTool", "toToolDefinition"]) {
    assert.equal(typeof surface[name], "function", `missing ${name}`);
  }
});

// Same reasoning as the port test above: these names are types, so `node --test` cannot see them
// leave the barrel. They are pinned by annotating values the package itself produced, and the
// gate that enforces it is `npm run typecheck`.
test("`.` exposes the tool port and the types a dispatch needs", async () => {
  const echo: Tool = {
    name: "echo",
    description: "Repeat back what it is given",
    schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    async execute(args) {
      const outcome: ToolOutcome = { content: String(args.text), isError: false };
      return outcome;
    },
  };
  const call: ToolCall = { id: "call-1", name: "echo", arguments: { text: "ok" } };

  const definition: ToolDefinition = root.toToolDefinition(echo);
  const result: ToolResult = await root.dispatchTool(call, [echo]);

  assert.equal(definition.parameters, echo.schema);
  assert.equal(result.toolCallId, "call-1");
  assert.equal(result.content, "ok");
});

test("`./llm` does not carry the context layer", () => {
  const surface = llm as Record<string, unknown>;
  assert.equal(surface.SlidingWindowStrategy, undefined);
  assert.equal(surface.HeuristicTokenCounter, undefined);
});

test("`.` exposes the agent framework: the class, the loop's mechanics, defineAgent", () => {
  const surface = root as Record<string, unknown>;
  for (const name of ["AgenticLLM", "defineAgent", "step", "initialState", "toResult"]) {
    assert.equal(typeof surface[name], "function", `missing ${name}`);
  }
  assert.equal(typeof surface.DEFAULT_LANDING_INSTRUCTION, "string");
});

test("`./llm` does not carry the agent layer", () => {
  const surface = llm as Record<string, unknown>;
  assert.equal(surface.AgenticLLM, undefined);
  assert.equal(surface.defineAgent, undefined);
});

// Same reasoning as the two type tests above: these names are types, so `node --test` cannot see
// them leave the barrel. Each annotates a value the package itself produced, and the gate that
// enforces it is `npm run typecheck`.
test("`.` exposes the loop's contracts and the types a run needs", async () => {
  const navigateur: AgentDefinition = root.defineAgent({
    name: "navigateur",
    prompt: "Tu aides une personne a naviguer dans l'application.",
    tools: [],
  });
  const budget: Budget = { maxIterations: 1 };
  const deps: AgentDeps = {
    agent: navigateur,
    llm: new testing.FakeLLMProvider({ responses: [{ content: "bonjour", toolCalls: [] }] }),
    context: new root.SlidingWindowStrategy({
      maxTokens: 1_000,
      counter: new root.HeuristicTokenCounter(),
    }),
    budget,
  };
  const agent = new root.AgenticLLM(deps);
  const input: AgentInput = "bonjour";

  const start: AgentState = agent.initialState(input);
  const result: AgentResult = await agent.run(input);
  const reason: StopReason = result.stopReason;

  assert.equal(start.iterations, 0);
  assert.equal(result.content, "bonjour");
  assert.equal(reason, "completed");
});
