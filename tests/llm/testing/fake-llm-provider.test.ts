import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeLLMProvider } from "../../../dist/testing/index.js";
// The `./llm` barrel (dist/llm/index.js) is built in Task 3; at Task 2 LLMResponse
// resolves from its home layer, which the barrel merely re-exports (same type).
import type { LLMResponse } from "../../../dist/llm/models/index.js";

const reply = (content: string): LLMResponse => ({ content, toolCalls: [], usage: undefined });

test("returns scripted responses in order", async () => {
  const fake = new FakeLLMProvider({ responses: [reply("one"), reply("two")] });
  assert.equal((await fake.complete([{ role: "user", content: "hi" }])).content, "one");
  assert.equal((await fake.complete([{ role: "user", content: "hi" }])).content, "two");
});

test("records calls, including whether tools were passed", async () => {
  const fake = new FakeLLMProvider({ responses: [reply("x"), reply("y")] });
  await fake.complete([{ role: "user", content: "a" }], [
    { name: "t", description: "d", parameters: { type: "object", properties: {} } },
  ]);
  await fake.complete([{ role: "user", content: "b" }]);
  assert.equal(fake.calls.length, 2);
  assert.equal(fake.calls[0].tools?.length, 1);
  assert.equal(fake.calls[1].tools, undefined);
});

test("declares no streaming; supportsTools is configurable", () => {
  assert.equal(new FakeLLMProvider({ responses: [] }).supportsStreaming(), false);
  assert.equal(new FakeLLMProvider({ responses: [], supportsTools: false }).supportsTools(), false);
  assert.equal(new FakeLLMProvider({ responses: [] }).supportsTools(), true);
});

test("throws when the script is exhausted", async () => {
  const fake = new FakeLLMProvider({ responses: [] });
  await assert.rejects(() => fake.complete([{ role: "user", content: "hi" }]), /no scripted response/);
});
