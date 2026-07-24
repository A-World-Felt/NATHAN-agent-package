import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProviderContract, FakeLLMProvider } from "../../../dist/testing/index.js";
import type { LLMProvider } from "../../../dist/llm/interfaces/index.js";
import type { LLMResponse } from "../../../dist/llm/models/index.js";

test("a conformant provider (the fake) yields a fully-ok report", async () => {
  const fake = new FakeLLMProvider({
    responses: [{ content: "hi", toolCalls: [], usage: { tokensIn: 1, tokensOut: 1 } }],
  });
  const report = await checkProviderContract(fake);
  assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
  assert.equal(report.checks.every((c) => c.ok), true);
  // The fake does not stream (supportsStreaming() === false): no streaming check is recorded.
  assert.equal(report.checks.some((c) => /stream|chunk/.test(c.name)), false);
});

test("a broken provider yields report.ok=false with the failing check named", async () => {
  const broken: LLMProvider = {
    model: "broken",
    supportsTools: () => true,
    supportsStreaming: () => false,
    // content is a number, not a string: violates the LLMResponse shape.
    complete: async () => ({ content: 123, toolCalls: [] } as unknown as LLMResponse),
  };
  const report = await checkProviderContract(broken);
  assert.equal(report.ok, false);
  const contentCheck = report.checks.find((c) => c.name === "complete() content is a string");
  assert.ok(contentCheck, "the content check must be present");
  assert.equal(contentCheck.ok, false);
  assert.ok(contentCheck.detail, "a failing check carries a diagnostic detail");
});
