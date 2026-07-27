# ADR-AGENT-0016: Context strategies are implementations of one port

- **Status**: ✅ Accepted
- **Date**: 2026-07-27
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`

## Context

"Context" here is the list of messages, with their `system` / `user` / `assistant` / `tool` roles, that is actually sent to the model.

There are many ways to manage it: keep the newest messages, summarize on saturation, retrieve from a store, keep a stable prefix and evict from the middle. The package cannot know which one is right for NATHAN. That answer comes from the harness, which runs strategies over a matrix and compares rates, the same way termination is decided (ADR-AGENT-0014), and from the consumer's real features. It does not come from an opinion held before the first measurement. The V1 sliding window is therefore a baseline, the control that later strategies are measured against, not a claim about the best strategy.

**Yet the contract freezes now.** `ContextStrategy` is published and the loop is written against it: adding a required method to a published interface breaks every implementer, the consumer's own adapters included. This is the constraint that already shaped the LLM port (ADR-AGENT-0013). The member surface has to be right while there is one implementation to migrate, not five.

**And the memory architecture is deliberately deferred to V3** (`docs/theory/2026-07-22-context-memory-and-termination-separation.md`, and the *Upcoming decisions* section of `docs/decisions/README.md`). Memory has two non-exclusive faces: transparent retrieval into the window, where the agent is unaware memory exists, and agentic memory, driven by the agent through `remember` / `recall` tools. The V3 decision may land on either or on both. The context contract must survive whichever way it goes, with no breaking change.

## Options considered

**A: one configurable class with an options bag.** `new ContextManager({ maxTokens, summarize: true, recall: false, pinSystem: true })`. One type to learn, everything in one place. But every new behaviour is a new flag, the flags cross-multiply, and the class ends up being the union of every strategy anyone ever wanted. The evaluation matrix then takes booleans as axis values, which is exactly where it stops being informative.

**B: one port, several implementations.** `ContextStrategy`, with one implementation per way of managing context. A new strategy is a new class and touches nothing else. The matrix takes named instances as axis values.

**C: several ports, one per concern, wired by the loop.** A truncation port, a memory port, a summarizer port, composed by the loop. Each port stays small, but the loop must then know all of them, carry a field per port in `AgentDeps`, and own their order. Any topology the loop did not anticipate becomes unreachable, and the fields a given topology does not use sit dead in the deps.

## Decision

**Option B.** One port, `ContextStrategy`, and one implementation per strategy.

### The contract, frozen

Quoted verbatim from `src/context/interfaces/context-strategy.ts`:

```ts
export interface ContextStrategy {
  /** Budget for the outbound list only. The caller sets it under the model's real window. */
  readonly maxTokens: number;
  /** The final message list sent to the model. Nothing is appended to it afterwards. */
  build(history: Message[]): Promise<Message[]>;
  /**
   * What the last iteration added: the assistant message and the tool messages that follow it,
   * not the whole history. Awaited, so evaluation runs stay deterministic. An implementation
   * must not throw: losing a memory write is less bad than losing the answer.
   */
  observe(exchange: Message[]): Promise<void>;
}
```

Three members, and **no memory vocabulary**: no `recall()`, no `store()`, no `MemoryProvider` field. That absence is load-bearing, not an oversight. Naming memory operations in this port would be defining a contract with zero implementations, which the rule of three forbids, and it would commit the package to the transparent face of memory before V3 has compared it with the agentic one. The port stays about "what goes to the model" and "here is what happened", two questions that hold whatever V3 decides.

`build()` is `async` even though the sliding window is synchronous. That is deliberate: a strategy that summarizes on saturation, or that retrieves from a store, needs to await. Adding `async` later to a published interface would break every implementer.

`maxTokens` budgets the **outbound list only**. Room for the model's answer is not reserved by the strategy: the caller sets `maxTokens` below the model's real window, which is also where the margin for the chat-template framing tokens the heuristic does not count is taken (ADR-AGENT-0008).

### A number or an injected dependency is a parameter; a behaviour is an implementation

This is the line the design holds, and the one that separates option B from option A.

`maxTokens` and the injected `TokenCounter` are constructor parameters of `SlidingWindowStrategy`. "Truncate or summarize" is not a boolean in an options bag: it is a second class. An options bag grows combinatorially, and it makes the evaluation matrix unreadable, because comparing eight crossed booleans says nothing while comparing three named strategies says something. It is also precisely the overhead the project's permanent constraint forbids.

### `build()` owns the whole outbound list, and nothing is appended after it

**Everything the model must see enters through `history`, before `build()`.** `build()` returns the final message list, not a fragment, and has total authority over what is sent. That single property is what makes every strategy expressible, from the trivial window to an implementation that calls an LLM to rewrite the whole prompt.

Two consequences, both already under threat, hence written down:

- The **system message** enters through `history`, seeded from the agent definition. It is never a configuration field on the strategy. Otherwise every implementation would have to know about the system prompt, and an optimization such as "do not resend the system this time" would need a second seam.
- The **forced landing** of ADR-AGENT-0011 ("budget reached, conclude with what you have") is one more message in the history, not an append to `build()`'s return value. Same for the `explicit` termination scaffolding of ADR-AGENT-0014. Both write into the message list; this invariant says where.

Without this, an implementation that carefully budgets its tokens gets that budget violated by the loop.

### Merging is a composition behind the port, never a wiring in the loop

`build(history: Message[]) => Promise<Message[]>` has **the same type in and out**, so the port is closed under composition. A strategy that adds recalled memory to the window wraps the window instead of being wired next to it:

```ts
class MemoryContext implements ContextStrategy {
  constructor(private readonly inner: ContextStrategy, private readonly store: MemoryStore) {}
  get maxTokens() { return this.inner.maxTokens; }
  async build(history: Message[]) {
    const recalled = await this.store.retrieve(history);
    return this.inner.build([...recalled, ...history]);
  }
  async observe(exchange: Message[]) { await this.store.write(exchange); }
}
```

Same pattern as the `llm/infrastructure/with-metrics.ts` decorator (ADR-AGENT-0007).

The alternative, letting the loop call `memory.retrieve()` and then `context.build()`, would put a `memory` field in `AgentDeps`, make the loop know about memory, and leave that code dead in the agentic variant where memory never goes through `context/` at all. **The loop must keep knowing exactly one `ContextStrategy`.**

### `observe()` semantics, fixed here

`SlidingWindowStrategy.observe()` is a literal no-op, so V1 does not exercise these semantics. Fixing them now is the point: otherwise the loop invents them by accident at the call site, and V3 inherits that accident on an already-published interface.

| Question | Answer |
|---|---|
| When is it called? | Once per loop iteration, after the tool results have been appended to the history. |
| With what? | Only what that iteration added: the assistant message and the `tool` messages that follow it. Not the whole history. |
| Why only the delta? | A memory implementation must not have to diff against what it already saw. Anything that wants the full history already receives it in `build()`. |
| Awaited or fire-and-forget? | **Awaited.** An unawaited write would create races between runs of the evaluation matrix, and the harness requires determinism. |
| Can it fail the run? | No. The contract asks implementations not to throw, and the loop wraps the call defensively anyway. Losing a memory write is less bad than losing the answer to someone who dictated a request. |

`observe()` is not justified by V3 memory alone, which is what used to make it fragile: a strategy that summarizes on saturation needs exactly this hook to refresh its summary after each exchange, and that strategy is independent of how the memory question resolves. The member has a user either way.

### The folder is `strategies/`, not `providers/`

`SlidingWindowStrategy` lives in `src/context/strategies/sliding-window/`. `providers/<vendor>/` is defined as concrete adapters per **supplier** (ADR-AGENT-0001), and `sliding-window` is not a supplier: what varies in `context/` is the **algorithm**.

The general rule, so the other frameworks know which one to use:

| Folder | Use it when | Example |
|---|---|---|
| `providers/<vendor>/` | the implementations differ by **supplier** | `llm/providers/ollama/` |
| `strategies/<name>/` | the implementations differ by **algorithm** | `context/strategies/sliding-window/` |

A future memory strategy backed by an external service does not blur the rule: the service is a supplier and stays behind its own store port, implemented in `infrastructure/` or in `providers/<vendor>/`, while the strategy that reads from it remains an algorithm in `strategies/`. The two axes stay separate.

### The rule names the port too, not only the folder

The same axis of variation names the interface. A framework whose implementations differ by supplier calls its port a provider; a framework whose implementations differ by algorithm calls it a strategy, which is the word the pattern already carries.

| Framework | What varies | Port | Folder | Implementation |
|---|---|---|---|---|
| `llm/` | the supplier | `LLMProvider` | `providers/<vendor>/` | `OllamaLLMProvider` |
| `context/` | the algorithm | `ContextStrategy` | `strategies/<name>/` | `SlidingWindowStrategy` |

Hence the port is `ContextStrategy` and the baseline is `SlidingWindowStrategy`. Settling this while the interface has exactly one implementation is the point: publishing a port makes any later rename a breaking change for every implementer, the consumer's own adapters included. `SlidingWindowConfig` keeps its name: it does not stutter and needs no suffix.

That `llm/` and `context/` end up with different words is **the same rule applied to two different axes of variation, not an inconsistency**. The friction this removes is real: without it, `context/` holds a port saying "provider" inside a folder that deliberately avoids the word.

### No shared `services/` layer for the truncation rule

The pinning, grouping and selection helpers of the sliding window live in the strategy's own file, below the class, following the `src/llm/providers/ollama/ollama-llm-provider.ts` precedent where `toRequestMessage`, `toToolCalls`, `toUsage` and `readNdjson` sit beside `OllamaLLMProvider`.

They were first written as a shared `context/services/fit-to-budget.ts`, which was wrong twice over. It extracted a shared abstraction before a second consumer existed, which the rule of three forbids, and it forced `services/` to import `interfaces/`, which ADR-AGENT-0001 forbids absolutely. If a second strategy needs the rule, it is extracted then, shaped by a real second consumer instead of by an anticipated one.

### Why the port survives the open memory question

Memory's two faces live in different places, and neither place is a member of this port:

| Face | Where it lives | Impact on `ContextStrategy` |
|---|---|---|
| Transparent (retrieval into the window, agent unaware) | one more implementation of `ContextStrategy` | none |
| Agentic (`remember` / `recall` tools, agent-driven) | a `Tool` plus a store port, on the tools side | none: never goes through `context/` |
| Both, over one store | a composite implementing `ContextStrategy` and wrapping the window | none |

Three topologies, three wirings, one unchanged engine:

```ts
// transparent
new AgenticLLM({ llm, context: new MemoryContext(new SlidingWindowStrategy(cfg), store), tools: appTools });
// agentic
new AgenticLLM({ llm, context: new SlidingWindowStrategy(cfg), tools: [...appTools, remember(store), recall(store)] });
// both, same store
new AgenticLLM({ llm, context: new MemoryContext(new SlidingWindowStrategy(cfg), store), tools: [...appTools, remember(store), recall(store)] });
```

Whatever V3 decides, the engine and the contract stay as they are.

## Consequences

**Positive**

- The V3 memory decision stays open with zero contract change: all three topologies above are reachable today, by wiring only.
- A new strategy costs one class. It implements three members, ships behind the same barrel, and nothing in the loop, the deps or the agent definition moves.
- The evaluation matrix takes strategy **instances** as axis values, so a strategy is chosen by measured rates rather than by argument, exactly like the termination axis of ADR-AGENT-0014.

**Negative, and to watch**

- **A context strategy may be stateful**: a summarizer keeps its summary between iterations. The harness rule "`env` is a factory, fresh state per run" (ADR-AGENT-0006) therefore extends to the context strategy: the matrix must build a fresh instance per run, or run 2 inherits run 1's summary and the rates mean nothing.
- **A persistent store touches disk.** The `.` barrel must stay importable everywhere with no disk access (ADR-AGENT-0002, ADR-AGENT-0012), so a persistent store cannot ship through it: it will need its own subpath, like `./tools`. That is a packaging consequence to settle before coding V3, not during.
- **The real risk is freezing a three-member port that turns out to need a fourth.** The only candidate examined so far, a `reset()` between evaluation runs, is already covered by the fresh-instance rule above, which replaces it with a factory. If a later strategy needs a member that is neither "give me the messages" nor "here is what happened", this decision is wrong and the cost is a breaking change on a published interface.

**Relations**

- Rests on ADR-AGENT-0001 (hexagonal placement, `services/` never imports `interfaces/`), and **refines its placement rule 5** by splitting "class implementing a port" into `providers/<vendor>/` and `strategies/<name>/`. It supersedes that ADR's sentence calling sliding window and memory "two providers of the same port": they are two **strategies** of it, and the port they implement is named accordingly. The rest of ADR-AGENT-0001 stands as written.
- Rests on ADR-AGENT-0008 (token counting behind a port, the heuristic as the V1 counter) and ADR-AGENT-0012 (no `./context` subpath until a real need appears, `Message` owned by `llm`).
- Coordinates with ADR-AGENT-0011 and ADR-AGENT-0014: the forced landing and the termination scaffolding write into the history, before `build()`.
- Same empirical method as ADR-AGENT-0014, same runner-agnostic harness constraint as ADR-AGENT-0006.
- Pre-decisional framing: `docs/theory/2026-07-22-context-memory-and-termination-separation.md`. The V3 memory ADR inherits the constraints recorded here.

## Open questions

1. **Injection order**, V3. Injecting recalled memory before truncation subjects it to the budget and lets it be cut; injecting after overflows the window. Both orders are expressible with the port as frozen, so the choice is made with measurements rather than now.
2. **Prefix stability and provider caching.** The candidate providers bill a previously seen prefix less, so truncating from the front destroys the cached prefix on every call, and a strategy that keeps a stable prefix and evicts from the middle should be cheaper. **Not verified**: the exact thresholds, the TTLs, Ollama's caching behaviour and the current state of Anthropic's memory tooling are not checked here. If a strategy ever leans on this, it first becomes a `docs/theory/` document with its sources and a verification status.
3. **Background probing of what the agent remembers** does not fit behind `build()` / `observe()`: it is not a request-path call. It lands as a separate service writing into the same store a memory strategy reads. Recorded here so nobody adds a fourth member to the port for it.
4. **Memory may become a framework of its own** next to `context/` rather than a strategy inside it. The V3 memory ADR settles that, under the constraints above.
