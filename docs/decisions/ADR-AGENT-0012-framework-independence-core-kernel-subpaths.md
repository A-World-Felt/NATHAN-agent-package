# ADR-AGENT-0012: Framework independence — neutral `core` kernel and per-framework subpaths

- **Status**: ✅ Accepted, complements 0001 and 0002
- **Date**: 2026-07-22
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`

## Context

The package's promise is that its layers are interchangeable and, in a foreseeable future, **separately publishable** (`nathan-llm`, then an agentic package that depends on it). Two things quietly break that promise.

**1. `llm` and `tools` reference each other.** The model must be *told* which functions it can call — their parameters — so `llm` needs the parameter schema. A tool *declares* its parameters with the same schema, so `tools` needs it too. And `ToolResult` sat in `llm/models` while it is produced by `tools`. The result is an `llm ↔ tools` cycle: `llm` stops being a clean leaf, and neither layer can be extracted alone.

**2. A single `.` barrel drags the whole engine.** In ESM, importing *any* symbol from a barrel that does `export * from "./llm"; export * from "./agent"; …` links and **evaluates the entire reachable graph** — there is no lazy per-export loading. Tree-shaking that would prune the unused part is a *bundler* optimization, best-effort; this package ships **unbundled** (bare `tsc`). So importing one llm symbol from `.` also evaluates `agent`. You cannot take `llm` without `agent`.

The stated intent, in the team's words: *"tools does not know llm, and llm does not know tools; the agent links the two."* And, longer term: *"I could publish an llm package and an agentic package that already imports it."*

## Options considered

**For the coupling:**

- **A — `tools → llm`.** `llm` owns the shared vocabulary, `tools` imports it. Simplest, fewest modules. But `tools` then *knows* `llm`, which the team explicitly rejects.
- **B — each side owns its schema types, the agent translates.** Maximal decoupling, no shared module. But ~30 lines of JSON-Schema types are duplicated across `llm` and `tools` and will drift. The permanent "no overhead" constraint disfavors it.
- **C — a neutral `core` module** holds the one genuinely shared thing (the parameter schema); both depend on it, neither on the other.

**For the import boundary:** keep everything under `.`, or add a `./llm` subpath.

## Decision

**Option C for the coupling, and a `./llm` subpath — both serving one goal: each framework can become its own package.**

### The neutral `core` kernel

`core/models` holds the **sole irreducible shared vocabulary**: the parameter schema (`ToolSchema` + the JSON-Schema types). `llm → core`, `tools → core`, **no `llm ↔ tools` edge**.

Each framework owns what it **produces**:

| Type | Owner | Why |
|---|---|---|
| `ToolSchema`, JSON-Schema types | **core** | the one thing both need |
| `ToolDefinition = { name; description; parameters: ToolSchema }` | **llm** | the function contract *presented to the model* |
| `ToolCall` | **llm** | the model *requests* it |
| `Message`, `Usage`, `LLMResponse`, `LLMChunk`, `LLMError` | **llm** | the conversation protocol |
| `ToolResult` | **tools** | the tool *produces* it |

The **agent is the composition root**. It maps `ITool → ToolDefinition` to call `complete`, and dispatches `ToolCall → execute → ToolResult → Message`. `tools` and `llm` never import each other; the agent, which legitimately depends on both, does the wiring at runtime.

### The `./llm` subpath

`.` is the **top of the dependency stack**: it pulls the whole engine — correct, because an agent legitimately depends on every layer. `./llm` is the **bottom**: the llm layer alone, `agent` never in its graph.

Rule: **each foundational layer with standalone value gets its own subpath** — `./llm` now; `./context`, `./metrics` later *only if a real need appears* (YAGNI). No `./core` subpath yet: core is types-only and surfaces through the `.` and `./llm` barrels.

### Why both, together

Each is a **rehearsal of a future package boundary**: `./llm` → `nathan-llm`, `core` → a `nathan-core` base, `.` → the agentic package. The day the split happens, extraction is a *move + rename*, not a rewrite — because the dependency arrows already point the right way.

## Consequences

**Positive**

- `llm` is a clean leaf: extractable, and importable via `./llm` without loading the agent.
- `tools` and `llm` evolve independently; the agent is the only place that knows both.
- The future multi-package split is mechanical, not a refactor.

**Negative**

- One more module (`core`) and one more `exports` branch (`./llm`). But `core` is **types-only** (no runtime, near-zero overhead), and `./llm`'s barrel and its contract test exist anyway — making it public costs one `exports` line plus the discipline of treating llm's barrel as **frozen public API** (which is exactly a future package's discipline, taken early).
- A new subpath is a public-API change, and the barrel-contract tests must cover it (as ADR-0002 already notes).

**Boundaries this sets**

- Adding subpaths is **additive / non-breaking**. Making `.` lean later would be **breaking**, so `.` stays the full-engine convenience barrel.
- This complements ADR-0002: it adds a fourth `exports` branch for a reason 0002 did not consider — layering and extractability, not `fs` or production-safety. Those original reasons still hold for `./tools` and `./testing`.
