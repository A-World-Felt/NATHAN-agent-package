# Architecture convention (nathan-agent-core)

> Contributor version of the architecture rules. The detailed *why* is in the ADRs
> (`docs/decisions/`), notably `ADR-AGENT-0001` (hexagonal), `ADR-AGENT-0002` (entry
> points), `ADR-AGENT-0009` (classes vs functions), `ADR-AGENT-0005` (no registry).
> `.claude/CLAUDE.md` gives the agent-oriented version. When in doubt, the ADR is authoritative.

## Hexagonal: ports and adapters

Strict separation between contracts and implementations. **This is not a style preference: the domain imposes it.** Almost everything the package exposes exists in several interchangeable implementations behind a stable contract: six ports, about fifteen implementations. A package whose promise is "the consumer repo chooses its provider and brings its tools" cannot be structured otherwise.

The **4 bands** of the team diagram are exactly this separation:

| Band | Correspondence in `src/` |
|---|---|
| Application | `agent/` |
| Interface | all the `interfaces/` (`I*.ts`) |
| Local Implementation | the shipped `providers/` and `infrastructure/` |
| External Implementation | written by the **consumer repo**, not here |

## The 3 entry points

| Subpath | Content | Constraint |
|---|---|---|
| `.` | engine, ports, `defineAgent` | **no disk access**, importable everywhere |
| `./tools` | generic tools provided | opt-in, coupled to `fs` |
| `./testing` | test harness | must **never** ship to production |

Tools are **opt-in**: an agent receives exactly the tools it is passed, nothing implicit. If the file tools were in the main barrel, importing the package would drag `fs` along behind it. Nothing in `./testing` must be reachable from `.` or `./tools`.

## Internal layers per framework

Each framework (`llm`, `context`, `tools`, `metrics`, `voice`, `agent`) follows the **same pattern** (learn one component, you know them all):

```
<framework>/
  models/            entities, types, enums: no runtime dependency, no SDK import
  interfaces/        ports I*.ts (contracts only)
  services/          PURE functions, NEVER import interfaces/
  application/
    dtos/            Deps, Input, Result, Options
    use-cases/       orchestration ONLY
  providers/<vendor>/  concrete adapters per supplier
  strategies/<name>/   concrete implementations that differ by algorithm
  infrastructure/    other concrete adapters (real I/O)
```

`providers/` or `strategies/`? Look at what varies between two implementations. If it is the **supplier**, it is `providers/<vendor>/`: `llm/providers/ollama/`. If it is the **algorithm**, it is `strategies/<name>/`: `context/strategies/sliding-window/`. A strategy that later talks to an external service keeps that service behind its own port, adapted in `infrastructure/` or `providers/<vendor>/`, so the two axes never mix (`ADR-AGENT-0016`).

`context/` is a **full-fledged framework**, not a subfolder of `agent/`: sliding window and memory are two strategies of one same context port.

## Placement rule (per-file decision tree)

1. Type/interface describing **data** → `models/`
2. Interface describing a **port** (`I<X>`) → `interfaces/`
3. **Pure** function (no disk, no HTTP, no SDK) → `services/`
4. Function that takes a port and **orchestrates** → `application/use-cases/`
5. Class implementing a port → `providers/<vendor>/` (differ by **supplier**), `strategies/<name>/` (differ by **algorithm**), or `infrastructure/` for the other concrete adapters with **real I/O**

Invariants that a review treats as real problems:

- `models/`: types only, no SDK import, no runtime dependency.
- `services/`: pure functions, **must never import `interfaces/`**.
- the `.` barrel must **never** import `fs`/`path` or anything disk-related.

## Classes vs functions

| Nature | Form | Examples |
|---|---|---|
| **Public API** with state and several operations | **class** | `AgenticLLM`, `VoiceAgenticLLM` |
| Adapter implementing a port via I/O | class | `OllamaLLMProvider`, `SlidingWindowContext`, the tools |
| Pure orchestration or computation function | function | `step`, `dispatchTool`, `defineAgent`, aggregation |

The public API is a **class** (it offers the `agent.` autocompletion that a factory does not expose, `ADR-AGENT-0009`); its mechanics are a **pure function** testable without instantiating the class. `AgenticLLM.run()` wraps `step(state, deps)`.

## No runtime registry

`defineAgent()` is a pure function that returns a typed object. Agents are exported `const`s, imported **statically**. No lookup by name, no untyped `string` key.

> **If a key is a string, it must be typed.** The failure mode to avoid (observed in production elsewhere): a real union that lives only in a comment (`feature: string; // 'a' | 'b' | …`) drifts within a few months. Correct form: `PROVIDERS: Record<ProviderID, () => ILLMProvider>`, closed, typed union. See `ADR-AGENT-0005`.
