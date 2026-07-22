# ADR-AGENT-0008: Token counting behind a port

- **Status**: ✅ Accepted
- **Date**: 2026-07-21
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`

## Context

`IContextProvider` exposes `maxTokens`. The sliding window must therefore decide what fits, and to do that, it must know what a history weighs.

Initial position, adopted then revised: "count messages, not tokens, to avoid a dependency on a tokenizer". The team's objection is fair:

> **"8 messages" does not mean the same thing for an 8k model and a 128k model.**

Yet the package exists precisely to **compare models** (`ADR-AGENT-0006`). Truncating by message count makes the comparisons lopsided: two models do not receive the same actual amount of context.

But an exact tokenizer is **model-specific**: `tiktoken` for OpenAI, sentencepiece variants for Llama and Mistral. There is no universal tokenizer, and each one is a heavy dependency (wasm or native binaries). That is exactly the overhead the project refuses.

## Options evaluated

**A: Count messages.** Zero dependency, but it skews model-to-model comparisons.

**B: Embed a real tokenizer as of V1.** Exact, but heavy, and you need one per model family.

**C: A port, with a heuristic implementation in V1.** The cost is deferred without closing the door.

## Decision

**Option C.**

```ts
// context/interfaces/ITokenCounter.ts
export interface ITokenCounter {
  count(messages: Message[]): number;
}
```

- **V1**: `HeuristicTokenCounter`: characters ÷ 4, documented as approximate.
- **Later**: an implementation per model family, plugging in without touching `SlidingWindowContext`.

This is the same logic as for `ILLMProvider` and `IContextProvider`: whatever varies by provider goes behind a port.

### Free calibration

After each call, the provider declares how many tokens the history **actually** weighed (`ADR-AGENT-0007`). The heuristic's error is therefore measurable instead of guessed, and that is what will tell us when it becomes necessary to move to a real tokenizer, rather than an intuition.

## Consequences

**Positive**

- No dependency in V1.
- The sliding window is written once; changing the counting strategy does not touch it.
- The imprecision is measurable, so the decision to move to a real tokenizer will be made on numbers.

**Negative**

- The characters ÷ 4 heuristic is poor on code and on accented French: two central cases for NATHAN, whose agent writes MicroPython. We must therefore expect to have to replace it, and keep a safety margin on `maxTokens` in the meantime.
- One more port in the wiring.

**Follow-up**

To be reassessed when calibration shows an error that exceeds the margin, or as soon as a billed provider makes wasted context expensive.
