# ADR-AGENT-0014: Termination strategy as a configurable, empirically-decided axis

- **Status**: ✅ Accepted
- **Date**: 2026-07-22
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`
- **Complements**: [ADR-AGENT-0003](ADR-AGENT-0003-loop-termination-state-machine.md) and [ADR-AGENT-0011](ADR-AGENT-0011-budget-and-graceful-landing.md). The **nominal path stays unchanged**: native termination (empty `toolCalls` ⇒ `"completed"`) and budget → graceful landing. This ADR adds one thing: the termination *mechanism* becomes an opt-in, measured strategy.
- **Theory**: [Agent-loop termination across providers](../theory/2026-07-22-agent-loop-termination-across-providers.md): the provider evidence this decision rests on.

## Context

`ADR-AGENT-0003` chose **native termination** (an empty `LLMResponse.toolCalls` means done) and rejected an explicit `isDone` tool. It rejected in particular **Option C** ("both, with `isDone` optional") as "two termination paths to test and maintain, for no gain." `ADR-AGENT-0011` kept native termination and additionally rejected a model-declared `status` field ("`isDone` under another name").

An external analysis of how OpenAI and Anthropic actually end an agent loop (see the theory document) **confirms** both ADRs: native termination (the absence of a tool call) is the providers' own mechanism (Anthropic `end_turn`, OpenAI absence of `function_call`). The same analysis names the explicit `finish()` tool for what it is: a **framework convention and optimization**, not a provider requirement, and a **model-dependent** one, whose usefulness varies by model.

That last point reopened a question the team raised: **termination behavior likely depends on the model.** A given local model may terminate more reliably natively; another may over-call tools and never return an empty `toolCalls`, needing an explicit exit. Being able to *test* which works per model is a real win, but if native is best in general, a second path is pure overhead. `ADR-AGENT-0003` weighed exactly this trade-off and, at the time, ruled against the second path.

## The reframe: the harness decides, not opinion

The tension "worth testing" vs. "overhead" only exists if we decide by **opinion**. We do not have to. The package already ships the mechanism that decides by **measurement**:

- The harness (`ADR-AGENT-0006`) thinks in **rates over a matrix of models**.
- `ADR-AGENT-0011` already frames "does this model conclude on its own, or always hit the budget?" as a **free evaluation metric**.

So termination becomes **an axis of that matrix**. The default stays native, which means **zero production overhead** until a specific model *earns* the switch, measured. The two fears ("test it" and "no overhead") stop being opposed: the default gives us the second, the axis gives us the first.

There is an honest cost to name: the explicit strategy re-sends the `finish` tool schema on **every** iteration plus a permanent prompt fragment, so it costs tokens per call. It only wins if it saves **more wasted iterations than it costs in tokens**, which is exactly the kind of thing the harness measures. The harness is the arbiter, not this ADR.

## Options evaluated

**A: Documentation only.** Record the provider validation, change nothing. Rejected: it cannot test the model-dependence that motivates the whole question.

**B: A configurable, typed strategy, default native.** A closed union on the agent definition; the non-default value registers a `finish` tool. This reopens `ADR-AGENT-0003` Option C, with a new argument.

**C: A pluggable `ITerminationPolicy` port.** The most general. Rejected: the axis has exactly **two** values; a port with multiple implementations is the generic-framework overhead that the permanent "no overhead" constraint has already ruled out elsewhere (the permissions framework, the runtime registry).

## Decision

**Option B.** Termination is a **typed, opt-in strategy whose primary purpose is to be an evaluation axis.**

- **`TerminationStrategy = "implicit" | "explicit"`.** Naming (see theory doc for the semantic axis "inferred vs declared"):
  - `implicit`: the end is **inferred** from the absence of a tool call. This *is* the `ADR-AGENT-0003` mechanism, provider-native. It is the default.
  - `explicit`: the end is **declared** by the model calling a `finish` tool.
- **Default `implicit`.** The nominal path of `ADR-AGENT-0003` / `ADR-AGENT-0011` is untouched.
- **`explicit` is additive, not a replacement.** Native detection (empty `toolCalls` ⇒ `"completed"`) **stays active** as a safety net; the `finish` tool merely gives an over-calling model an explicit exit. A model that forgets to call `finish` still terminates. This is the robust reading: no model can get stuck for lack of having learned the convention.
- **The harness treats the strategy as a matrix axis** (`ADR-AGENT-0006`, `run-matrix`): `model × termination`, aggregated into rates.

### Reopening `ADR-AGENT-0003` Option C: the new argument

`ADR-AGENT-0003` rejected "both, with `isDone` optional" as "two paths for no gain." That conclusion is correct **when the second path is speculative**. It does not hold when the second path is a **measured variable** whose value the harness decides per model. This ADR overturns **only** that sub-conclusion of `ADR-AGENT-0003`; its main decision (native termination as the default) is reaffirmed, not replaced.

### Illustrative shape (non-binding)

```ts
export type TerminationStrategy = "implicit" | "explicit"; // default "implicit"
```

The **exact API surface** (a standalone field on `AgentDefinition`, versus folding it into a future "capability" mechanism) is **deferred** (see *To watch*). No agent-loop code exists yet (branch `feat/DEV-194-llm-port`); this ADR fixes the **policy**, not the wiring.

### `stopReason`

`explicit` termination still resolves to `stopReason: "completed"`. The **outcome** is identical; only the **how** differs (a `finish` call vs. an empty `toolCalls`). No new `stopReason` value is introduced. Whether to distinguish the two for observability is deferred to when the loop is built.

## Consequences

**Positive**

- **Production default = zero overhead.** The strategy earns its place only where the matrix shows a model wins with it.
- **A new, model-agnostic evaluation dimension** the harness surfaces, on top of the "concludes on its own?" metric already noted in `ADR-AGENT-0011`.
- The "is native generally best?" question is answered with **data instead of assertion**, which was the team's actual goal.

**Negative**

- `explicit` mode **couples to the base prompt**: the system prompt must instruct the model to call `finish`, or an over-calling model never stops. This is the one genuinely shared foundation with future work: see *To watch*.
- `explicit` **costs tokens per call** (the `finish` schema is re-sent every iteration; the prompt fragment is permanent).
- **Two termination detections** to keep coherent with the `ADR-AGENT-0011` landing, which drops **all** tools (including `finish`) on the forced last call.

**To watch (deferred, settled jointly with the memory decision, not now)**

- **The prompt-fragment injection mechanism.** `explicit` is the **first** instance of an "opt-in capability" = `{prompt fragment + tool(s) + implementation}`. Agentic memory (memory-as-tools) would be a **second** instance of the same shape. We deliberately do **not** build a generic "capability" framework now (that is the overhead the permanent constraint forbids) and will extract the pattern only when the second instance actually lands (rule of three). Until then, `explicit` is wired minimally.
- **Who owns the `finish` prompt fragment** (engine-owned canonical fragment vs. agent author): decided when the mechanism above is built.
- **The context/memory boundary** (memory as a transparent `IContextProvider` vs. an agent-facing `IMemory` port surfaced as tools) is a **separate, larger decision at the V3 horizon** and gets its own ADR. It is deliberately *not* coupled to this one, so a mature decision (termination) is not blocked on an immature one (memory).

**What does not change**

Native / `implicit` termination as the default (`ADR-AGENT-0003`), and budget → graceful landing (`ADR-AGENT-0011`). The configurable strategy is an evaluation and opt-in mechanism layered on top, never the nominal path.
