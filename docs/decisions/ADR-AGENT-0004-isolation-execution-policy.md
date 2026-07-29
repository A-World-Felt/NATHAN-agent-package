# ADR-AGENT-0004: Isolation: policy and execution, two composable axes

- **Status**: ✅ Accepted
- **Date**: 2026-07-21
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`

## Context

The initial intent was to reuse Meastro's model (`C:\Meastro`), understood as: *"this tool instance is either an isolated container, or the isolation is created by logic that checks permissions and performs the isolation by checking commands."*

**Analysis of Meastro's code contradicts this reading.** Both building blocks exist, but they are not connected:

- `IContainerRuntime` is real: `DockerContainerRuntime` launches the `docker` binary. But its only consumers are a REST controller and a project-environment lifecycle service. **No block executor, no point on the tool-dispatch path touches it.**
- The real shell tool (`ShellBlockExecutor.cs:105`) does a `Process.Start` of `cmd.exe /c` or `/bin/bash -c` **on the host**, with no container and no jail.
- The word "container" in the code (`ContainerSession`, `ContainerIsolationE2ETests`) denotes **a permission scope** in a session tree, not an OS container.
- `WorkspaceIsolation` (Docker networks, CPU/RAM limits) is serialized and stored: **nothing enforces it**.

There is only **one** tool-isolation mechanism in Meastro: the permission gate. And that gate **validates no argument**: once `shell-execute` is authorized, the model passes any command string it likes.

> Authorizing a tool ≠ constraining it. Coarse tool-level permissions, on a `bash` tool, are approximately zero permissions.

The "isolation by command checking" model therefore exists nowhere. It would have to be invented, not copied.

## The underlying reasoning

"Container" and "permissions" are not two modes of the same thing. They are **two independent dimensions**:

| Axis | Question | Answers |
|---|---|---|
| **Policy** | is the call authorized? | allow all · allowlist · ask |
| **Execution** | where does the code run? | in-process · subprocess · container · simulator |

Treating them as two sibling implementations of a single interface makes it impossible to **combine** them, which is exactly what we want. A container with no policy lets the agent destroy everything inside, mounted volumes included. A policy with no container is enough in many cases.

Meastro demonstrates the cost of the confusion by negative example: a vocabulary that lies about what the code does.

## Options considered

**A: Two sibling implementations of a `ToolExecutor`.**
The initial reading of Meastro. Prevents composition; reproduces the vocabulary ambiguity.

**B: A decorator chain for policy, an exclusive choice for execution.**
`dispatch = record(authorize(execute))`. Policy and observation are composable stages; only execution is a choice.

**C: Nothing at all in V1: constraints borne by the tool.**
A `WriteFile` built with a root directory that refuses to leave it. Ten lines, no framework.

## Decision

**Option B as the target shape, option C for V1.**

V1 builds **no permission layer**. Constraints are borne by the tools themselves. Rationale: an explicit team constraint: "no overhead, it must stay maintainable", and "Meastro does too much, that's why we're redoing it".

When a policy becomes necessary, it will take the form of a decorator in the chain, never a sibling implementation of execution.

**Mandated vocabulary**: one word per concept. `scope` for permissions. `sandbox` only if something actually confines a process.

## Security warning: to keep in the public documentation

**Command checking is not a security boundary.** Inspecting arguments protects against the *accident*: an agent that gets a path wrong. Not against the *adversary*: with an LLM in the loop, the input is potentially adversarial. A prompt injection via a read file can produce calls designed to bypass validation: path traversal, symbolic links, encoding.

**Only a container is a security boundary.** If the "policy" mode is ever shipped, the documentation must state explicitly that it is an ergonomic guardrail, otherwise someone will deploy it believing they are protected.

## Consequences

**Positive**

- No overhead in V1.
- The target shape composes instead of alternating: we will be able to have policy **and** container.
- Observability (`record`) plugs into the same chain: one concept for two needs.
- The same pattern as the metrics decorator on the LLM side (`ADR-AGENT-0007`): a single idea on both seams of the system.

**Negative**

- We will have to resist the temptation to add a generic permissions framework before a consumer requires it.
- Tool-borne constraints repeat from one tool to the next. Acceptable as long as they are few.

## What is retained from Meastro nonetheless

1. **Present the model only the authorized tools** (`ToolSchemaGenerator.cs:56`). A denied tool is never announced: a whole class of failures disappears.
2. **Transparent tool substitution** for mocks (`_toolMapping`), checked **after** the policy and therefore unusable for escaping. See `ADR-AGENT-0006`.
3. **Permissions that can only narrow** as one descends a chain.
4. **Cost that bubbles up the tree of nested calls.** See `ADR-AGENT-0007`.

## Pitfalls found in Meastro, not to be reproduced

- **Untyped policy in a shared bag** (`context.Variables["_permissions_allowedBlocks"]`, with a cast). If the value passes through JSON serialization, the cast fails and the entire deny layer is skipped **with no error**. In TypeScript it would be worse. Policy is passed as an explicit typed object.
- **Two enforcement points with opposite semantics**: the tool gate fails closed, `FileAccessChecker` fails open. A single point, and a malformed policy must be a fatal error at startup.
- **Normalization before checking**: `bash` is rewritten to `shell-execute` *before* permissions are consulted, so a `Deny("bash")` rule never matches, silently.
- **`RequiresApproval` that asks for nothing** and returns an error to the model. See `ADR-AGENT-0003`: on our side, `step()` will make it genuinely implementable.
