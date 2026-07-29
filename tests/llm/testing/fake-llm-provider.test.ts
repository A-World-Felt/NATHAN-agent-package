import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeLLMProvider } from "../../../dist/testing/index.js";
// LLMResponse is imported from its home layer (dist/llm/models); the `./llm` barrel
// only re-exports it, so importing from the source layer yields the same type.
import type { LLMResponse } from "../../../dist/llm/models/index.js";

const reply = (content: string): LLMResponse => ({ content, toolCalls: [], usage: undefined });
// Read from the class, not retyped: if the constant moves, these tests move with it.
const MODEL = FakeLLMProvider.MODEL_ID;

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

test("refuses a model it does not answer for, without consuming the script", async () => {
  const fake = new FakeLLMProvider({ responses: [reply("x")] });

  await assert.rejects(
    () => fake.complete([{ role: "user", content: "a" }], { model: "large" }),
    (e: unknown) => {
      assert.equal((e as { code: string }).code, "MODEL_NOT_FOUND");
      return true;
    },
  );
  assert.equal(fake.calls.length, 0, "a refused call never happened");
  // The script is intact, so the refusal cannot be mistaken for an exhausted script later on.
  assert.equal((await fake.complete([{ role: "user", content: "a" }], { model: MODEL })).content, "x");
});

test("declares no streaming, and exactly one tool-capable model", () => {
  const fake = new FakeLLMProvider({ responses: [] });
  assert.equal(fake.supportsStreaming(), false);
  assert.deepEqual(fake.models(), [{ id: MODEL, supportsTools: true }]);
});

test("supportsTools is configurable, the model id is not", () => {
  const toolless = new FakeLLMProvider({ supportsTools: false, responses: [] });
  assert.deepEqual(toolless.models(), [{ id: MODEL, supportsTools: false }]);

  // A caller mutating the returned list must not reach the fake's own declaration.
  const first = toolless.models();
  first[0].id = "tampered";
  assert.equal(toolless.models()[0].id, MODEL);
});

test("throws when the script is exhausted", async () => {
  const fake = new FakeLLMProvider({ responses: [] });
  await assert.rejects(
    () => fake.complete([{ role: "user", content: "hi" }], { model: MODEL }),
    /no scripted response/,
  );
});
