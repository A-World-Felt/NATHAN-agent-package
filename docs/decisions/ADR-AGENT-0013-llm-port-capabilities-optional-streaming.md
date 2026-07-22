# ADR-AGENT-0013: The LLM port — required capabilities, optional streaming

- **Status**: ✅ Accepted
- **Date**: 2026-07-22
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`

## Context

PR2 freezes `ILLMProvider`, the port **implemented by the consumer's own providers**. A published interface is a contract: **adding a required method later breaks every implementer, consumers included.** So the method surface must be right *now*, while there are only two implementations to migrate (Ollama and the fake).

Two questions had to be settled: how capabilities (tools, streaming) are exposed, and whether streaming belongs in V1 at all. The design draft (`docs/specs/…`) carried both `complete` **and** `stream` plus an undefined `LLMChunk`, which contradicted the roadmap's "V1 without streaming."

## Options considered

**Exposing a capability (does this model stream? call tools?):**

- **Free helper functions.** Callers may simply forget to use them; a stored "supports streaming" boolean can drift from whether `stream` actually works.
- **Optional method + derived check.** No drift, but nothing forces the implementer to *declare* the capability.
- **Required capability methods.** TypeScript forces every implementer to write them — impossible to forget, at compile time.

**Streaming in V1:**

- **`stream` required on the port.** Forces every implementer to write dead streaming code in V1.
- **Deferred entirely.** Optional ⇒ additive ⇒ non-breaking to add in V4.
- **Optional `stream?`, but implemented for real in PR2** — because Ollama streams natively (NDJSON), so there is a real implementation *and* a real test, and `LLMChunk` can be defined from the endpoint instead of guessed.

## Decision

```ts
export interface ILLMProvider {
  readonly model: string;                    // join key for rates (ADR-0007)
  supportsTools(): boolean;                  // required
  supportsStreaming(): boolean;              // required
  complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;
  stream?(messages: Message[], tools?: ToolDefinition[]): AsyncIterable<LLMChunk>;  // optional capability
}
```

**Capabilities are required methods.** A provider that does not stream writes `supportsStreaming() { return false }` — one explicit line, *"unsupported unless proven."* This is stronger than a helper (which can be forgotten) or a wrapper (which can be left unwired): the type system enforces the declaration. Capabilities are **per-instance = per-model** (each provider instance carries one `model`). How a provider *computes* the boolean — a constructor flag, or querying the backend's capabilities — is an adapter detail hidden behind the method.

**Streaming ships in PR2, at the provider level.** `OllamaLLMProvider` implements `stream` (parses NDJSON; the `usage` counters arrive in the terminal `done` chunk) and returns `supportsStreaming() → true`. The fake returns `false` and omits `stream`, supplying the "unsupported" branch for tests without a network.

This does **not** contradict "V1 without streaming": that rule is about the **loop**, which keeps calling `complete()` — it needs the *complete* list of tool calls to dispatch, which a partial stream cannot give. We complete the **provider**, not the loop. The two levels are independent.

**`LLMChunk` is defined from the real endpoint** (verified before coding — anti-hallucination rule no. 2), and only its low-level shape: a text delta plus terminal usage. Streaming *tool calls* into an agentic loop is a V4 concern; `LLMChunk` may gain fields then, additively.

**`LLMErrorCode` gains `STREAMING_UNSUPPORTED`.** Calling `stream` on a provider that does not support it must yield a *controlled* error; the centralized guard lands with its first generic caller (V4). In V1, TypeScript already blocks calling an optional `stream?` without narrowing.

**No per-call `config`.** The only per-call variation is `tools` (present or absent, for the graceful landing of ADR-0011). Per-call options (temperature, …) would be an optional parameter added later, non-breaking. The provider constructor carries `model` plus fixed options.

`LLMResponse.usage` is filled by the Ollama adapter **now** (ADR-0007), in both `complete` (single response) and `stream` (terminal chunk).

## Consequences

**Positive**

- Capability declaration is unforgettable: enforced by the compiler, not by discipline.
- Streaming is validated against a real endpoint, not guessed; `LLMChunk` is honest.
- The loop stays on `complete`; a second provider only has to implement the port.

**Negative**

- Every non-streaming provider writes one explicit `supportsStreaming()` line.
- The provider's `stream` has no product consumer until V4 — but it is real and tested from PR2, and it made `LLMChunk` definable from reality.

**Relations**

- Builds on ADR-0007 (`usage` filled now), ADR-0003 (empty `toolCalls` is the stop signal), ADR-0011 (calling `complete` without tools to force a landing).
- Type placement (`ToolDefinition`, `ToolSchema`, `ToolCall`) follows ADR-0012.
