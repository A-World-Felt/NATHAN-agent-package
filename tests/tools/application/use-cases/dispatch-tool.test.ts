import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchTool } from "../../../../dist/tools/index.js";
import type { Tool, ToolOutcome } from "../../../../dist/tools/index.js";
import type { ToolCall } from "../../../../dist/llm/index.js";

const NAVIGATE_CALL: ToolCall = {
  id: "call-1",
  name: "navigate",
  arguments: { page: "reglages" },
};

/** A tool that succeeds, and keeps what it was handed so the pass-through is observable. */
function navigateTool(): Tool & { readonly seen: Record<string, unknown>[] } {
  const seen: Record<string, unknown>[] = [];
  return {
    name: "navigate",
    description: "Go to a page of the application",
    schema: {
      type: "object",
      properties: { page: { type: "string" } },
      required: ["page"],
    },
    seen,
    async execute(args) {
      seen.push(args);
      const outcome: ToolOutcome = { content: `page = ${String(args.page)}`, isError: false };
      return outcome;
    },
  };
}

/** A tool whose `execute` never returns normally. `thrown` is raised, not returned. */
function failingTool(thrown: unknown, mode: "sync" | "async"): Tool {
  return {
    name: "navigate",
    description: "Go to a page of the application",
    schema: { type: "object", properties: {} },
    execute(): Promise<ToolOutcome> {
      if (mode === "sync") throw thrown;
      return Promise.reject(thrown);
    },
  };
}

test("a call reaches its tool, and the answer carries the call id", async () => {
  const navigate = navigateTool();

  const result = await dispatchTool(NAVIGATE_CALL, [navigate]);

  assert.equal(result.toolCallId, "call-1");
  assert.equal(result.content, "page = reglages");
  assert.equal(result.isError, false);
});

test("the parsed arguments reach the tool untouched", async () => {
  const navigate = navigateTool();

  await dispatchTool(NAVIGATE_CALL, [navigate]);

  assert.deepEqual(navigate.seen, [{ page: "reglages" }]);
});

test("two calls to the same tool each get their own id back", async () => {
  const navigate = navigateTool();
  const second: ToolCall = { id: "call-2", name: "navigate", arguments: { page: "profil" } };

  const first = await dispatchTool(NAVIGATE_CALL, [navigate]);
  const followUp = await dispatchTool(second, [navigate]);

  assert.equal(first.toolCallId, "call-1");
  assert.equal(followUp.toolCallId, "call-2");
  assert.equal(followUp.content, "page = profil");
});

test("a tool that reports a failure keeps its own message", async () => {
  const refusing: Tool = {
    name: "navigate",
    description: "Go to a page of the application",
    schema: { type: "object", properties: {} },
    async execute() {
      return { content: "no such page: reglagez", isError: true };
    },
  };

  const result = await dispatchTool(NAVIGATE_CALL, [refusing]);

  assert.equal(result.isError, true);
  assert.equal(result.content, "no such page: reglagez");
  assert.equal(result.toolCallId, "call-1");
});

test("a tool the agent does not carry becomes an error result, not an exception", async () => {
  const other: Tool = {
    name: "click",
    description: "Click an element",
    schema: { type: "object", properties: {} },
    async execute() {
      return { content: "clicked", isError: false };
    },
  };

  const result = await dispatchTool(NAVIGATE_CALL, [other]);

  assert.equal(result.isError, true);
  assert.equal(result.toolCallId, "call-1");
  // The model has to be able to correct itself: the answer names what it asked for
  // and what it may ask for instead.
  assert.match(result.content, /navigate/);
  assert.match(result.content, /click/);
});

test("with no tools at all, an unknown call still comes back as a result", async () => {
  const result = await dispatchTool(NAVIGATE_CALL, []);

  assert.equal(result.isError, true);
  assert.equal(result.toolCallId, "call-1");
});

test("a tool that throws synchronously becomes an error result", async () => {
  const result = await dispatchTool(NAVIGATE_CALL, [failingTool(new Error("boom"), "sync")]);

  assert.equal(result.isError, true);
  assert.equal(result.toolCallId, "call-1");
  assert.match(result.content, /boom/);
});

test("a tool that rejects becomes an error result", async () => {
  const result = await dispatchTool(NAVIGATE_CALL, [failingTool(new Error("timed out"), "async")]);

  assert.equal(result.isError, true);
  assert.equal(result.toolCallId, "call-1");
  assert.match(result.content, /timed out/);
});

test("a tool that throws something that is not an Error is still reported", async () => {
  const result = await dispatchTool(NAVIGATE_CALL, [failingTool("plain string", "async")]);

  assert.equal(result.isError, true);
  assert.match(result.content, /plain string/);
});
