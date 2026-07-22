# Agent-loop termination across providers (OpenAI, Anthropic)

- **Type**: theory / reference — **non-decisional**
- **Date**: 2026-07-22
- **Author**: Arthur-Olivier Fortin
- **Status**: living reference. The sources are external provider contracts and may drift; verify a specific field value before relying on it.
- **Feeds**: [ADR-AGENT-0014](../decisions/ADR-AGENT-0014-configurable-termination-strategy.md) — which decides what we *do* with this.

## Why this document exists

It establishes, from the providers' own contracts, **how an agent loop actually ends** — so our termination decisions rest on how OpenAI and Anthropic behave, not on framework folklore. It is deliberately non-decisional: the decision lives in ADR-AGENT-0014.

Anti-hallucination rule (`CLAUDE.md`): the Anthropic facts below are checked against the in-repo `claude-api` reference; the OpenAI facts against the public API reference and docs (sources at the end). Any value that could not be confirmed is marked `[À COMPLÉTER]` rather than invented.

## The one pattern both providers share

**Neither provider terminates via a special tool.** The loop ends when the model returns a normal answer **without requesting a tool**. Everything else — budgets, timeouts, loop detection — is the *orchestrator's* safety net, not the model's signal.

One iteration, both providers:

1. Send context (+ tool schemas) to the model.
2. The model returns either tool request(s) **or** a final answer.
3. If tool request(s): the orchestrator executes them, appends the results, and goes back to 1.
4. If no tool request: **done**.

## Anthropic — Messages API

Each response carries a `stop_reason`.

| `stop_reason` | Meaning | Loop effect |
|---|---|---|
| `tool_use` | The model requests one or more tools | **continue** |
| `end_turn` | Natural completion — a final answer with no tool request | **stop** ← the native termination |
| `max_tokens` | Hit the per-response output ceiling (`max_tokens`). Hard limit; the model is *not* aware of it | truncated |
| `stop_sequence` | Hit a caller-supplied stop string | stop |
| `pause_turn` | The **server-side tool loop** (web search, code execution, …) reached its internal iteration limit (documented default **10**), or a long-running server tool was paused. Resend the assistant turn to resume. **Not** a general agent-iteration budget. | resume |
| `refusal` | Safety decline. `stop_details.category` carries the class (`cyber`, `bio`, `reasoning_extraction`, `frontier_llm`, or `null`) | stop |
| `model_context_window_exceeded` | The context window was exhausted (distinct from `max_tokens`) | stop |

`stop_details` is populated **only** when `stop_reason == "refusal"`; it is `null` for every other value.

> **Correction to the source analysis.** An earlier internal analysis described `pause_turn` as "the iteration/resource limit for this run was reached." That is imprecise: `pause_turn` is specific to Anthropic's **server-side tools**, not to a general agent-iteration budget. The distinction matters for us — our budget/landing bound (ADR-AGENT-0011) is an orchestrator concern and has nothing to do with `pause_turn`.

### Two bounding mechanisms Anthropic keeps separate — and one maps to our ADR-0011

- **`max_tokens`** — a *hard* per-response ceiling the model is **not** aware of. Reaching it truncates output. This is a cutoff, not a landing.
- **`task_budget`** (beta) — a token ceiling the model **is** aware of, so, in Anthropic's words, "it paces itself and finishes gracefully instead of being cut off." Minimum `total` 20,000 tokens. Explicitly "distinct from `max_tokens`, which is an enforced per-response ceiling the model is not aware of."

`task_budget` is a **provider-native form of graceful landing** — the exact idea behind ADR-AGENT-0011 (a composite budget that triggers a landing rather than a hard cutoff). It is external corroboration that "budget the model can pace against" is a real, sound design and not our invention.

### SDK evidence

Anthropic's SDK "tool runner" automates the loop, and its documented behavior is that "iteration stops automatically when Claude has no more tool calls." That is native termination, mechanized — no `finish` tool involved.

## OpenAI — Responses API (and Chat Completions)

### Responses API

A response's `output` is an array of typed **items** — `message`, `reasoning`, `function_call`, `function_call_output`. Each item has a `status` of `in_progress`, `completed`, or `incomplete`. The Responses API is itself an agentic loop within a single request (it can drive web search, code interpreter, file search, remote MCP, and custom functions).

Termination rule: if the output contains `function_call` item(s), execute them and resend (`function_call_output` referenced by `call_id`); when the output resolves to a `message` with **no further `function_call`**, that message is the final answer. **Termination = absence of new function calls.**

### Chat Completions (older surface)

Each choice carries a `finish_reason`:

| `finish_reason` | Meaning | Loop effect |
|---|---|---|
| `tool_calls` | The model requests tools | **continue** |
| `stop` | Natural completion | **stop** ← the native termination |
| `length` | Hit the token cap | truncated |
| `content_filter` | Filtered | stop |

Same logic as Anthropic: `tool_calls` → continue, `stop` → done. The absence of a tool request is the signal.

## Side-by-side, mapped to our `stopReason`

| Concept | Anthropic | OpenAI (Responses / Chat) | nathan-agent-core |
|---|---|---|---|
| Wants a tool | `stop_reason: tool_use` | a `function_call` item / `finish_reason: tool_calls` | non-empty `toolCalls` → continue |
| Done, natural | `stop_reason: end_turn` | only a `message` / `finish_reason: stop` | empty `toolCalls` → `stopReason: "completed"` |
| Hard token cutoff | `max_tokens` | `length` | last-net bound (ADR-0011) |
| Model-aware budget → land | `task_budget` (beta) | `[À COMPLÉTER]` (no direct public analog found) | `stopReason: "budget"` (ADR-0011) |
| Went in circles | — (not provider-surfaced) | — (not provider-surfaced) | `stopReason: "stuck"` — orchestrator repetition detector (ADR-0011) |

## Why some frameworks add a `finish()` / `isDone` tool

LangGraph, CrewAI, AutoGen, and various in-house agents sometimes register an explicit `finish` / `return_answer` tool. **This is not required by OpenAI or Anthropic.** Its purpose is behavioral: some models keep calling tools when they already have enough information, and forcing an explicit "continue researching vs. declare done" choice can cut those useless loops.

It is therefore a **framework convention / optimization** — and a **model-dependent** one — not the official termination mechanism. Whether it helps depends on the specific model; that is precisely why it belongs behind a measurable switch rather than baked in (see ADR-AGENT-0014).

## UI states ("Thinking", "Searching", "Running", "Done")

The status labels shown in ChatGPT, Claude Desktop, or Claude Code are **UI states derived from what the orchestrator is doing**. They inform the user; they do not drive the loop and are not part of the termination decision.

## The orchestrator is the real controller

In both architectures the model only *proposes the next action*. The orchestrator decides whether to continue, and owns the safety mechanisms:

- maximum iterations (a last net, not the primary mechanism),
- token budget,
- wall-clock timeout,
- tool-error handling (a failing tool returns a result to the model, it does not crash the loop),
- loop / repetition detection.

## What this implies for `nathan-agent-core` (pointer, not decision)

- **Native termination** (empty `toolCalls` ⇒ done) is the providers' own mechanism → it is our default. Confirms **ADR-AGENT-0003**.
- **Budget → graceful landing** rather than a hard cutoff has a provider-native analog in Anthropic's `task_budget`. Confirms **ADR-AGENT-0011**.
- An **explicit `finish` tool** is a legitimate but **model-dependent** optimization, not a default — hence a configurable, empirically-decided strategy. Decided in **ADR-AGENT-0014**.

## Verification status

- Anthropic `stop_reason` values, `pause_turn` semantics (server-side tool loop, default 10 iterations), and `task_budget` (model-aware, min 20,000): **verified** against the in-repo `claude-api` reference (2026-07-22).
- OpenAI Responses API item types and `status`, and Chat Completions `finish_reason` values: **verified** against the public API reference and docs (2026-07-22).
- `[À COMPLÉTER]`: OpenAI's server-side tool-loop iteration cap (Anthropic documents a default of 10; no equivalent figure confirmed for OpenAI here).

## Sources

**Anthropic** (in-repo `claude-api` reference, and):
- Handling stop reasons — https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons
- Tool use overview — https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview

**OpenAI**:
- Responses API reference (create) — https://developers.openai.com/api/reference/resources/responses/methods/create
- Function calling guide — https://developers.openai.com/api/docs/guides/function-calling
- Migrate to the Responses API — https://platform.openai.com/docs/guides/migrate-to-responses
