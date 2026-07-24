import { test } from "node:test";
import assert from "node:assert/strict";
import { OllamaLLMProvider } from "../../dist/llm/index.js";
import { checkProviderContract } from "../../dist/testing/index.js";

// Opt-in only: the default suite stays deterministic and network-free.
// Run with `OLLAMA_INTEGRATION=1 npm test` and a live Ollama to exercise this.
const OPT_IN = process.env.OLLAMA_INTEGRATION === "1";

test(
  "OllamaLLMProvider conforms to the port against a live Ollama",
  { skip: OPT_IN ? false : "set OLLAMA_INTEGRATION=1 with Ollama running" },
  async () => {
    const provider = new OllamaLLMProvider({ model: process.env.OLLAMA_MODEL ?? "qwen2.5:0.5b" });
    // The real provider reports supportsStreaming() === true, so this also
    // exercises the streaming checks against the live endpoint.
    const report = await checkProviderContract(provider);
    assert.ok(report.ok, JSON.stringify(report.checks, null, 2));
  },
);
