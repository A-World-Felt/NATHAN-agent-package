# Architecture decisions: nathan-agent-core

Registry of the package's design decisions. Format imposed by project governance (`ADR-0007`, `NATHAN-console/docs/decisions/`): status, date, deciders, context, options considered, decision, consequences.

**An ADR is immutable once accepted.** To revisit a decision, write a new ADR and mark the old one "Replaced by ADR-AGENT-XXXX".

## Numbering

The `ADR-AGENT-` prefix is deliberate. The project-level ADRs (`ADR-0001` to `ADR-0007`) live in `NATHAN-console/docs/decisions/` and are referenced throughout `PMC/CONTEXT-AGENT.md`; a local, unprefixed series would collide with them.

Scope of this series: the `@a-world-felt/nathan-agent-core` package only.

## Registry

| # | Decision | Status | Date |
|---|---|---|---|
| [ADR-AGENT-0001](ADR-AGENT-0001-hexagonal-architecture-use-cases-functions.md) | Hexagonal architecture | ✅ Accepted, complemented by 0009 | 2026-07-21 |
| [ADR-AGENT-0002](ADR-AGENT-0002-three-entry-points-opt-in-tools.md) | Three entry points, opt-in tools | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0003](ADR-AGENT-0003-loop-termination-state-machine.md) | Termination by absence of tool call, suspendable state machine | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0004](ADR-AGENT-0004-isolation-execution-policy.md) | Isolation: policy and execution, two composable axes | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0005](ADR-AGENT-0005-typescript-agents-git-versioning.md) | Agents declared in TypeScript, versioning via git | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0006](ADR-AGENT-0006-runner-agnostic-simulator-harness.md) | Harness: stateful simulator, runner-agnostic | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0007](ADR-AGENT-0007-metrics-decorator-instance-scope.md) | Metrics via decorator, per-instance scope | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0008](ADR-AGENT-0008-token-counting-behind-a-port.md) | Token counting behind a port | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0009](ADR-AGENT-0009-classes-for-public-api.md) | Classes for the public API, pure functions inside | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0010](ADR-AGENT-0010-no-substitution-table.md) | No tool substitution table | ✅ Accepted | 2026-07-21 |
| [ADR-AGENT-0011](ADR-AGENT-0011-budget-and-graceful-landing.md) | Budget and graceful landing rather than a hard cutoff | ✅ Accepted | 2026-07-21 |

## Upcoming decisions

| Topic | When |
|---|---|
| V2 provider (tool-call quality / cost per token / latency) | before the 2nd provider's PR |
| Real `ITokenCounter` implementation (model family) | when the heuristic shows its limits |
| Execution in a container | not before a consumer exposes a shell |
| User approval before writing | when the IDE repo needs it |

## Sources

**The authoritative source is the team's architecture diagram**: `docs/schema/DiagrammeClasseAI.drawio`, and its up-to-date version `DiagrammeClasse-agent-core.drawio`. Its class names and its four bands are the reference vocabulary.

The real consumer is **NATHAN's accessible IDE**, built in `PMC/`. It is the one that will decide in practice.

The neighboring repos are **neither references nor authorities**: the team does not know them, and none is the package's consumer. They served as analysis material, cited as dated evidence:

| Repo | What was drawn from it | What it cannot settle |
|---|---|---|
| `C:\Marcel` | the `feature: string` field that drifted in production → "a string key must be typed" | API design: it exposes none (`ADR-AGENT-0009`) |
| `C:\Meastro` | tool-execution and permission counter-examples (`ADR-AGENT-0004`) | nothing else: "does too much" is the reason to redo it |
| `NATHAN-jira-package` | packaging conventions (scope, registry, ESM, `tsc` build) | internal structure: it is flat, with no variants to absorb |
