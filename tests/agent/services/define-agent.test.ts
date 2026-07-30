import { test } from "node:test";
import assert from "node:assert/strict";
import { defineAgent } from "../../../dist/agent/index.js";
import type { Tool } from "../../../dist/tools/index.js";

function navigateTool(): Tool {
  return {
    name: "navigate",
    description: "Go to a page of the application",
    schema: { type: "object", properties: { page: { type: "string" } }, required: ["page"] },
    async execute(args) {
      return { content: `page = ${String(args.page)}`, isError: false };
    },
  };
}

test("a definition carries the name, the prompt and the tools it was given", () => {
  const navigate = navigateTool();

  const agent = defineAgent({
    name: "navigateur",
    prompt: "Tu aides une personne a naviguer dans l'application.",
    tools: [navigate],
  });

  assert.equal(agent.name, "navigateur");
  assert.equal(agent.prompt, "Tu aides une personne a naviguer dans l'application.");
  assert.deepEqual(agent.tools, [navigate]);
});

test("a definition may recommend a model, and carries none when it does not", () => {
  const withRecommendation = defineAgent({
    name: "navigateur",
    prompt: "…",
    tools: [],
    recommendedModel: "qwen2.5:7b",
  });
  const without = defineAgent({ name: "navigateur", prompt: "…", tools: [] });

  assert.equal(withRecommendation.recommendedModel, "qwen2.5:7b");
  assert.equal(without.recommendedModel, undefined);
});

test("a definition cannot be mutated after it is declared", () => {
  const agent = defineAgent({ name: "navigateur", prompt: "…", tools: [] });

  const rename = () => {
    Object.assign(agent, { name: "autre" });
  };

  assert.throws(rename, TypeError);
  assert.equal(agent.name, "navigateur");
});

test("later edits to the object passed in do not reach the definition", () => {
  const source = { name: "navigateur", prompt: "v1", tools: [] };

  const agent = defineAgent(source);
  source.prompt = "v2";

  assert.equal(agent.prompt, "v1");
});
