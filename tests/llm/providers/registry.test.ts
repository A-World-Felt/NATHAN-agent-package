import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS, resolveProvider } from "../../../dist/llm/index.js";

test("PROVIDERS.ollama builds an ILLMProvider", () => {
  const p = PROVIDERS.ollama();
  assert.equal(typeof p.complete, "function");
  assert.equal(p.supportsStreaming(), true);
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
