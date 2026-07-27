# PR breakdown: V1

> **Date**: 2026-07-21
> **Scope**: V1 of the package (see `ROADMAP.md`)
> **Principle**: each PR depends only on the previous ones, and **each PR is verifiable**.

---

## Overview

| PR | Content | Completion criterion |
|---|---|---|
| **1** | packaging + `models/` + **complete tree** + schema | `npm run build` produces `dist/`; `npm install` succeeds from a test repo |
| **2** | `LLMProvider` + `OllamaLLMProvider` + `FakeLLMProvider` | deterministic test on the fake; one real call to Ollama |
| **3** | `ContextStrategy` + `TokenCounter` + `SlidingWindowStrategy` | truncation verified, `observe()` no-op |
| **4** | `AgenticLLM` + `step()` + `ToolDispatcher` | loop tested **on the fake**: dispatch, `maxIterations`, `stopReason` |
| **5** | simulator + `defineScenario` + `runScenario` | one end-to-end navigation scenario |
| **6** | `runMatrix` + metrics + `toJSON`/`toCSV` | a 2 models × 2 memories × 5 runs matrix |

Then: integration into the IDE repo, and back here when a wall appears.

---

## PR1: The package exists and builds

**This is not a PR of empty files.** A tree with no content cannot be verified: nothing runs, nothing is tested, the review has no object. And the structure is only a hypothesis: we would discover in PR2 that the shape is wrong and half of it would be moved.

> **Revision 2026-07-21.** The scope was widened: PR1 also lays down **the complete skeleton** of the tree (all folders, marked `.gitkeep`, mapped in `ROADMAP.md`). The reasoning above still holds for the **code**: no `index.ts` stub, no empty class. What we add are **folders**, not empty code files: the structure is now frozen (validated end to end against page 5 of the schema and the 4 bands), so the risk of moving things in PR2 is low; and the owner wants to navigate the architecture as folders from the start. Behavioral verification (build + install) is still carried by the `models/` and the packaging, as below.

The real milestone is **the distribution chain**, with the minimum of real content:

- `package.json`: the three `exports` branches (`ADR-AGENT-0002`), `type: module`, `files: ["dist"]`
- `tsconfig.json` + `tsconfig.build.json`
- `.gitignore`, `.env.example`
- `src/llm/models/`: `Message`, `ToolCall`, `ToolResult`, `LLMResponse`, `LLMError`
- `src/tools/models/`: `ToolSchema`
- `src/index.ts`
- **the complete skeleton of the tree** (all folders, `.gitkeep`), mapped in `ROADMAP.md`
- the updated schema

The types **are** the contract, they are pure, and `tsc` verifies them.

**Verification**: `npm run build` produces `dist/index.js` **and** `dist/index.d.ts`; `npm pack` then installation into a throwaway repo, with an import that compiles.

> ESM + `NodeNext` pitfall: relative imports carry the extension of the **emitted** file, so `.js` even inside a `.ts`. `import type { Message } from "./models/index.js"`.

---

## PR2: The LLM port and its first two implementations

- `llm/interfaces/llm-provider.ts`
- `llm/providers/ollama/`: real adapter
- `testing/fake-llm-provider.ts`: scripted responses
- `llm/providers/index.ts`: `PROVIDERS: Record<ProviderID, () => LLMProvider>`, closed and typed

**The fake provider belongs to this PR, not to the harness.** It is a second implementation of the same port, written at the same time as the port. Two reasons:

1. **PR4 depends on it.** Testing the loop against Ollama alone would amount to testing *the model* instead of *our code*: impossible to tell a dispatch bug from a model that answered badly.
2. **It is the interface's verification.** If the fake is painful to write, the port is bad, and we learn it right away.

`LLMResponse.usage` is filled **right now** by the Ollama adapter. Retro-adding it into each adapter later is expensive (`ADR-AGENT-0007`).

> **To be verified against the real endpoint** before coding: the exact names of the counting fields returned by Ollama. Do not carry them over from memory (anti-hallucination rule no. 2).

**Verification**: deterministic suite on the fake; one real call to Ollama, launched by hand, whose output is shown in the PR.

---

## PR3: Context and counting

- `context/interfaces/context-strategy.ts`: `build()`, `observe()`
- `context/interfaces/token-counter.ts`
- `context/strategies/sliding-window/`
- `HeuristicTokenCounter`: characters ÷ 4, documented as approximate

`observe()` is a no-op here. This is deliberate: adding it in V3 would break an already-published interface.

**Verification**: an overflowing history is truncated; the most recent is kept; `observe()` does nothing without crashing.

---

## PR4: The loop

- `agent/application/dtos/`: `AgentDeps`, `AgentInput`, `AgentResult`, `AgentState`
- `agent/application/use-cases/agentic-llm.ts`: **class `AgenticLLM`**: `run()`, `step()`
- `agent/services/step.ts`: **pure function**, one iteration
- `tools/application/use-cases/dispatch-tool.ts`: `ToolDispatcher`
- `agent/services/define-agent.ts`

```ts
const agent = new AgenticLLM({ llm, context, tools, maxIterations: 10 });
const r = await agent.run("amène-moi aux réglages");
```

The class is the public API (`ADR-AGENT-0009`); `run()` wraps the pure function `step(state, deps)`, testable without instantiating anything.

Termination by absence of a tool call (`ADR-AGENT-0003`). A tool that fails returns a `ToolResult` carrying the error: it does not bring the loop down.

**Exit forced by graceful landing, not by cutoff** (`ADR-AGENT-0011`): budget reached (iterations / duration / tokens) or repetition detected (same tool, same arguments, ≥ 3 times) → we inject "conclude with what you have" and call the model back **without tools**, which forces it to write.

**Verification, entirely on the fake provider**:

- a response with no tool call → `stopReason: "completed"`;
- a tool round trip succeeds;
- budget exhausted → **a written response is returned**, `stopReason: "budget"`: not an empty result;
- the last call of the budget scenario is indeed made **without tools** (the fake provider lets us assert it);
- three identical calls in a row → `stopReason: "stuck"`;
- a tool that throws is caught.

`step()` is tested directly, outside the class.

---

## PR5: The simulator

- `testing/fake-app.ts`: shared-state environment factory
- `testing/define-scenario.ts`, `testing/run-scenario.ts`

Reminder of the three rules (`ADR-AGENT-0006`): `env` is a **factory** (fresh state on each run), expectations are **predicates** (no strict order imposed), and the result keeps the trace.

**No substitution table to write** (`ADR-AGENT-0010`): the harness builds an `AgenticLLM` with the simulator's tools, exactly as production builds it with its own. It therefore tests the **real** `ToolDispatcher`.

**Verification**: "amène-moi aux réglages" with a scripted fake provider, and the assertion bears on the **simulator's state**, not only on the list of calls.

---

## PR6: The matrix and the metrics

- `metrics/`: the `MetricsCollector` port, its in-memory implementation, pure aggregation
- `llm/infrastructure/with-metrics.ts`: the decorator
- `testing/run-matrix.ts`: cartesian product of the axes, `runs` repetitions, report

Per-instance scope, never `start`/`stop` (`ADR-AGENT-0007`). Rates passed as an argument. Separate dimensions, no composite score.

**Verification**: a 2 × 2 × 5 matrix on the fake provider produces 20 runs, one rate per combination, and a readable CSV. Failures keep their trace.

---

## Cross-cutting conventions

- **Commits**: `type(scope): description` (`feat(llm): ajouter OllamaLLMProvider`). Not Marcel's kitchen emojis, specific to their project.
- **Unit tests**: `node:test`, zero dependency.
- **Evals**: program launched by hand, never blocking in CI.
- **Barrel per layer**, with `barrel-contract.test.ts` that locks the public API: valuable for a package, since an export removed by mistake breaks a test, not a consumer.
- **Never** a hard-coded API key, never a committed `.env`.
