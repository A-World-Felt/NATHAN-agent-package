import { test } from "node:test";
import assert from "node:assert/strict";
import * as root from "@a-world-felt/nathan-agent-core";
import * as llm from "@a-world-felt/nathan-agent-core/llm";
import * as testing from "@a-world-felt/nathan-agent-core/testing";
import type { CompletionOptions, LLMProvider, ModelInfo } from "@a-world-felt/nathan-agent-core";

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

test("`./llm` does not carry the context layer", () => {
  const surface = llm as Record<string, unknown>;
  assert.equal(surface.SlidingWindowStrategy, undefined);
  assert.equal(surface.HeuristicTokenCounter, undefined);
});
