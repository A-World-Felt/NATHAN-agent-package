# ADR-AGENT-0003: Termination by absence of tool call, suspendable state machine

- **Status**: ✅ Accepted
- **Date**: 2026-07-21
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`
- **Complemented by**: [ADR-AGENT-0011](ADR-AGENT-0011-budget-and-graceful-landing.md): bounding is no longer a hard cutoff on `maxIterations` but a composite budget that triggers a **graceful landing**. `stopReason` becomes `"completed" | "budget" | "stuck" | "error"`. The termination decision below (absence of tool call) is unchanged.

## Context

The original class diagram describes `AgenticLLM` with a private method `is_done(AgenticLLMResponse)`, accompanied by this annotation:

> *"Look to remove isDone. When the agent is finished, it calls the tool isDone. Every tools put the agent in waiting status. IsDone does the same except it's the user response that wakes him up."*

The annotation contains two distinct ideas that must be separated: **how the agent signals it is finished**, and **the fact that every tool call suspends the agent**.

## Options considered

**A: Keep `isDone` as an explicit tool.**
The model calls `isDone` to signal the end. A free failure mode: if it forgets to call it, the loop runs until `maxIterations`. It also uses up a slot in the tool list presented to the model.

**B: Native termination: the absence of a tool call is the signal.**
All tool-call protocols work this way: the model returns content with no `toolCalls`, and it is done. Nothing to teach the model.

**C: Both, with `isDone` optional.**
Two termination paths to test and maintain, for no gain.

## Decision

**Option B for termination, and the suspension idea is kept as a primitive.**

`isDone` is removed. An empty `LLMResponse.toolCalls` ⇒ `stopReason: "completed"`.

The "I need the user" case, which the annotation distinguished, is handled by the package's general rule (`ADR-AGENT-0002`): **it is a consumer tool**. A repo that wants to separate "done" from "I have a question" registers its own `ask_user`. The core itself stops when there is no more tool call.

Suspension becomes the primitive, and the loop is sugar on top:

```ts
step(state: AgentState): Promise<AgentState>        // suspends on a tool call
makeRunAgent(deps)(input): Promise<AgentResult>     // wraps step() until it stops
```

The result says why it stopped:

```ts
export type AgentResult = {
  content: string;
  toolCalls: ToolCall[];
  stopReason: "completed" | "max_iterations" | "error";
  iterations: number;
};
```

## Consequences

**Positive**

- One fewer failure mode: no more "the model forgot to call `isDone`".
- One fewer slot in the tool list presented to the model.
- **The harness controls tool execution instead of being subjected to it**: it is `step()` that makes the simulator possible (`ADR-AGENT-0006`).
- User approval before a risky operation becomes genuinely implementable later: the suspension plumbing already exists. This is exactly what Meastro lacks, whose `RequiresApproval` level asks for nothing and merely returns an error to the model.
- `stopReason` gives the harness a clean assertion criterion ("did the agent stop in the right place").

**Negative**

- A consumer that wants to distinguish "finished" from "waiting for the user" must write its own tool. This is intentional, but it is not free for them.
- The `step()` primitive widens the public API: two entry levels to document instead of one.

**To watch**

A model that does not support native tool calls would signal its end differently. `ILLMProvider.supportsTools()` exists to detect this case; the associated handling is not in V1.
