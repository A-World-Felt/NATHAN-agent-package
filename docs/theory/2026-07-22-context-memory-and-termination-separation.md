# Context, memory, and termination: three concerns and the capability pattern

- **Type**: theory / reference, **non-decisional**
- **Date**: 2026-07-22
- **Author**: Arthur-Olivier Fortin
- **Status**: living reference. Pre-decisional reasoning that **feeds a future memory ADR (V3 horizon)** and complements [ADR-AGENT-0014](../decisions/ADR-AGENT-0014-configurable-termination-strategy.md) § *To watch*.
- **Related**: [ADR-AGENT-0003](../decisions/ADR-AGENT-0003-loop-termination-state-machine.md), [ADR-AGENT-0011](../decisions/ADR-AGENT-0011-budget-and-graceful-landing.md), [ADR-AGENT-0014](../decisions/ADR-AGENT-0014-configurable-termination-strategy.md); the `context/` framework (`sliding-window` V1, `memory` V3); [ADR-AGENT-0008](../decisions/ADR-AGENT-0008-token-counting-behind-a-port.md).

## Why this document exists

While deciding termination (ADR-AGENT-0014) we worked out a separation of concerns that reaches **beyond** termination: into how context and memory are structured. That reasoning is worth keeping so the future memory decision **inherits** it instead of re-deriving it. This document is **non-decisional**: it records the framing and the open questions. It does **not** decide the memory architecture: that is deliberately deferred to a V3 ADR (ADR-AGENT-0014 § *To watch*).

## The conflation to untangle

Today the `context/` framework hosts **two** providers behind one port, `IContextProvider`: `sliding-window` (V1) and `memory` (V3). But "**stay within the token window**" and "**remember across sessions**" are two different jobs. Putting both behind the same port is the root of the confusion that surfaced during the termination discussion.

## Three concerns

| Concern | Nature | Who drives it | Optional? |
|---|---|---|---|
| **Fit the window** (token budget) | plumbing, every turn | the engine, transparent | **no**: every agent needs it |
| **Long-term memory** (recall/store across turns & sessions) | **capability** | either (see the two faces below) | **yes** |
| **Termination** | stop condition | either (`implicit` / `explicit`) | - |

The first is not the agent's job and is never optional. The second is optional and *can* be the agent's job. The third is decided in ADR-AGENT-0014. Conflating the first two under one port is what made memory feel tangled with termination.

## Memory has two faces: non-exclusive

- **Transparent ("brain")**: memory *fills the window*: retrieval → context injected. In this face memory **is** an `IContextProvider`. The agent is unaware it exists.
- **Agentic**: memory is a **capability the agent drives** via tools (`remember` / `recall` / `search`), black-box, behind an `IMemory` port. The agent decides when to store or recall. Precedent: **MemGPT / Letta**.

These are **not rivals**. A serious system may have **both**: a sliding window to fit the token budget *and* memory tools for long-term recall, possibly over the same backend. The question is not "which one" but "which faces do we want, and where do they live."

## The shared shape: an opt-in capability

`explicit` termination and agentic memory have the **same shape**:

```
capability = { prompt fragment (teaches the model to use it)
             + tool(s) (finish / remember …)
             + implementation behind a port }
```

- **Upside**: one mechanism (register tool(s) + compose the scaffolding prompt) serves both. "Who owns the `finish` prompt fragment?" and "who owns the `remember` prompt fragment?" are the **same** question.
- **Trap**: do **not** build a generic "capability framework" now. `explicit` termination is instance **#1**; agentic memory would be instance **#2**. Extract the shared abstraction only when the **second instance actually lands** (rule of three): never before. Building it early is exactly the overhead the permanent "no overhead" constraint forbids (`.claude/CLAUDE.md`).

## What this implies for the current design (pointers, not decisions)

- **`sliding-window` stays a transparent `IContextProvider`**: plumbing, not the agent's job. Not in question.
- **Memory's home is the open question**: keep it as a transparent `IContextProvider` (retrieval-into-window), OR move it to an `IMemory` port surfaced as tools, OR both. → the V3 memory ADR.
- **Termination** (ADR-AGENT-0014): `implicit` default, `explicit` opt-in as an evaluation axis. `explicit` couples to the base prompt; the `IContextProvider` **contract is untouched**, but termination *and* the ADR-AGENT-0011 landing both **write into the message list**, so they must be coordinated in the loop.

## Open questions: to verify / decide later

A checklist for whoever writes the V3 memory ADR (and finishes the loop):

1. **Intent of "memory as `IContextProvider`"**: is the current `context/memory` provider meant as *transparent retrieval-into-window* (a legitimate `IContextProvider`), or is it *agentic memory* mislabeled? Verify against the V1 design spec and with the team before building.
2. **Memory model choice**: transparent vs agentic vs both. Decide **empirically** for NATHAN's use case, the same way termination is decided: make it a harness axis and compare rates, don't decide by opinion.
3. **`IMemory` port contract (if agentic)**: which operations? `remember` / `recall` / `search` / `forget`? Black-box tools, implementation-swappable behind the port (hexagonal, like every other port here).
4. **Who owns the scaffolding prompt fragment** (`finish`, `remember`): engine-owned canonical fragment vs author-supplied vs hybrid. Decide **once**, when the capability mechanism is built: it is the same decision for both capabilities.
5. **Capability mechanism**: extract a shared abstraction only when the 2nd instance (memory-as-tools) actually lands (rule of three). Until then, wire each capability minimally and inline.
6. **Termination × cost, to verify empirically**: `explicit` re-sends the `finish` tool schema every iteration + a permanent prompt fragment ⇒ a per-call token cost. It only wins if it saves **more wasted iterations than it costs**. Verify per model via the harness.
7. **Landing coordination**: the ADR-AGENT-0011 forced landing drops **all** tools (including `finish`, and any future `remember`). Verify the loop coordinates termination detection + budget landing + the active tool set coherently.
8. **`stopReason` granularity**: does `explicit` termination need a distinguishable `stopReason` for observability, or does `"completed"` suffice? Deferred (ADR-AGENT-0014).

## Verification status

This is **design reasoning**, not a set of provider facts, so it carries no external `stop_reason`-style claims to verify. The one external reference is MemGPT / Letta as the precedent for **agentic, tool-driven memory**; cite their current docs if the V3 ADR leans on them. `[À COMPLÉTER]`: exact MemGPT/Letta citations when the V3 ADR is written.
