# Roadmap: nathan-agent-core

Four versions. Since the layers are provider-agnostic, **choosing the provider is a late decision**: you start on what is free and local, then move up in quality afterward.

The reasoning behind each choice is in `docs/decisions/`. The V1 PR breakdown is in `docs/plans/2026-07-21-v1-decoupage-pr.md`.

---

## Target consumer

The package first serves **NATHAN's accessible IDE** (project ADR-0006, Flux E): a voice assistant for blind people, able to **navigate the application and write in it**. The agent translates dictation into MicroPython.

Permanent constraint, stated by the team:

> **No overhead. It must stay maintainable.**

It is the criterion that ruled out the generic permissions framework (`ADR-AGENT-0004`), the embedded tokenizer (`ADR-AGENT-0008`) and the runtime registry (`ADR-AGENT-0005`).

---

## V1: The engine, on Ollama

**All the agentic layers, a single provider, no API key.**

| Layer | Contents |
|---|---|
| LLM | `LLMProvider`, `OllamaLLMProvider`, `FakeLLMProvider` |
| Tools | `Tool`, `dispatchTool`, three file tools (opt-in via `./tools`) |
| Agent | `step()`, `makeRunAgent`, `stopReason` |
| Context | `ContextStrategy`, `SlidingWindowStrategy`, `TokenCounter` |
| Definitions | `defineAgent()` in TypeScript |
| Harness | simulator, scenarios, matrix, metrics |

**Why Ollama**: local, free, zero keys. It is the only genuinely free option (see the correction below). It lets you validate the loop and the harness without spending a cent or managing secrets.

**No permissions layer.** The constraints are carried by the tools: a `WriteFile` built with a root directory refuses to leave it. Ten lines, no framework. Details and security warning: `ADR-AGENT-0004`.

### Breakdown into six PRs

Each PR depends only on the previous ones, and **each PR verifies itself**. Full detail, pitfalls included: `docs/plans/2026-07-21-v1-decoupage-pr.md`.

| PR | Contents | Completion criterion |
|---|---|---|
| **1** | packaging (3 `exports` branches, `tsconfig` ×2) + `models/` + **full tree** + schema | `npm run build` produces `dist/`; `npm install` succeeds from a test repo |
| **2** | `LLMProvider` + `OllamaLLMProvider` + **`FakeLLMProvider`** | deterministic test on the fake; one real call to Ollama, output shown |
| **3** | `ContextStrategy` + `TokenCounter` + `SlidingWindowStrategy` | an overflowing history is truncated; `observe()` no-op |
| **4** | `AgenticLLM` (class) + `step()` (pure function) + `ToolDispatcher` | loop tested **on the fake**: dispatch, `maxIterations`, `stopReason` |
| **5** | simulator + `defineScenario` + `runScenario` | one end-to-end navigation scenario, assertion on the **simulator state** |
| **6** | `runMatrix` + metrics + `toJSON`/`toCSV` | a 2 × 2 × 5 matrix → 20 runs, one rate per combination, a readable CSV |

Three ordering points that are not arbitrary:

- **PR1 is not a PR of empty files.** A tree with no content cannot be verified. The milestone is the **distribution chain** (the package builds and installs) with the types as the only content, since they *are* the contract.
- **The fake provider is in PR2, not in the harness.** Without it, PR4 would test *the model* instead of *our loop*. It also serves as interface verification: if the fake is painful to write, the port is bad, and we learn it right away.
- **`LLMResponse.usage` is populated as of PR2.** The cost will be `null` everywhere in V1 on Ollama, but retrofitting the plumbing into every adapter later is expensive.

**Then**: integration into the IDE repo, and back here when a wall appears.

---

## V2: Second provider + evaluation on a real model

**Measure tool-call quality, and finally make the cost column speak.**

- A second adapter behind the same port: **no change to the engine**
- Real evaluations: real model, simulated tools, matrix across several axes

> ### ⚠️ Correction: the subscription does not grant the API
>
> The initial assumption was to pick OpenAI "because the subscription allows API calls, unlike Claude or DeepSeek". **This is false, and verified**: ChatGPT Plus ($20/month) and the OpenAI API are two separately billed products. Plus covers the web app; the API is pay-per-token usage, with a balance to credit separately.
>
> This is true everywhere: OpenAI and Anthropic both sell a *CLI agent* on subscription (Codex, Claude Code), neither sells raw API access on subscription. For a library that calls the API from its own code, it is prepaid per token everywhere.
>
> **Consequence**: the V2 provider is chosen on the real criteria: **tool-call quality, cost per token, latency**. DeepSeek is no longer to be ruled out (among the cheapest per token). OpenAI remains defensible, but not for the stated reason.
>
> Sources: [OpenAI Help Center](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus) · [ChatGPT Plus does not include the API](https://folding-sky.com/blog/why-use-api-keys-not-chatgpt) · [OpenAI Developer Community](https://community.openai.com/t/api-access-as-a-chatgpt-plus-subscriber/573409)

---

## V3: Self-feeding memory

**So the agent becomes personalized per person.**

A `MemoryStrategy` that feeds itself, in the spirit of a `CLAUDE.md`, but per user, and written by the agent itself over the course of exchanges.

**Plugs in without breaking anything**: `context/strategies/memory/` drops in next to `sliding-window/`, behind the same `ContextStrategy`. The engine does not move.

This is the port's reason for being: sliding window and memory are **two strategies behind one contract**. Hence `observe()` present as of V1, even if `SlidingWindowStrategy.observe()` is a literal no-op there. The contract those strategies must respect is frozen by `ADR-AGENT-0016`.

Accessibility stake: for a blind person dictating their code, an agent that remembers their habits avoids re-explaining everything at each session.

### The strategies intended here

Intentions, not decisions: each one becomes real only if the harness shows it beats the sliding-window baseline.

| Strategy | What it does | Needs |
|---|---|---|
| Summarize on saturation | when the budget is reached, replace the oldest exchanges with a summary the strategy keeps up to date via `observe()` | one LLM call inside `build()`, hence the `async` port |
| Cross-session memory | recall what the user said in earlier sessions, transparently into the window or through `remember` / `recall` tools | a persistent store, and the V3 memory decision |
| Background probing of what the agent remembers | ask the store what it holds, outside the request path, to keep it honest and prunable | a separate service, **not** a fourth member on the port |

**Packaging consequence, to settle before coding V3**: a persistent store touches disk, and the `.` barrel must stay importable everywhere with no disk access. A store therefore cannot ship through `.`: it needs its own subpath, like `./tools` (`ADR-AGENT-0002`, `ADR-AGENT-0012`).

**Prefix stability, not verified**: the candidate providers bill a previously seen prefix less, so a strategy that keeps a stable prefix and evicts from the middle should be cheaper than one truncating from the front; thresholds, TTLs and Ollama's behaviour are unchecked, and a strategy leaning on this needs a `docs/theory/` document first (`ADR-AGENT-0016`, open question 2).

---

## V4: Voice

`VoiceProvider` (`transcribe` / `synthesize`), the voice composition on top of `run-agent`, and the voice providers.

**Deliberately deferred.** Two reasons:

1. **Ollama does neither transcription nor synthesis.** Voice in V1 would have forced a second provider and keys from day one, contradicting "start simple".
2. The agentic package must be finished first (team decision).

`stream()` is in `LLMProvider` **as of V1** by anticipation: voice synthesis will want to speak while the model writes, not after.

---

## Full tree (target map, V1 → V4)

This map fixes where **each** class lands, all versions combined. The skeleton (`.gitkeep` folders) is laid down as of PR1; each PR then drops its code into it. `[V2]`/`[V3]`/`[V4]` = version of appearance; no tag = V1.

```
src/
  index.ts                       "." entry point: engine + ports + types, NO fs
  llm/
    models/index.ts              Message · ToolCall · ToolResult · LLMResponse · Usage · LLMChunk · LLMError
    interfaces/llm-provider.ts
    services/response-parser.ts        pure: provider JSON → LLMResponse
    providers/
      ollama/ollama-adapter.ts   OllamaLLMProvider
      gemini/gemini-adapter.ts   GeminiLLMProvider           [V2]
      azure/azure-adapter.ts     AzureLLMProvider            [V2]
      index.ts                   PROVIDERS: Record<ProviderID, () => LLMProvider>
    infrastructure/with-metrics.ts     withMetrics (LLMProvider → MetricsCollector decorator)
  context/
    interfaces/context-strategy.ts
    interfaces/token-counter.ts
    strategies/                  they differ by algorithm, not by vendor (ADR-AGENT-0016)
      sliding-window/…           SlidingWindowStrategy
      memory/…                   MemoryStrategy              [V3]
    infrastructure/heuristic-token-counter.ts   HeuristicTokenCounter
  tools/
    models/index.ts              ToolSchema
    interfaces/tool.ts
    application/use-cases/dispatch-tool.ts   dispatchTool ("ToolDispatcher" box from the schema)
    infrastructure/              ReadFile · WriteFile · ListFiles   → exported by "./tools"
  metrics/
    models/index.ts              UsageRecord · MetricsTotal · RateTable
    interfaces/metrics-collector.ts
    services/aggregate.ts        pure: records → MetricsTotal (with RateTable)
    infrastructure/collector.ts  MetricsCollector
  voice/                          [V4]: the whole framework
    interfaces/voice-provider.ts
    providers/
      gemini/…                   GeminiVoiceProvider
      azure/…                    AzureVoiceProvider
  agent/
    models/agent-definition.ts   AgentDefinition
    services/define-agent.ts     defineAgent (pure)
    services/step.ts             step(state, deps) (pure: one iteration)
    application/dtos/index.ts    AgentDeps · AgentInput · AgentResult · AgentState
    application/use-cases/agentic-llm.ts        AgenticLLM (class: public API)
    application/use-cases/voice-agentic-llm.ts  VoiceAgenticLLM (class)   [V4]
  testing/                        → exported by "./testing", never in prod
    fake-llm-provider.ts         FakeLLMProvider (2nd LLMProvider implementation)
    fake-app.ts · define-scenario.ts · run-scenario.ts · run-matrix.ts
```

**Same pattern in each framework**: `models/` (data) · `interfaces/` (ports, one `kebab-case.ts` per contract) · `services/` (pure functions) · `application/` (dtos + use-cases) · `providers/<vendor>/` and `infrastructure/` (I/O adapters). You learn one component, you know all six.

**Outside the package**: `ExternalLLMProvider` / `ExternalVoiceProvider` (the "External Implementation" band of the schema) are written by the **consumer repo** behind the same ports, not files from here.

**The 3 entry points** in this tree: `.` = everything except `fs` and the fake provider; `./tools` = the 3 file tools; `./testing` = the harness.

**The 4 bands of the team diagram**: Application = `agent/` · Interface = all the `interfaces/` · Local Implementation = shipped `providers/` + `infrastructure/` · External Implementation = the consumer repo.

---

## The cycle with the IDE repo

The real engine that improves the package is not this roadmap, it is the confrontation with a real consumer:

```
V1 shipped → integration into the IDE repo → harness on the real features
   ↑                                                     │
   └──────── we come back to improve the package ←──── a wall appears
```

**Point of vigilance.** According to `PMC/CONTEXT-AGENT.md`, the IDE stack is decided at `TECH-19` in early S7 (January 2027) and Flux E starts at that point. The package will therefore be "finished" several months before its consumer exists.

Practical consequence: **keep V1 truly minimal.** Every abstraction added before then is a bet with no feedback, and that is exactly how you build the wrong abstraction.

---

## What does not need to be built

**Agent versioning.** No `version` field, no runtime registry, no database. An agent is a committed TypeScript file; the version is git; "this version is good" is what the tests prove. See `ADR-AGENT-0005`.

Versioning and evaluation are the same feature seen from two angles: versioning a prompt is only worthwhile if you can **measure** that v2 beats v1. Without a harness, versioning is just a changelog.

---

## Deferred with no date

| Topic | Trigger condition |
|---|---|
| Policy layer (permissions) | a consumer exposes a broad capability, shell-like |
| Container execution | same, and it is the **only** true security boundary |
| User approval before writing | when the IDE repo needs it; `step()` makes it cheap |
| Real tokenizer per model family | when calibration shows drift beyond margin |
| Tool rendering in prompt (models without native calls) | when a targeted model is declared with `supportsTools: false` |
| Web interface for reports | in the IDE repo, never in the package |
| CI replaying the test and typecheck gates on a PR | when the Actions minutes are worth paying for. Deliberately absent, not an oversight: the gates run locally and in the review cycle, and `publish.yml` was trimmed to build and publish for the same reason. Until then the suite is advisory, whoever pushes is what enforces it |
| Declared-model verification against the server (`ADR-AGENT-0017`) | when a deployment actually runs a local server. The showcase prototype calls hosted providers, where a declared model cannot be missing from a local install, so the gap does not arise. Until then the first call reports it, with the `ollama pull` command to run |
