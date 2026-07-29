import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeLLMProvider } from "../../../dist/testing/index.js";
// LLMResponse is imported from its home layer (dist/llm/models); the `./llm` barrel
// only re-exports it, so importing from the source layer yields the same type.
import type { LLMResponse } from "../../../dist/llm/models/index.js";

const reply = (content: string): LLMResponse => ({ content, toolCalls: [], usage: undefined });
const MODEL = "fake-model";

test("returns scripted responses in order", async () => {
  const fake = new FakeLLMProvider({ responses: [reply("one"), reply("two")] });
  assert.equal((await fake.complete([{ role: "user", content: "hi" }], { model: MODEL })).content, "one");
  assert.equal((await fake.complete([{ role: "user", content: "hi" }], { model: MODEL })).content, "two");
});

test("records calls, including whether tools were passed", async () => {
  const fake = new FakeLLMProvider({ responses: [reply("x"), reply("y")] });
  await fake.complete([{ role: "user", content: "a" }], {
    model: MODEL,
    tools: [{ name: "t", description: "d", parameters: { type: "object", properties: {} } }],
  });
  await fake.complete([{ role: "user", content: "b" }], { model: MODEL });
  assert.equal(fake.calls.length, 2);
  assert.equal(fake.calls[0].opts.tools?.length, 1);
  assert.equal(fake.calls[1].opts.tools, undefined);
});

test("records which model each call asked for", async () => {
  const fake = new FakeLLMProvider({
    models: [{ id: "small", supportsTools: true }, { id: "large", supportsTools: true }],
    responses: [reply("x"), reply("y")],
  });
  await fake.complete([{ role: "user", content: "a" }], { model: "small" });
  await fake.complete([{ role: "user", content: "b" }], { model: "large" });
  assert.deepEqual(fake.calls.map((c) => c.opts.model), ["small", "large"]);
});

test("declares no streaming, and one tool-capable model by default", () => {
  const fake = new FakeLLMProvider({ responses: [] });
  assert.equal(fake.supportsStreaming(), false);
  assert.deepEqual(fake.models(), [{ id: MODEL, supportsTools: true }]);
});

test("declares the models it was given", () => {
  const models = [{ id: "a", supportsTools: false }, { id: "b", supportsTools: true }];
  assert.deepEqual(new FakeLLMProvider({ models, responses: [] }).models(), models);
});

test("throws when the script is exhausted", async () => {
  const fake = new FakeLLMProvider({ responses: [] });
  await assert.rejects(
    () => fake.complete([{ role: "user", content: "hi" }], { model: MODEL }),
    /no scripted response/,
  );
});
