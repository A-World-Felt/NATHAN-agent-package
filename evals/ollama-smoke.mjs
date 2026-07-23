// Manual eval — NOT part of `node --test`. Requires a running Ollama and a pulled model.
// Run: npm run build && node evals/ollama-smoke.mjs
import { OllamaLLMProvider } from "../dist/llm/index.js";

const model = process.env.OLLAMA_MODEL ?? "qwen2.5:0.5b";
const p = new OllamaLLMProvider({ model });

console.log(`# complete (${model})`);
const r = await p.complete([{ role: "user", content: "Say hi in one word." }]);
console.log("content:", JSON.stringify(r.content));
console.log("usage:", r.usage);

console.log(`\n# stream (${model})`);
let deltas = 0;
let finalUsage;
for await (const c of p.stream([{ role: "user", content: "Count to three." }])) {
  if (!c.done) { process.stdout.write(c.contentDelta); deltas++; }
  else finalUsage = c.usage;
}
console.log(`\n[${deltas} deltas] terminal usage:`, finalUsage);
