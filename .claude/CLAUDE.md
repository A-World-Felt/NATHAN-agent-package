# Claude Code Guidelines for nathan-agent-core

`@a-world-felt/nathan-agent-core`: NATHAN's agentic LLM layer.

The package provides **three things**: the engine (LLM providers, tools, loop, memory), the agent definitions (prompt + tools), and an agent test harness. The consumer repo chooses its provider and brings its own tools.

Project context: NATHAN Console v2.0, an AI voice-assisted accessible programming environment (ADR-0006, Flux E). Full context: `PMC/CONTEXT-AGENT.md`.

## Where to find the why

| Document | Content |
|---|---|
| `docs/decisions/` | **the ADRs**: context, options evaluated, decision, consequences. Read before challenging a choice. |
| `docs/specs/2026-07-14-agent-core-design.md` | the V1 design: contracts, loop, harness, deviations from the diagram. **Not versioned** (`.gitignore`): a local working document. What must survive lives in the ADRs. |
| `docs/plans/2026-07-21-v1-decoupage-pr.md` | the split into 6 PRs, with the verification criterion for each |
| `ROADMAP.md` | the four versions and what is deferred without a date |
| `CONTRIBUTING.md` | branches, commits, PRs, and the ticket → code traceability thread |
| `docs/schema/Architecture-agent-core.drawio` | **5 pages, read in order**: agent view → substitution → one iteration → harness → full architecture. See `docs/schema/README.md`. |

**A permanent constraint, stated by the team: no overhead, it must stay maintainable.** This is the criterion that ruled out the generic permissions framework, the embedded tokenizer, and the runtime registry.

## Communication Style

- Respond **in French**.
- Direct and concise: no filler, no hedging.
- No final summary: the diff speaks for itself.

## What this package is not

- **Not a wrapper around an existing SDK.** The engine is written here.
- **Not an extraction of another repo's `src/llm/`.** Marcel's contract (`C:\Marcel`) is `generate(prompt, context, config) → { content }`: no tool calls, no streaming, and its `UsageContext` is coupled to its tiered billing.

### On the neighboring repos

`C:\Marcel` and `C:\Meastro` are **neither references nor authorities**. The team does not know them, and neither one is the consumer of this package.

- **Marcel**: a private Next.js app, never published, with no agentic loop and no tool calls. It exposes no public API, so it can say nothing about API design.
- **Meastro**: a C# backend, analyzed for its **counter-examples** of tool execution (`ADR-AGENT-0004`).

What is retained from them amounts to two dated observations, cited as evidence and not as conventions: Marcel's `feature: string` field that drifted in production, and Meastro's permission pitfalls.

**The real consumer is NATHAN's accessible IDE, built in `PMC/`.** It is the one that arbitrates.

## Architecture

Hexagonal: ports and adapters, strict separation.

**This is not a style preference: the domain imposes it.** Almost everything the package exposes exists in several interchangeable implementations behind a stable contract: six ports, around fifteen implementations. A package whose promise is "the consumer repo chooses its provider and brings its tools" cannot be structured any other way without betraying that promise.

The team's architecture diagram already was: its four bands (`Application`, `Interface`, `Local Implementation`, `External Implementation`) are exactly this separation. Full justification: `ADR-AGENT-0001`.

### Three public entry points

| Subpath | Content | Constraint |
|---|---|---|
| `.` | engine, ports, `defineAgent` | **no disk access**: must stay importable everywhere |
| `./tools` | generic tools provided | opt-in, coupled to `fs` |
| `./testing` | test harness | must never ship to production |

Tools are **opt-in**. An agent receives exactly the tools it is passed, nothing implicit. If the file tools were in the main barrel, importing the package would drag `fs` along with it.

### Directory tree

```
src/
  llm/                          # peer framework, provider-agnostic
    models/index.ts               Message, LLMResponse, ToolCall, ToolResult, LLMError
    interfaces/ILLMProvider.ts
    services/response-parser.ts   pure
    providers/
      ollama/ollama-adapter.ts    OllamaLLMProvider, a CLASS (real I/O)
      index.ts                    PROVIDERS: Record<ProviderID, () => ILLMProvider>
    index.ts

  context/                      # peer framework, 2 providers, 1 contract
    interfaces/IContextProvider.ts
    interfaces/ITokenCounter.ts
    providers/
      sliding-window/             V1
      memory/                     V3, plugs in here without touching the agent
    infrastructure/heuristic-token-counter.ts
    index.ts

  tools/
    models/index.ts               ToolCall, ToolResult, ToolSchema
    interfaces/ITool.ts
    application/use-cases/dispatch-tool.ts    chains record → [authorize] → execute
    infrastructure/               read-file.ts, write-file.ts, list-files.ts → ./tools branch
    index.ts

  metrics/                      # peer framework
    models/index.ts               UsageRecord, MetricsTotal, RateTable
    interfaces/IMetricsCollector.ts
    services/aggregate.ts         pure
    infrastructure/collector.ts
    index.ts

  agent/                        # the app
    models/AgentDefinition.ts
    services/define-agent.ts      pure
    services/step.ts              pure, one iteration of the loop
    application/
      dtos/index.ts               AgentDeps, AgentInput, AgentResult, AgentState
      use-cases/agentic-llm.ts    AgenticLLM, a CLASS (public API)
      use-cases/voice-agentic-llm.ts   VoiceAgenticLLM (V4)
    index.ts

  testing/                      # ./testing branch
    fake-llm-provider.ts          delivered as of PR2, 2nd implementation of the port
    fake-app.ts                   shared-state simulator (≠ mock)
    define-scenario.ts
    run-scenario.ts
    run-matrix.ts
    index.ts
```

`llm/infrastructure/with-metrics.ts`: a decorator that implements `ILLMProvider` and relays to an `IMetricsCollector`. It lives where it wraps.

`context/` is a **framework in its own right**, not a subfolder of `agent/`: Marcel's rule, "MANY providers serve ONE contract → nested per-vendor". Sliding window and memory are two providers of the same port.

### Internal layers per framework

Each framework follows the same pattern:

```
<framework>/
  models/            entities, types, enums: no runtime dependency, no SDK import
  interfaces/        ports: I*.ts, contracts only
  services/          PURE functions: NEVER imports interfaces/
  application/
    dtos/            Deps, Input, Result, Options
    use-cases/       orchestration ONLY
  providers/<vendor>/  concrete adapters per provider
  infrastructure/    other concrete adapters (real I/O)
```

### Placement rule (per-file decision tree)

1. Type/interface describing data → `models/`
2. Interface describing a port (`I<X>`) → `interfaces/`
3. Pure function (no disk, no HTTP, no SDK) → `services/`
4. Function that takes a port and orchestrates → `application/use-cases/`
5. Class implementing a port via real I/O → `providers/<vendor>/` or `infrastructure/`

### Classes vs functions: the rule that matters

| Nature | Form | Examples |
|---|---|---|
| **Public API** with state and several operations | **class** | `AgenticLLM`, `VoiceAgenticLLM` |
| Adapter implementing a port via I/O | class | `OllamaLLMProvider`, `SlidingWindowContext`, the tools |
| Pure function for orchestration or computation | function | `step`, `dispatchTool`, `defineAgent`, aggregation |

```ts
// public API: what the consumer repo manipulates
const agent = new AgenticLLM({ llm, context, tools, maxIterations: 10 });
const result = await agent.run("amène-moi aux réglages");
```

`AgenticLLM.run()` wraps a **pure function** `step(state, deps)`: testable in isolation, without instantiating the class. The class is the API, the functions are the mechanics.

> A published package has a constraint an application does not: **a discoverable API surface**. `agent.` triggers autocompletion; a function returned by a factory exposes nothing. Justification: `ADR-AGENT-0009`.

### No runtime registry

`defineAgent()` is a pure function that returns a typed object. Agents are exported `const`s, imported statically. **No lookup by name, no untyped `string` key.**

The failure mode to avoid, observed in production in `C:\Marcel` (`src/llm/models/index.ts:62`):

```ts
feature: string;  // 'generation' | 'replace' | 'chat' | 'coverage-check' | etc.
```

The real union lives in the comment. Result: the list drifted within a few months, `coverage-check` does not exist in production as a `feature`.

> **If a key is a string, it must be typed.** Correct form: `PROVIDERS: Record<ProviderID, () => ILLMProvider>`: a closed, typed union, driven by an environment variable.

## Code conventions

- TypeScript strict: no `any` without a justifying comment.
- Files in `kebab-case.ts`; ports in `IPascalCase.ts`.
- A barrel `index.ts` per layer; consumers import from the barrel, never from an individual file.
- **Barrel contract tests** (`barrel-contract.test.ts`): they lock the public API. Valuable for a package: an export removed by mistake breaks a test, not a consumer.
- Simple, readable code: no sophisticated generics for a one-off case.
- Comment non-obvious logic (prompts, transformations).

## Packaging conventions

Taken from `NATHAN-jira-package` (`@a-world-felt/nathan-jira-core`), the only in-house precedent. Marcel cannot serve here: it is `private: true` and is never published.

| Decision | Value |
|---|---|
| Scope + registry | `@a-world-felt/…` on `npm.pkg.github.com`, `access: restricted` |
| Format | pure ESM: `"type": "module"`, `module: NodeNext` |
| Build | bare `tsc` via `tsconfig.build.json` → `dist/`. **No bundler.** |
| Publication | `files: ["dist"]`, `prepare: npm run build` |
| Tests | `node:test`: zero dependencies |
| Config | `.env.example`; `dotenv` as a **devDependency only** |

**Three deviations from jira**, accepted:

1. Its `exports` map has only one branch. Three are needed here (see above).
2. Jira does `import 'dotenv/config'` at the top of `src/config.ts`. For a **published library**, that is an import-time side effect: reading a `.env` in the consumer's current directory and injecting into its `process.env` is not a library's job. **The application loads its `.env`, the library reads `process.env`.**
3. Jira stayed on vitest 1.x. Here `node:test` is enough and removes the dependency.

> ESM + `NodeNext` pitfall: relative imports carry the **emitted** file's extension, so `.js` even from a `.ts`: `import type { Message } from "./models/index.js"`. Precedent: `NATHAN-jira-package/src/config.ts:2`.

## Testing conventions

Two distinct suites. Mixing them produces an unstable suite.

| | Scripted fake LLM + fake tools | **Real** LLM + fake tools |
|---|---|---|
| What is tested | **our loop**: dispatch, `maxIterations`, termination | **the model**: does it know how to pick the right tool |
| Nature | deterministic, instant, free | non-deterministic, network, paid |
| Tool | `node:test`: on every commit | **in-house driver**, manual, never blocking |

The right-hand column is an **evaluation**, not a unit test: it thinks not in pass/fail but in **rates**, over a **matrix**, and produces a **report**. A test runner models that poorly, hence a driver of our own, which is just a loop and a table.

The harness is **runner-agnostic**: it returns a result, the consumer asserts with whatever it wants. Coupling it to a runner would make it a peer dependency imposed on consumer repos.

The package **ships the fake provider and the simulator**. Without that, each consumer rewrites them, badly.

**Simulator ≠ mock.** A mock returns a frozen value; a simulator is a set of tools sharing a coherent mutable state: `navigate("réglages")` then `getCurrentPage()` must return `"réglages"`. Three rules: `env` is a **factory** (fresh state per run), expectations are **predicates** (no strict order), the report **keeps failures**.

**A single run measures nothing.** N repetitions per combination, aggregated into rates: otherwise a single success does not distinguish a 95% model from a 60% model.

## Branch and commit conventions

**Single source: `CONTRIBUTING.md`.** Summary:

```
branch : type/JIRAID-short-name        feat/DEV-194-package-initialisation
commit : type(scope): description (JIRAID)
         feat(llm): add OllamaLLMProvider (DEV-194)
PR     : same form as the commit
```

Types: `feat` `fix` `refactor` `docs` `test` `chore` `build`
Scopes: `llm` `context` `tools` `agent` `metrics` `testing` `schema` `docs` `ci`

Rules taken from `.claude/commands/commit.md`: separate, logical commits, never `git add -A`, never `amend`, no `Co-Authored-By`, **no emoji**.

## Safety rules

- **NEVER** hard-code an API key: environment variables only.
- **NEVER** commit a `.env`.
- A tool that fails **does not bring down the loop**: it returns a `ToolResult` carrying the error, which goes back to the model. An exception that crosses the loop makes the agent fragile.
- Provider errors, on the other hand, propagate up: `LLMError` with a code.

## Anti-hallucination rules

1. Never say "the tests pass" without having run them and shown the output.
2. Never guess an API response: test against the real endpoint or simulate explicitly.
3. If a name, a number, or a date is missing, write `[À COMPLÉTER]` rather than inventing.
