# ADR-AGENT-0001: Hexagonal architecture

- **Status**: ✅ Accepted
- **Date**: 2026-07-21
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`
- **Complemented by**: [ADR-AGENT-0009](ADR-AGENT-0009-classes-for-public-api.md): classes for the public API, pure functions inside.

> **Revision note (2026-07-21).** The rationale for this ADR was rewritten the same day it was written, before any commit and before any line of code. The initial version justified the decision as "reusing Marcel's convention", a citation that was both inaccurate and pointless: the team does not know Marcel, it is not the package's consumer, and the decision follows from the domain. The **decision is unchanged**; only its rationale is corrected.

## Context

The package must be structured before any code is written.

**The domain dictates the architecture.** Almost everything the package exposes exists in several interchangeable implementations behind a stable contract:

| Contract | Planned implementations |
|---|---|
| `ILLMProvider` | Ollama, Gemini, Azure, external, fake (tests), metrics decorator |
| `IContextProvider` | sliding window (V1), self-fed memory (V3) |
| `ITool` | ReadFile, WriteFile, ListFiles, **plus all the consumer's own** |
| `IVoiceProvider` | Gemini, Azure, external (V4) |
| `ITokenCounter` | heuristic (V1), real tokenizer (later) |
| `IMetricsCollector` | in-memory collector |

This is not a style preference: **it is the very definition of ports and adapters.** A package whose promise is "the consumer repo chooses its provider and brings its own tools" cannot be structured any other way without betraying that promise.

**The team's architecture diagram is already hexagonal.** Its four bands (`Application`, `Interface`, `Local Implementation`, `External Implementation (to be implemented)`) are exactly the ports/adapters separation, with the external band reserved for consumer repos. The decision therefore predates this ADR: this one records it and draws the placement consequences from it.

## Options considered

**A: Flat, `src/*.ts`.**
In-house precedent: `NATHAN-jira-package`. Suited to an HTTP client with no variants. Here, six contracts and some fifteen implementations would end up mixed in a single folder, and the port/adapter boundary (the heart of the package's promise) would become invisible.

**B: Hexagonal, internal layers per domain.**
Makes the boundary explicit in the file tree. Cost: sparsely populated folders at the start.

**C: Intermediate: one folder per domain, flat files inside.**
Less ceremony. But the port / adapter / pure-function distinction can no longer be read in the paths, only in the file names.

## Decision

**Option B.**

```
<domaine>/
  models/            entities, types, enums: no runtime dependency, no SDK import
  interfaces/        ports: I*.ts: contracts only
  services/          PURE functions: NEVER import interfaces/
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

### `context/` is a domain in its own right

Not a subfolder of `agent/`. Sliding window and memory are **two providers of the same port**: V3 drops in next to V1 without touching `AgenticLLM`. That is the port's whole reason for being; burying it under `agent/` would hide it.

### Provider topology

When **several providers serve a single contract**, they are nested per provider: `<domaine>/providers/<vendor>/`. This is the case for all ports here. The coexistence of several active providers is an explicit need: the multi-model harness depends on it (`ADR-AGENT-0006`).

## Consequences

**Positive**

- The package's promise ("choose your provider, bring your tools") is legible in the file tree.
- Adding a provider means adding a folder. No existing file is touched.
- The pure functions (`services/`) are testable without any setup.
- The file tree matches the architecture diagram, so code and documentation do not diverge.

**Negative**

- **Sparsely populated folders at the start**: `llm/interfaces/` contains only one file in V1. That is the price of a legible boundary, and it is accepted.
- More files to open to follow a call end to end.
- A contributor new to the package must read the placement rule before adding a file. Hence its presence in `CLAUDE.md`.

## On external references

`C:\Marcel` and `C:\Meastro` are **examples of the same pattern**, useful for seeing what it looks like in practice and for spotting its pitfalls. They are not the origin of this decision, and they have authority over nothing:

- Marcel is a private Next.js application, never published, with no agentic loop and no tool calls, and **it is not this package's consumer**. It exposes no public API, so it can say nothing about API design (see `ADR-AGENT-0009`, where this confusion was corrected).
- Meastro is a C# backend whose tool-execution model was analyzed for its **counter-examples** (`ADR-AGENT-0004`).

The real consumer is **NATHAN's accessible IDE**, built in `PMC/`. It, and it alone, will decide whether this structure holds up in practice.

What remains retained from Marcel is a **dated observation**, not a convention: the `feature: string` field in `src/llm/models/index.ts:62`, whose real union lived in a comment and drifted within a few months in production code. Hence the rule: *if a key is a string, it must be typed.*
