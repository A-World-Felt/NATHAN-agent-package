import { test } from "node:test";
import assert from "node:assert/strict";
import { OllamaLLMProvider } from "../../../../dist/llm/index.js";

const COMPLETE_BODY = {
  model: "qwen2.5:0.5b",
  message: { role: "assistant", content: "Hi!" },
  done: true,
  prompt_eval_count: 36,
  eval_count: 3,
};

const TOOLCALL_BODY = {
  model: "qwen2.5:0.5b",
  message: {
    role: "assistant",
    content: "",
    tool_calls: [{ id: "call_5ey5whqw", function: { index: 0, name: "get_weather", arguments: { city: "Paris" } } }],
  },
  done: true,
  prompt_eval_count: 154,
  eval_count: 20,
};

const fakeFetch = (body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

test("complete() maps content and usage", async () => {
  const p = new OllamaLLMProvider({ model: "qwen2.5:0.5b", fetch: fakeFetch(COMPLETE_BODY) });
  const r = await p.complete([{ role: "user", content: "hi" }]);
  assert.equal(r.content, "Hi!");
  assert.deepEqual(r.toolCalls, []);
  assert.deepEqual(r.usage, { tokensIn: 36, tokensOut: 3 });
});

test("complete() maps tool calls (arguments already an object)", async () => {
  const p = new OllamaLLMProvider({ model: "qwen2.5:0.5b", fetch: fakeFetch(TOOLCALL_BODY) });
  const r = await p.complete([{ role: "user", content: "weather?" }], [
    { name: "get_weather", description: "Get weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
  ]);
  assert.equal(r.content, "");
  assert.deepEqual(r.toolCalls, [{ id: "call_5ey5whqw", name: "get_weather", arguments: { city: "Paris" } }]);
});

test("complete() throws LLMError API_ERROR on non-ok", async () => {
  const failing = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ model: "qwen2.5:0.5b", fetch: failing });
  await assert.rejects(() => p.complete([{ role: "user", content: "hi" }]), (e: unknown) => {
    assert.equal((e as { name: string }).name, "LLMError");
    assert.equal((e as { code: string }).code, "API_ERROR");
    return true;
  });
});

test("capabilities: streaming always true, tools default true, overridable", () => {
  assert.equal(new OllamaLLMProvider({ model: "m" }).supportsStreaming(), true);
  assert.equal(new OllamaLLMProvider({ model: "m" }).supportsTools(), true);
  assert.equal(new OllamaLLMProvider({ model: "m", supportsTools: false }).supportsTools(), false);
});

const STREAM_NDJSON =
  '{"message":{"role":"assistant","content":"Su"},"done":false}\n' +
  '{"message":{"role":"assistant","content":"re"},"done":false}\n' +
  '{"message":{"role":"assistant","content":""},"done":true,"prompt_eval_count":36,"eval_count":26}\n';

test("stream() yields deltas then a terminal chunk with usage", async () => {
  const streamingFetch = (async () => new Response(STREAM_NDJSON, { status: 200 })) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ model: "qwen2.5:0.5b", fetch: streamingFetch });
  assert.ok(p.stream, "stream must be defined");
  const chunks = [];
  for await (const c of p.stream!([{ role: "user", content: "count" }])) chunks.push(c);
  assert.deepEqual(chunks.map((c) => c.contentDelta), ["Su", "re", ""]);
  assert.deepEqual(chunks.map((c) => c.done), [false, false, true]);
  assert.equal(chunks[0].usage, undefined);
  assert.deepEqual(chunks[2].usage, { tokensIn: 36, tokensOut: 26 });
});
