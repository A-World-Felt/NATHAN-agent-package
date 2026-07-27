import { test } from "node:test";
import assert from "node:assert/strict";
import { SlidingWindowStrategy, HeuristicTokenCounter } from "../../../../dist/context/index.js";
import type { TokenCounter } from "../../../../dist/context/index.js";
import type { Message } from "../../../../dist/llm/index.js";

// One token per message, so a budget in this file reads directly as "how many messages fit".
// A stub, not the heuristic: these tests are about the selection rule, not about counting.
const oneTokenPerMessage: TokenCounter = { count: (messages) => messages.length };

const SYSTEM: Message = { role: "system", content: "tu es NATHAN" };
const USER_1: Message = { role: "user", content: "amene-moi aux reglages" };
const CALL: Message = {
  role: "assistant",
  content: "",
  toolCalls: [{ id: "c1", name: "navigate", arguments: { page: "reglages" } }],
};
const RESULT: Message = { role: "tool", content: "page = reglages", toolCallId: "c1" };
const ANSWER: Message = { role: "assistant", content: "tu es dans les reglages" };
const USER_2: Message = { role: "user", content: "mets le theme sombre" };

/** Build a strategy whose budget is expressed in messages, via the stub counter. */
function windowOf(maxTokens: number): SlidingWindowStrategy {
  return new SlidingWindowStrategy({ maxTokens, counter: oneTokenPerMessage });
}

/** No `tool` message may appear without the `assistant` call it answers, earlier in the list. */
function hasOrphanToolMessage(messages: Message[]): boolean {
  const seenCallIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "assistant" && message.toolCalls !== undefined) {
      for (const call of message.toolCalls) seenCallIds.add(call.id);
    }
    if (message.role === "tool" && !seenCallIds.has(message.toolCallId)) return true;
  }
  return false;
}

test("maxTokens is exposed as given", () => {
  const context = new SlidingWindowStrategy({ maxTokens: 512, counter: new HeuristicTokenCounter() });
  assert.equal(context.maxTokens, 512);
});

test("build() of an empty history yields an empty list", async () => {
  const built = await windowOf(10).build([]);
  assert.deepEqual(built, []);
});

test("build() returns a history that fits untouched, in order", async () => {
  const history = [SYSTEM, USER_1, ANSWER];
  const built = await windowOf(10).build(history);
  assert.deepEqual(built, history);
});

test("build() drops the oldest messages and keeps the newest on overflow", async () => {
  const built = await windowOf(2).build([USER_1, ANSWER, USER_2]);
  assert.deepEqual(built, [ANSWER, USER_2]);
});

test("build() keeps the system message through a cut that would have dropped it", async () => {
  const built = await windowOf(3).build([SYSTEM, USER_1, ANSWER, USER_2]);
  assert.deepEqual(built, [SYSTEM, ANSWER, USER_2]);
});

test("build() drops a call and its result together when the pair does not fit", async () => {
  const built = await windowOf(3).build([SYSTEM, USER_1, CALL, RESULT, USER_2]);
  assert.deepEqual(built, [SYSTEM, USER_2]);
  assert.equal(hasOrphanToolMessage(built), false);
});

test("build() keeps a call and its result together when the pair fits", async () => {
  const built = await windowOf(4).build([SYSTEM, USER_1, CALL, RESULT, USER_2]);
  assert.deepEqual(built, [SYSTEM, CALL, RESULT, USER_2]);
  assert.equal(hasOrphanToolMessage(built), false);
});

test("build() never produces an orphan tool message, at any budget", async () => {
  const history = [SYSTEM, USER_1, CALL, RESULT, ANSWER, USER_2];
  for (let maxTokens = 0; maxTokens <= history.length + 1; maxTokens += 1) {
    const built = await windowOf(maxTokens).build(history);
    assert.equal(hasOrphanToolMessage(built), false, `orphan tool at maxTokens=${maxTokens}`);
  }
});

test("build() keeps the newest message even when nothing fits, rather than an unanswerable list", async () => {
  const built = await windowOf(0).build([SYSTEM, USER_1]);
  assert.deepEqual(built, [SYSTEM, USER_1]);
});

test("build() tolerates an orphan tool message already present in the input", async () => {
  const history = [RESULT, USER_2];
  const built = await windowOf(10).build(history);
  assert.deepEqual(built, history);
});

test("build() pins only the leading system messages", async () => {
  const lateSystem: Message = { role: "system", content: "regle ajoutee en cours de route" };
  const built = await windowOf(3).build([SYSTEM, USER_1, lateSystem, USER_2]);
  assert.deepEqual(built, [SYSTEM, lateSystem, USER_2]);
});

test("build() does not mutate the history it was given", async () => {
  const history = [SYSTEM, USER_1, ANSWER, USER_2];
  const before = [...history];
  await windowOf(2).build(history);
  assert.deepEqual(history, before);
});

test("observe() resolves and changes nothing observable", async () => {
  const context = windowOf(10);
  const history = [SYSTEM, USER_1];
  const beforeObserve = await context.build(history);
  const observed = await context.observe([ANSWER]);
  const afterObserve = await context.build(history);
  assert.equal(observed, undefined);
  assert.deepEqual(afterObserve, beforeObserve);
});
