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

const encoder = new TextEncoder();
// A fetch whose response body streams the given string pieces as separate byte chunks,
// so a test controls exactly where reads split, including mid-line and no trailing newline.
const chunkedFetch = (pieces: string[]): typeof fetch =>
  (async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const piece of pieces) controller.enqueue(encoder.encode(piece));
          controller.close();
        },
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

test("stream() reassembles a line split across reads and a final line with no trailing newline", async () => {
  const pieces = [
    '{"message":{"role":"assistant","content":"Su',                                       // line 1, cut mid-object
    're"},"done":false}\n{"message":{"role":"assistant","content":"!"},"done":false}\n',   // rest of line 1 + full line 2
    '{"message":{"role":"assistant","content":""},"done":true,"prompt_eval_count":36,"eval_count":26}', // final line, NO trailing newline
  ];
  const p = new OllamaLLMProvider({ model: "qwen2.5:0.5b", fetch: chunkedFetch(pieces) });
  const chunks = [];
  for await (const c of p.stream!([{ role: "user", content: "count" }])) chunks.push(c);
  assert.deepEqual(chunks.map((c) => c.contentDelta), ["Sure", "!", ""]);
  assert.deepEqual(chunks.map((c) => c.done), [false, false, true]);
  assert.deepEqual(chunks[2].usage, { tokensIn: 36, tokensOut: 26 });
});

// A fetch whose response body streams the given raw byte chunks verbatim,
// so a test can split a single multi-byte UTF-8 character across two reads.
const rawByteFetch = (chunks: Uint8Array[]): typeof fetch =>
  (async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

test("stream() reassembles a multi-byte UTF-8 character split across raw reads", async () => {
  const line = '{"message":{"role":"assistant","content":"café"},"done":true,"prompt_eval_count":1,"eval_count":1}\n';
  const bytes = encoder.encode(line);
  // "é" is two UTF-8 bytes (0xC3 0xA9), unique in this ASCII line; split between them so
  // each raw read carries half the character and the decoder must reassemble across reads.
  const splitAt = bytes.indexOf(0xc3) + 1;
  const p = new OllamaLLMProvider({
    model: "qwen2.5:0.5b",
    fetch: rawByteFetch([bytes.slice(0, splitAt), bytes.slice(splitAt)]),
  });
  const chunks = [];
  for await (const c of p.stream!([{ role: "user", content: "hi" }])) chunks.push(c);
  assert.deepEqual(chunks.map((c) => c.contentDelta), ["café"]);
  assert.deepEqual(chunks.map((c) => c.done), [true]);
});

test("complete() throws LLMError API_ERROR on a malformed JSON body", async () => {
  const malformed = (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ model: "qwen2.5:0.5b", fetch: malformed });
  await assert.rejects(() => p.complete([{ role: "user", content: "hi" }]), (e: unknown) => {
    assert.equal((e as { name: string }).name, "LLMError");
    assert.equal((e as { code: string }).code, "API_ERROR");
    return true;
  });
});

test("stream() throws LLMError API_ERROR on a malformed NDJSON line", async () => {
  const malformed = (async () => new Response("not json\n", { status: 200 })) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ model: "qwen2.5:0.5b", fetch: malformed });
  await assert.rejects(async () => {
    const chunks = [];
    for await (const c of p.stream!([{ role: "user", content: "hi" }])) chunks.push(c);
  }, (e: unknown) => {
    assert.equal((e as { name: string }).name, "LLMError");
    assert.equal((e as { code: string }).code, "API_ERROR");
    return true;
  });
});

test("stream() throws LLMError API_ERROR on a chunk without a done boolean", async () => {
  const noDone = (async () =>
    new Response('{"message":{"role":"assistant","content":"hi"}}\n', { status: 200 })) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ model: "qwen2.5:0.5b", fetch: noDone });
  await assert.rejects(async () => {
    const chunks = [];
    for await (const c of p.stream!([{ role: "user", content: "hi" }])) chunks.push(c);
  }, (e: unknown) => {
    assert.equal((e as { name: string }).name, "LLMError");
    assert.equal((e as { code: string }).code, "API_ERROR");
    return true;
  });
});

test("role:'tool' message forwards only role and content, dropping toolCallId", async () => {
  let sentMessages: unknown;
  const capturingFetch = (async (_url: string, init: { body: string }) => {
    sentMessages = (JSON.parse(init.body) as { messages: unknown }).messages;
    return new Response(JSON.stringify(COMPLETE_BODY), { status: 200 });
  }) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ model: "qwen2.5:0.5b", fetch: capturingFetch });
  await p.complete([{ role: "tool", content: "result", toolCallId: "call_1" }]);
  assert.deepEqual(sentMessages, [{ role: "tool", content: "result" }]);
});
