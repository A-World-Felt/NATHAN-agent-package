import { test } from "node:test";
import assert from "node:assert/strict";
import * as root from "@a-world-felt/nathan-agent-core";
import * as llm from "@a-world-felt/nathan-agent-core/llm";
import * as testing from "@a-world-felt/nathan-agent-core/testing";

test("`.` exposes the engine surface", () => {
  for (const name of ["LLMError", "OllamaLLMProvider", "PROVIDERS", "resolveProvider"]) {
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
  for (const name of ["SlidingWindowContext", "HeuristicTokenCounter"]) {
    assert.equal(typeof surface[name], "function", `missing ${name}`);
  }
});

test("`./llm` does not carry the context layer", () => {
  const surface = llm as Record<string, unknown>;
  assert.equal(surface.SlidingWindowContext, undefined);
  assert.equal(surface.HeuristicTokenCounter, undefined);
});
