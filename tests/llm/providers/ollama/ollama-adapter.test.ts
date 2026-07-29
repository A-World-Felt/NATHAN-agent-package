import { test } from "node:test";
import assert from "node:assert/strict";
import { OllamaLLMProvider } from "../../../../dist/llm/index.js";

const MODEL = "qwen2.5:0.5b";
/** What every provider in this file declares; the model then travels per call (ADR-AGENT-0017). */
const DECLARED = [{ id: MODEL, supportsTools: true }];

const COMPLETE_BODY = {
  model: MODEL,
  message: { role: "assistant", content: "Hi!" },
  done: true,
  prompt_eval_count: 36,
  eval_count: 3,
};

const TOOLCALL_BODY = {
  model: MODEL,
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
  const p = new OllamaLLMProvider({ models: DECLARED, fetch: fakeFetch(COMPLETE_BODY) });
  const r = await p.complete([{ role: "user", content: "hi" }], { model: MODEL });
  assert.equal(r.content, "Hi!");
  assert.deepEqual(r.toolCalls, []);
  assert.deepEqual(r.usage, { tokensIn: 36, tokensOut: 3 });
});

test("complete() maps tool calls (arguments already an object)", async () => {
  const p = new OllamaLLMProvider({ models: DECLARED, fetch: fakeFetch(TOOLCALL_BODY) });
  const r = await p.complete([{ role: "user", content: "weather?" }], {
    model: MODEL,
    tools: [
      { name: "get_weather", description: "Get weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
    ],
  });
  assert.equal(r.content, "");
  assert.deepEqual(r.toolCalls, [{ id: "call_5ey5whqw", name: "get_weather", arguments: { city: "Paris" } }]);
});

test("complete() throws LLMError API_ERROR on non-ok", async () => {
  const failing = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ models: DECLARED, fetch: failing });
  await assert.rejects(() => p.complete([{ role: "user", content: "hi" }], { model: MODEL }), (e: unknown) => {
    assert.equal((e as { name: string }).name, "LLMError");
    assert.equal((e as { code: string }).code, "API_ERROR");
    assert.match((e as Error).message, /boom/, "the server's body is kept for diagnosis");
    return true;
  });
});

test("streaming is a transport capability, always on", () => {
  assert.equal(new OllamaLLMProvider({ models: DECLARED }).supportsStreaming(), true);
});

test("models() returns what was declared, tool capability included", () => {
  const declared = [
    { id: "qwen2.5:0.5b", supportsTools: true },
    { id: "llama3.2:1b", supportsTools: false, maxInputTokens: 4096 },
  ];
  assert.deepEqual(new OllamaLLMProvider({ models: declared }).models(), declared);
});

const STREAM_NDJSON =
  '{"message":{"role":"assistant","content":"Su"},"done":false}\n' +
  '{"message":{"role":"assistant","content":"re"},"done":false}\n' +
  '{"message":{"role":"assistant","content":""},"done":true,"prompt_eval_count":36,"eval_count":26}\n';

test("stream() yields deltas then a terminal chunk with usage", async () => {
  const streamingFetch = (async () => new Response(STREAM_NDJSON, { status: 200 })) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ models: DECLARED, fetch: streamingFetch });
  assert.ok(p.stream, "stream must be defined");
  const chunks = [];
  for await (const c of p.stream!([{ role: "user", content: "count" }], { model: MODEL })) chunks.push(c);
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
  const p = new OllamaLLMProvider({ models: DECLARED, fetch: chunkedFetch(pieces) });
  const chunks = [];
  for await (const c of p.stream!([{ role: "user", content: "count" }], { model: MODEL })) chunks.push(c);
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
    models: DECLARED,
    fetch: rawByteFetch([bytes.slice(0, splitAt), bytes.slice(splitAt)]),
  });
  const chunks = [];
  for await (const c of p.stream!([{ role: "user", content: "hi" }], { model: MODEL })) chunks.push(c);
  assert.deepEqual(chunks.map((c) => c.contentDelta), ["café"]);
  assert.deepEqual(chunks.map((c) => c.done), [true]);
});

test("complete() throws LLMError API_ERROR on a malformed JSON body", async () => {
  const malformed = (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ models: DECLARED, fetch: malformed });
  await assert.rejects(() => p.complete([{ role: "user", content: "hi" }], { model: MODEL }), (e: unknown) => {
    assert.equal((e as { name: string }).name, "LLMError");
    assert.equal((e as { code: string }).code, "API_ERROR");
    return true;
  });
});

test("stream() throws LLMError API_ERROR on a malformed NDJSON line", async () => {
  const malformed = (async () => new Response("not json\n", { status: 200 })) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ models: DECLARED, fetch: malformed });
  await assert.rejects(async () => {
    const chunks = [];
    for await (const c of p.stream!([{ role: "user", content: "hi" }], { model: MODEL })) chunks.push(c);
  }, (e: unknown) => {
    assert.equal((e as { name: string }).name, "LLMError");
    assert.equal((e as { code: string }).code, "API_ERROR");
    return true;
  });
});

test("stream() throws LLMError API_ERROR on a chunk without a done boolean", async () => {
  const noDone = (async () =>
    new Response('{"message":{"role":"assistant","content":"hi"}}\n', { status: 200 })) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ models: DECLARED, fetch: noDone });
  await assert.rejects(async () => {
    const chunks = [];
    for await (const c of p.stream!([{ role: "user", content: "hi" }], { model: MODEL })) chunks.push(c);
  }, (e: unknown) => {
    assert.equal((e as { name: string }).name, "LLMError");
    assert.equal((e as { code: string }).code, "API_ERROR");
    return true;
  });
});

test("complete() rejects an undeclared model before sending anything", async () => {
  let requested = false;
  const spyFetch = (async () => {
    requested = true;
    return new Response(JSON.stringify(COMPLETE_BODY), { status: 200 });
  }) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ models: [{ id: "qwen2.5:0.5b", supportsTools: true }], fetch: spyFetch });

  await assert.rejects(
    () => p.complete([{ role: "user", content: "hi" }], { model: "llama3.2:3b" }),
    (e: unknown) => {
      assert.equal((e as { code: string }).code, "MODEL_NOT_FOUND");
      assert.match((e as Error).message, /qwen2\.5:0\.5b/);
      return true;
    },
  );
  assert.equal(requested, false, "an undeclared model must not reach the network");
});

test("stream() rejects an undeclared model too, on its first iteration", async () => {
  let requested = false;
  const spyFetch = (async () => {
    requested = true;
    return new Response("", { status: 200 });
  }) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ models: DECLARED, fetch: spyFetch });

  // The guard sits in the private post(), which an async generator body only reaches once
  // iterated. Calling stream() therefore cannot throw: the first next() is what does.
  const stream = p.stream!([{ role: "user", content: "hi" }], { model: "llama3.2:3b" });
  const iterator = stream[Symbol.asyncIterator]();

  await assert.rejects(
    () => iterator.next(),
    (e: unknown) => {
      assert.equal((e as { code: string }).code, "MODEL_NOT_FOUND");
      assert.match((e as Error).message, /qwen2\.5:0\.5b/);
      return true;
    },
  );
  assert.equal(requested, false, "an undeclared model must not reach the network");
});

test("a declared model the server does not hold yields the pull command to run", async () => {
  const notInstalled = (async () =>
    new Response('{"error":"model \'qwen2.5:0.5b\' not found"}', { status: 404 })) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ models: DECLARED, fetch: notInstalled });

  await assert.rejects(
    () => p.complete([{ role: "user", content: "hi" }], { model: MODEL }),
    (e: unknown) => {
      assert.equal((e as { code: string }).code, "MODEL_NOT_FOUND");
      assert.match((e as Error).message, /ollama pull qwen2\.5:0\.5b/);
      return true;
    },
  );
});

test("a 404 that did not come from the API is an API_ERROR, not a missing model", async () => {
  // A baseURL that never reaches Ollama answers 404 as well. What separates the two is the shape
  // of the body, not its wording: the API writes JSON carrying `error`, a fronting server writes
  // whatever it likes. Answering that with `ollama pull` would send a reader after a model that
  // was never the problem.
  const notTheApi = (async () =>
    new Response("<html>404 not found</html>", { status: 404 })) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ models: DECLARED, fetch: notTheApi });

  await assert.rejects(
    () => p.complete([{ role: "user", content: "hi" }], { model: MODEL }),
    (e: unknown) => {
      assert.equal((e as { code: string }).code, "API_ERROR");
      assert.doesNotMatch((e as Error).message, /ollama pull/);
      return true;
    },
  );
});

test("role:'tool' message forwards only role and content, dropping toolCallId", async () => {
  let sentMessages: unknown;
  const capturingFetch = (async (_url: string, init: { body: string }) => {
    sentMessages = (JSON.parse(init.body) as { messages: unknown }).messages;
    return new Response(JSON.stringify(COMPLETE_BODY), { status: 200 });
  }) as unknown as typeof fetch;
  const p = new OllamaLLMProvider({ models: DECLARED, fetch: capturingFetch });
  await p.complete([{ role: "tool", content: "result", toolCallId: "call_1" }], { model: MODEL });
  assert.deepEqual(sentMessages, [{ role: "tool", content: "result" }]);
});
