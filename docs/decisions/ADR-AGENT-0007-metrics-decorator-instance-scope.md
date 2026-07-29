# ADR-AGENT-0007: Metrics via a decorator, per-instance scope

- **Status**: ✅ Accepted
- **Date**: 2026-07-21
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`

## Context

The stated need: *"an instance sitting in front of the llmProvider that relays the messages but takes care of passing the metrics to the instance in charge of monitoring cost, tokens, etc."*, with a `start monitoring` / `read` / `stop` API that accumulates into a given object and then stops accumulating into it.

End goal: compare models on cost, duration and success (`ADR-AGENT-0006`).

## Metrics ≠ tokenizer

Two needs that are often conflated:

- **Accounting for what was consumed**: the provider declares it itself. Ollama returns `prompt_eval_count` / `eval_count`; OpenAI returns `usage.prompt_tokens` / `completion_tokens`. Nothing to count locally: the provider is the source of truth for billing.
- **Deciding what fits in the window before sending**: that is a different job, handled by `ADR-AGENT-0008`.

The metrics decorator therefore needs no tokenizer at all.

> **To be verified against the real Ollama endpoint before coding.** The field names above must not be taken from memory (anti-hallucination rule no. 2 in `CLAUDE.md`).

## Options evaluated

**A: Each caller reads `response.usage` and aggregates on its own.** No infrastructure, but the aggregation gets rewritten everywhere and nothing propagates across nested calls.

**B: Decorator over `LLMProvider`, scoped by `start`/`stop`.** The initial proposal.

**C: Decorator over `LLMProvider`, scoped by the collector's instance.** Same relay mechanism, but the object's lifetime *is* the scope.

## Decision

**Option C.**

```ts
const metrics  = createMetricsCollector();
const provider = withMetrics(ollama, metrics);   // implements LLMProvider

const r = await runAgent(...);

metrics.total();   // { calls, tokensIn, tokensOut, durationMs }
```

`withMetrics` implements `LLMProvider` and delegates. Neither the agent nor the provider knows it is there.

### Why not `start` / `stop`

Time-driven accumulation is **ambient state**, with two certain failure modes:

- **Tests run in parallel.** Two concurrent scenarios accumulate into the same object. The metrics become noise, with no visible error.
- **A forgotten `stop()`** leaks one test's metrics into the next.

This is exactly the trap noted at an in-house C# backend: sensitive state, including the redirection table, travelling in a shared ambient bag of session variables.

With per-instance scope, each run builds its own collector: parallel-safe by construction, and for the multi-model eval, one collector per run naturally yields one row per run.

### Rates do not live in the package

Prices change; hardcoded, they expire the package and force a republish.

```ts
metrics.total({
  rates: {
    "qwen2.5-coder": null,                      // local: not billed
    "gpt-4o-mini":   { in: 0.15, out: 0.60 },   // $ / M tokens
  },
});
```

The consumer loads its config however it likes and passes the object; **the package reads no file**: otherwise the `.` entry point would drag `fs` behind it (`ADR-AGENT-0002`). The package does the arithmetic and the aggregation.

The join key is `LLMProvider.model`, already present in the original diagram.

### Three rules

1. **Explicit units.** Per token, per thousand, per million? That is the first source of error with this kind of table. The unit must be in the type name or in a mandatory comment.
2. **Absent ≠ zero.** A local model is not free, it is *not billed*: it consumes time, electricity, VRAM. If Ollama comes out at `$0`, it wins every cost comparison without that meaning anything. Report `null`, and let the duration column be read alongside it.
3. **No composite score.** That backend computes a single fitness score: `(P × S × W) / (C_norm × C_compute × C_hw)^λ`. One λ to tune, and you can no longer tell whether a model wins because it succeeds more often or because it costs less. Emit the dimensions separately: success rate, cost, latency. The trade-off belongs to the human.

## Consequences

**Positive**

- No coupling: the agent is unaware of the decorator, and so is the provider.
- `withMetrics` wraps **any** `LLMProvider`, including the fake one: the metrics machinery can be tested deterministically, with no network.
- Same pattern as the `record → authorize → execute` chain on the tools side (`ADR-AGENT-0004`): a single concept on both seams of the system.
- The package does not expire when rates change.

**Negative**

- One more decorator in the consumer's wiring.
- Cost only becomes informative with a billed provider: in V1 on Ollama, the column will read `null` everywhere. The plumbing must exist anyway.

**Implementation order**

`LLMResponse.usage` is filled by the adapter **as early as PR2**: retrofitting it into each adapter later is expensive. The collector and `withMetrics` arrive in PR6, together with the harness that consumes them.
