# Claude Code Guidelines for nathan-agent-core

`@a-world-felt/nathan-agent-core`: NATHAN's agentic LLM layer.

The package provides **three things**: the engine (LLM providers, tools, loop, memory), the agent definitions (prompt + tools), and an agent test harness. The consumer repo chooses its provider and brings its own tools.

Project context: NATHAN Console v2.0, an AI voice-assisted accessible programming environment (ADR-0006, Flux E). Full context: `PMC/CONTEXT-AGENT.md`.

## Where to find the why

| Document | Content |
|---|---|
| `docs/decisions/` | **the ADRs**: context, options evaluated, decision, consequences. Read before challenging a choice. |
| `docs/theory/` | **reference material** the ADRs rest on: provider/API research, non-decisional. Versioned. Each doc names its verification status and cites its sources. |
| `docs/specs/2026-07-14-agent-core-design.md` | the V1 design: contracts, loop, harness, deviations from the diagram. **Not versioned** (`.gitignore`): a local working document. What must survive lives in the ADRs. |
| `docs/plans/` | implementation plans. **Not versioned** (`.gitignore`), local working documents like the spec; what must survive lives in the ADRs. The V1 split into 6 PRs and the per-ticket plans live here. |
| `ROADMAP.md` | the four versions and what is deferred without a date |
| `CONTRIBUTING.md` | branches, commits, PRs, and the ticket → code traceability thread |
| `docs/schema/Architecture-agent-core.drawio` | **5 pages, read in order**: agent view → substitution → one iteration → harness → full architecture. See `docs/schema/README.md`. |

**A permanent constraint, stated by the team: no overhead, it must stay maintainable.** This is the criterion that ruled out the generic permissions framework, the embedded tokenizer, and the runtime registry.

## Communication Style

- Respond **in French**.
- Direct and concise: no filler, no hedging.
- No final summary: the diff speaks for itself.
- No em-dashes (`—`): not in written deliverables (README, docs, code comments) nor in replies. Use `:`, `,`, `(...)`, or a period. Em-dashes read as machine-generated.

## What this package is not

- **Not a wrapper around an existing SDK.** The engine is written here.
- **Not an extraction of another repo's `src/llm/`.** An in-house Next.js application's contract is `generate(prompt, context, config) → { content }`: no tool calls, no streaming, and its `UsageContext` is coupled to its tiered billing.

### On the neighboring repos

Two private repos were consulted early on and are **neither references nor authorities**. The team does not know them, and neither one is the consumer of this package.

- **An in-house Next.js application**: private, never published, with no agentic loop and no tool calls. It exposes no public API, so it can say nothing about API design.
- **An in-house C# backend**: analyzed for its **counter-examples** of tool execution (`ADR-AGENT-0004`).

What is retained from them amounts to two dated observations, cited as evidence and not as conventions: that application's `feature: string` field that drifted in production, and that backend's permission pitfalls.

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
    interfaces/llm-provider.ts
    services/response-parser.ts   pure
    providers/
      ollama/ollama-llm-provider.ts    OllamaLLMProvider, a CLASS (real I/O)
      index.ts                    PROVIDERS: Record<ProviderID, () => LLMProvider>
    testing/                      shipped test tooling (→ ./testing, never ./llm)
      fake-llm-provider.ts          scripted provider, 2nd implementation of the port
      provider-contract.ts          checkProviderContract, runner-agnostic conformance
      index.ts
    index.ts

  context/                      # peer framework, 2 strategies, 1 contract
    interfaces/context-strategy.ts
    interfaces/token-counter.ts
    strategies/
      sliding-window/             V1: SlidingWindowStrategy and its pure helpers
      memory/                     V3, plugs in here without touching the agent
    infrastructure/heuristic-token-counter.ts
    index.ts

  tools/
    models/index.ts               ToolCall, ToolResult, ToolSchema
    interfaces/tool.ts
    application/use-cases/dispatch-tool.ts    chains record → [authorize] → execute
    infrastructure/               read-file.ts, write-file.ts, list-files.ts → ./tools branch
    index.ts

  metrics/                      # peer framework
    models/index.ts               UsageRecord, MetricsTotal, RateTable
    interfaces/metrics-collector.ts
    services/aggregate.ts         pure
    infrastructure/collector.ts
    index.ts

  agent/                        # the app
    models/agent-definition.ts
    services/define-agent.ts      pure
    services/step.ts              pure, one iteration of the loop
    application/
      dtos/index.ts               AgentDeps, AgentInput, AgentResult, AgentState
      use-cases/agentic-llm.ts    AgenticLLM, a CLASS (public API)
      use-cases/voice-agentic-llm.ts   VoiceAgenticLLM (V4)
    testing/                      the agent test harness (→ ./testing); names TBD
      fake-app.ts                   shared-state simulator (≠ mock)
      define-scenario.ts
      run-scenario.ts
      run-matrix.ts
      index.ts
    index.ts

  testing/                      # ./testing branch: aggregates each framework's testing/
    index.ts                      re-exports llm/testing (+ agent/testing when it lands)
```

`llm/infrastructure/with-metrics.ts`: a decorator that implements `LLMProvider` and relays to a `MetricsCollector`. It lives where it wraps.

`context/` is a **framework in its own right**, not a subfolder of `agent/`: many implementations serve one contract, so they are nested one folder each. Sliding window and memory differ by **algorithm**, hence `strategies/` and the port `ContextStrategy` (`ADR-AGENT-0016`).

`testing/` is **not** a top-level framework. Shipped test tooling co-locates under each framework's own `testing/` subfolder (`llm/testing/`, later `agent/testing/`) because it is that framework's functionality, not a cross-cutting concern. The top-level `testing/index.ts` only **aggregates** them behind the one `./testing` subpath. A framework's production barrel never exports its `testing/`, so the tooling reaches consumers through `./testing` only, never through `.` or `./llm`.

### Internal layers per framework

Each framework follows the same pattern:

```
<framework>/
  models/            entities, types, enums: no runtime dependency, no SDK import
  interfaces/        ports: kebab-case.ts, contracts only
  services/          PURE functions: NEVER imports interfaces/
  application/
    dtos/            Deps, Input, Result, Options
    use-cases/       orchestration ONLY
  providers/<vendor>/  concrete adapters per supplier
  strategies/<name>/   concrete implementations that differ by algorithm
  infrastructure/    other concrete adapters (real I/O)
  testing/           shipped test tooling for this framework (→ ./testing, never the prod barrel)
```

### Placement rule (per-file decision tree)

1. Type/interface describing data → `models/`
2. Interface describing a port → `interfaces/`
3. Pure function (no disk, no HTTP, no SDK) → `services/`
4. Function that takes a port and orchestrates → `application/use-cases/`
5. Class implementing a port → `providers/<vendor>/` when the implementations differ by **supplier** (`llm/providers/ollama/`), `strategies/<name>/` when they differ by **algorithm** (`context/strategies/sliding-window/`), `infrastructure/` for the remaining concrete adapters with real I/O (`ADR-AGENT-0016`). **The port carries the same word as the folder**: `LLMProvider` for `llm/`, `ContextStrategy` for `context/`.
6. Shipped test tooling for a framework (fake, harness, conformance check) → `<framework>/testing/`, reached only via the `./testing` barrel

### Classes vs functions: the rule that matters

| Nature | Form | Examples |
|---|---|---|
| **Public API** with state and several operations | **class** | `AgenticLLM`, `VoiceAgenticLLM` |
| Adapter implementing a port via I/O | class | `OllamaLLMProvider`, `SlidingWindowStrategy`, the tools |
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

The failure mode to avoid, observed in production in an in-house Next.js application:

```ts
feature: string;  // 'generation' | 'replace' | 'chat' | 'coverage-check' | etc.
```

The real union lives in the comment. Result: the list drifted within a few months, `coverage-check` does not exist in production as a `feature`.

> **If a key is a string, it must be typed.** Correct form: `PROVIDERS: Record<ProviderID, () => LLMProvider>`: a closed, typed union, driven by an environment variable.

## Code conventions

- TypeScript strict: no `any` without a justifying comment.
- Files in `kebab-case.ts`, named after their main export (`ollama-llm-provider.ts` holds `OllamaLLMProvider`).
- **No `I` prefix on interfaces** (TS-native, not C#): a port is a plain noun (`LLMProvider` in `llm-provider.ts`), and implementations carry descriptive names (`OllamaLLMProvider`, `FakeLLMProvider`). The structural type system makes the `I` marker unnecessary.
  - **The rule holds in the documentation and the diagrams too.** A name written in a doc must be findable in the code: an `I`-prefixed name in an ADR sends a reader grepping for a symbol that does not exist, and they conclude the doc has drifted. On the diagrams the marker is already there: a port box carries the UML stereotype `<< interface >>` above its name, so the `I` would only duplicate it.
  - External code quoted as evidence keeps the convention of its own language.
- A barrel `index.ts` per layer; consumers import from the barrel, never from an individual file.
- **Barrel contract tests** (`barrel-contract.test.ts`): they lock the public API. Valuable for a package: an export removed by mistake breaks a test, not a consumer.
- **Readability is a primary criterion, not an afterthought.** This is an open-source package maintained by contributors of varying levels. A good engineer takes a complex task and makes it simple: they do not compress it into one clever line. Prefer a named function or an intermediate variable over a dense expression, and the clear standard-library form over the terse idiom (`Object.hasOwn(m, k)` over `Object.prototype.hasOwnProperty.call(m, k)`; a named `makeOllama` factory over an inline arrow in the record). No sophisticated generics for a one-off case. When clarity and brevity conflict, clarity wins.
- **Name intermediate results, do not inline calls.** Bind a call's result to a well-named `const` before passing it on: `const result = await fn(); checks.push(toContractCheck(name, result));` rather than `checks.push(toContractCheck(name, await fn()))`. It costs nothing at runtime and shows the reader what the call returns at the point of use, instead of sending them back to the signature.
- Comment non-obvious logic (prompts, transformations).
- For an optional collection, prefer an explicit early return over folding the guard into the expression: `if (xs === undefined) return [];` then map, rather than `(xs ?? []).map(...)`. Easier to read and to maintain.
- **No PR references in code comments** (nor in a plan's code blocks): a PR number is a transient label that rots once merged. Describe what the code does, not which PR added it.
- **CI files are written in English**, prompts and comments included (`.github/workflows/`). They run on a shared surface and their output lands on GitHub, where the rest of the repository is already English. Replies in this chat stay French; the deliverables do not.

## Packaging conventions

Taken from an in-house package already published to the same registry, the only precedent available. The in-house Next.js application mentioned earlier cannot serve here: it is `private: true` and is never published.

| Decision | Value |
|---|---|
| Scope + registry | `@a-world-felt/…` on `npm.pkg.github.com`, `access: restricted` |
| Format | pure ESM: `"type": "module"`, `module: NodeNext` |
| Build | bare `tsc` via `tsconfig.build.json` → `dist/`. **No bundler.** |
| Publication | `files: ["dist"]`, `prepare: npm run build` |
| Tests | `node:test`: zero dependencies |
| Config | `.env.example`; `dotenv` as a **devDependency only** |

**Three deviations from that package**, accepted:

1. Its `exports` map has only one branch. Three are needed here (see above).
2. That package does `import 'dotenv/config'` at the top of its config file. For a **published library**, that is an import-time side effect: reading a `.env` in the consumer's current directory and injecting into its `process.env` is not a library's job. **The application loads its `.env`, the library reads `process.env`.**
3. That package stayed on vitest 1.x. Here `node:test` is enough and removes the dependency.

> ESM + `NodeNext` pitfall: relative imports carry the **emitted** file's extension, so `.js` even from a `.ts`: `import type { Message } from "./models/index.js"`. Precedent: that same in-house package does this in its own source.

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
