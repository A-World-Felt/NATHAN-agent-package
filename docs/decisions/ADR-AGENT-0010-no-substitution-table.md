# ADR-AGENT-0010: No tool substitution table

- **Status**: ✅ Accepted
- **Date**: 2026-07-21
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`

## Context

The harness must be able to present the agent with simulated tools instead of the real ones, **without the agent being able to tell the difference** (`ADR-AGENT-0006`).

Question raised: *"there would be either an abstraction before `ToolDispatcher`, or after, since the power of our architecture is that the agent does not know the tools' implementation."*

The intuition came from Meastro, which has exactly this mechanism: `_toolMapping` (`ToolDispatcherBlockExecutor.cs:62-73`), a table that redirects tool identifiers to capture blocks. The dispatcher substitutes transparently and keeps the original identifier for assertions.

## Why Meastro needs it, and we do not

**At Meastro, a tool is a manifest on disk resolved by identifier at runtime** (`*.tool.block.json`, discovered by `IBlockDiscoveryService`, resolved via `registry.Get(blockType)`). There is no way to inject another implementation: the dispatcher fetches the tool by its name. The only way to substitute is therefore **a redirection table in the middle**.

**For us, `ITool` is an interface and tools are passed as objects.** Substitution is already possible, and it happens at construction:

```ts
new AgenticLLM({ tools: [navigate, click] })   // production
new AgenticLLM({ tools: app.tools })            // simulator
```

**The abstraction is the interface itself.** There is nothing to add before or after the `ToolDispatcher`.

## Options evaluated

**A: Substitution table in the `ToolDispatcher`.**
Modeled on Meastro. Redirects `name → replacement implementation` at runtime.

**B: A second `ToolDispatcher` dedicated to the harness.**
Two dispatch paths to maintain, which will diverge. And the harness would no longer test the real dispatcher.

**C: Nothing. Substitution happens at construction.**

## Decision

**Option C.**

No table, no redirection, no lookup by name. The harness builds an `AgenticLLM` with the simulator's tools, exactly as production builds it with its own.

## Consequences

**Positive**

- **Zero code.** The capability sought is a side effect of dependency injection, not a feature to write.
- **The harness tests the real dispatcher**, not a test variant. A single code path between development and production.
- **No added attack surface.** This is trap no. 6 noted at Meastro: `_toolMapping` there is a plain session variable, propagated across sessions (`BlockRefHandler.cs:191`). If an agent can write session variables, it can rewire its own tools. A runtime redirection table reimplements dependency injection, less safely.
- Consistent with `ADR-AGENT-0005`: no lookup by name, no untyped `string` key.

**Negative**

- The consumer must **wire its tools explicitly** at each construction. That is the price of no magic, and it is the same philosophy as "tools are opt-in" (`ADR-AGENT-0002`).
- We lose the ability to substitute a tool *mid-run*. No need identified; the day one comes up, it will take an ADR that supersedes this one.

**What stays true of the original idea**

The goal (*the agent does not know which implementation hides behind a tool*) is fully achieved. It is the `ITool` contract that guarantees it, not a redirection mechanism. See page 2 of the `docs/schema/Architecture-agent-core.drawio` diagram, which makes it its visual demonstration.
