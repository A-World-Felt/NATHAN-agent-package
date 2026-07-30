import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_OLLAMA_MODEL, PROVIDERS, resolveProvider } from "../../../dist/llm/index.js";

test("PROVIDERS.ollama builds an LLMProvider", () => {
  const p = PROVIDERS.ollama();
  assert.equal(typeof p.complete, "function");
  assert.equal(p.supportsStreaming(), true);
});

test("PROVIDERS.ollama declares the environment's model, read at call time", () => {
  const previous = process.env.OLLAMA_MODEL;
  try {
    delete process.env.OLLAMA_MODEL;
    assert.deepEqual(PROVIDERS.ollama().models(), [{ id: DEFAULT_OLLAMA_MODEL, supportsTools: true }]);

    // Set after the module was imported: the factory must read process.env now, not at load.
    process.env.OLLAMA_MODEL = "llama3.2:3b";
    assert.deepEqual(PROVIDERS.ollama().models(), [{ id: "llama3.2:3b", supportsTools: true }]);
  } finally {
    if (previous === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = previous;
  }
});

test("resolveProvider returns a provider for a known id", () => {
  assert.equal(typeof resolveProvider("ollama").complete, "function");
});

test("resolveProvider throws UNKNOWN_PROVIDER for a bad id", () => {
  assert.throws(() => resolveProvider("gpt-9000"), (e: unknown) => {
    assert.equal((e as { name: string }).name, "LLMError");
    assert.equal((e as { code: string }).code, "UNKNOWN_PROVIDER");
    return true;
  });
});
