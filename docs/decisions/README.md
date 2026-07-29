# Architecture decisions: nathan-agent-core

Registry of the package's design decisions. Format imposed by project governance (`ADR-0007`, `NATHAN-console/docs/decisions/`): status, date, deciders, context, options considered, decision, consequences.

**An ADR is immutable once accepted.** To revisit a decision, write a new ADR and mark the old one "Replaced by ADR-AGENT-XXXX".

## Numbering

The `ADR-AGENT-` prefix is deliberate. The project-level ADRs (`ADR-0001` to `ADR-0007`) live in `NATHAN-console/docs/decisions/` and are referenced throughout `PMC/CONTEXT-AGENT.md`; a local, unprefixed series would collide with them.

Scope of this series: the `@a-world-felt/nathan-agent-core` package only.

## Registry

| # | Decision | Status | Date |
|---|---|---|---|
| [ADR-AGENT-0001](ADR-AGENT-0001-hexagonal-architecture-use-cases-functions.md) | Hexagonal architecture | ✅ Accepted, complemented by 0009 and 0012, placement rule 5 refined by 0016 | 2026-07-21 |
| [ADR-AGENT-0002](ADR-AGENT-0002-three-entry-points-opt-in-tools.md) | Three entry points, opt-in tools | ✅ Accepted, complemented by 0012 | 2026-07-21 |
| [ADR-AGENT-0003](ADR-AGENT-0003-loop-termination-state-machine.md) | Termination by absence of tool call, suspendable state machine | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0004](ADR-AGENT-0004-isolation-execution-policy.md) | Isolation: policy and execution, two composable axes | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0005](ADR-AGENT-0005-typescript-agents-git-versioning.md) | Agents declared in TypeScript, versioning via git | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0006](ADR-AGENT-0006-runner-agnostic-simulator-harness.md) | Harness: stateful simulator, runner-agnostic | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0007](ADR-AGENT-0007-metrics-decorator-instance-scope.md) | Metrics via decorator, per-instance scope | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0008](ADR-AGENT-0008-token-counting-behind-a-port.md) | Token counting behind a port | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0009](ADR-AGENT-0009-classes-for-public-api.md) | Classes for the public API, pure functions inside | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0010](ADR-AGENT-0010-no-substitution-table.md) | No tool substitution table | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0011](ADR-AGENT-0011-budget-and-graceful-landing.md) | Budget and graceful landing rather than a hard cutoff | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0012](ADR-AGENT-0012-framework-independence-core-kernel-subpaths.md) | Framework independence: neutral `core` kernel, per-framework subpaths | ✅ Accepted | 2026-07-22 |
| [ADR-AGENT-0013](ADR-AGENT-0013-llm-port-capabilities-optional-streaming.md) | The LLM port: required capabilities, optional streaming | ✅ Accepted | 2026-07-22 |
| [ADR-AGENT-0014](ADR-AGENT-0014-configurable-termination-strategy.md) | Termination strategy as a configurable, empirically-decided axis | ✅ Accepted, complements 0003 and 0011 | 2026-07-22 |
| [ADR-AGENT-0015](ADR-AGENT-0015-shipped-provider-contract-test.md) | The package ships a provider contract test | ✅ Accepted | 2026-07-24 |
| [ADR-AGENT-0016](ADR-AGENT-0016-context-strategies-behind-one-port.md) | Context strategies are implementations of one port | ✅ Accepted | 2026-07-27 |

## Upcoming decisions

| Topic | When |
|---|---|
| V2 provider (tool-call quality / cost per token / latency) | before the 2nd provider's PR |
| Real `TokenCounter` implementation (model family) | when the heuristic shows its limits |
| Memory boundary: transparent `ContextStrategy` vs agentic memory tools | V3. Constraints it must respect: [ADR-AGENT-0016](ADR-AGENT-0016-context-strategies-behind-one-port.md) (the three-member port, composition behind it, the store's own subpath). Framing: docs/theory/2026-07-22-context-memory-and-termination-separation.md |
| Execution in a container | not before a consumer exposes a shell |
| User approval before writing | when the IDE repo needs it |

## Sources

**The authoritative source is the team's architecture diagram**: `docs/schema/DiagrammeClasseAI.drawio`, and its up-to-date version `DiagrammeClasse-agent-core.drawio`. Its class names and its four bands are the reference vocabulary.

The real consumer is **NATHAN's accessible IDE**, built in `PMC/`. It is the one that will decide in practice.

The neighboring repos are **neither references nor authorities**: the team does not know them, and none is the package's consumer. They served as analysis material, cited as dated evidence:

| Source | What was drawn from it | What it cannot settle |
|---|---|---|
| an in-house Next.js application | the `feature: string` field that drifted in production → "a string key must be typed" | API design: it exposes none (`ADR-AGENT-0009`) |
| an in-house C# backend | tool-execution and permission counter-examples (`ADR-AGENT-0004`) | nothing else: "does too much" is the reason to redo it |
| an in-house package already published to the same registry | packaging conventions (scope, registry, ESM, `tsc` build) | internal structure: it is flat, with no variants to absorb |
