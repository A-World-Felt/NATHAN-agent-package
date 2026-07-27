import { test } from "node:test";
import assert from "node:assert/strict";
import { HeuristicTokenCounter } from "../../../dist/context/index.js";
import type { Message } from "../../../dist/llm/index.js";

test("count() of an empty list is 0", () => {
  const counter = new HeuristicTokenCounter();
  assert.equal(counter.count([]), 0);
});

test("count() is characters divided by four, rounded up", () => {
  const counter = new HeuristicTokenCounter();
  assert.equal(counter.count([{ role: "user", content: "abcd" }]), 1);
  assert.equal(counter.count([{ role: "user", content: "abcde" }]), 2);
});

test("count() sums every message in the list", () => {
  const counter = new HeuristicTokenCounter();
  const history: Message[] = [
    { role: "system", content: "abcd" },
    { role: "user", content: "abcd" },
  ];
  assert.equal(counter.count(history), 2);
});

test("count() includes tool-call arguments, not only content", () => {
  const counter = new HeuristicTokenCounter();
  const withoutCalls: Message[] = [{ role: "assistant", content: "" }];
  const withCalls: Message[] = [
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "c1", name: "navigate", arguments: { page: "reglages" } }],
    },
  ];
  // An assistant that calls a tool sends a real payload with an empty content:
  // counting content alone would report 0 for a message that costs real tokens.
  assert.equal(counter.count(withoutCalls), 0);
  assert.ok(counter.count(withCalls) > 0, "the tool-call payload must be counted");
});

test("count() of a tool result counts its content", () => {
  const counter = new HeuristicTokenCounter();
  const history: Message[] = [{ role: "tool", content: "abcdefgh", toolCallId: "c1" }];
  assert.equal(counter.count(history), 2);
});
