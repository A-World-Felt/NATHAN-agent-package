import { test } from "node:test";
import assert from "node:assert/strict";
import { toToolDefinition } from "../../../../dist/tools/index.js";
import type { Tool } from "../../../../dist/tools/index.js";

/** A tool with a schema of its own, so what the translation carries over is observable. */
function navigateTool(): Tool {
  return {
    name: "navigate",
    description: "Go to a page of the application",
    schema: {
      type: "object",
      properties: { page: { type: "string" } },
      required: ["page"],
    },
    async execute(args) {
      return { content: `page = ${String(args.page)}`, isError: false };
    },
  };
}

test("toToolDefinition presents a tool to the model", () => {
  const navigate = navigateTool();

  const definition = toToolDefinition(navigate);

  assert.equal(definition.name, "navigate");
  assert.equal(definition.description, "Go to a page of the application");
  assert.deepEqual(definition.parameters, navigate.schema);
});
