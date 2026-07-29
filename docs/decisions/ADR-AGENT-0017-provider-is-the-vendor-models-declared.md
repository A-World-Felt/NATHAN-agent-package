# ADR-AGENT-0017: The provider is the vendor, the model travels per call, available models are declared

- **Status**: ✅ Accepted, partially supersedes 0013, amends 0007 and 0015
- **Date**: 2026-07-29
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`

## Context

The question started small: the harness (PR6) needs to run a matrix whose axis is the model, and the consuming IDE will want to show a user which models they have access to. Neither can work while a model name is something you are supposed to know by heart.

It was prompted by a comparison. LM Studio shows, in its catalogue, whether a model fits the machine before you download it. **Verified: that information lives in the application, not in its API.** Its REST surface is `/api/v1/models`, `models/load`, `models/unload`, `models/download` and `models/download/status`, and documents no compatibility or memory-requirement field. On the Ollama side, `/api/tags` lists installed models without capabilities, `/api/show` adds a `capabilities` array, and `/api/ps` reports `size_vram`, which is a loaded model's footprint and not the machine's capacity. **Neither vendor reports the host's hardware over HTTP.**

So "which models can this machine hold" is unanswerable through either API. It would take per-OS calls (`nvidia-smi`, `wmic`, `sysctl`) plus a model-to-memory catalogue that goes stale with every new quantisation: a breach of the `.` barrel's no-disk-access constraint (`ADR-AGENT-0002`, `ADR-AGENT-0012`) and the kind of hand-maintained list `ADR-AGENT-0005` rejects. It belongs to the consuming IDE, which knows the machine and is allowed to touch it.

Designing the smaller, answerable question surfaced a bigger one: **our word "provider" sits on the wrong object.**

### What the vendors expose, and why it cannot be unified

| | Where a model's capabilities live | Cost |
|---|---|---|
| Ollama | `/api/show` only; `/api/tags` carries name, size, digest and details | one call **per model** |
| Anthropic | inside `GET /v1/models`, one `capabilities` object per model | one call for all |

The shapes do not match, and neither does the vocabulary. Anthropic's capability list is `batch`, `citations`, `code_execution`, `context_management`, `effort`, `image_input`, `pdf_input`, `structured_outputs` and `thinking`: **there is no function-calling boolean at all**, because it does not vary across their models. Ollama's `capabilities` array exists but its documented example is `["completion", "vision"]` and the exhaustive value list is published nowhere, so `"tools"` cannot be relied on without checking the live endpoint.

That table also makes a distinction worth naming, because two different things share one word. `code_execution` is a tool **the vendor runs**. Our `ToolDefinition` describes a tool **we run**, which the model only names. Our capability question is "can this model emit calls against the tools I hand it", never "what built-in tools does this vendor offer".

### What the code already showed

Two capabilities sit on the port, and they are not at the same level:

```ts
// ollama-llm-provider.ts:59-62
// Ollama streams every chat model over its transport; capability is not per-model here.
supportsStreaming(): boolean { return true; }

// ollama-llm-provider.ts:18, 51
/** Whether the model supports tool calls. Default true (verified for qwen2.5). */
supportsTools(): boolean { return this.toolsSupported; }
```

Streaming is a property of the **transport**, tool calling a property of the **model**. `ADR-AGENT-0013` placed both at the same level with "capabilities are per-instance = per-model"; the adapter's own comment contradicts it.

The request body says the same thing:

```ts
// ollama-llm-provider.ts:110-115
body: JSON.stringify({
  model: this.model,                         // from the constructor
  messages: messages.map(toRequestMessage),  // from the call
  tools: tools?.map(toRequestTool),          // from the call
  stream,                                    // from the call
}),
```

Four fields at the same level of one HTTP request. Three arrive per call, one is frozen at construction. The protocol treats `model` as a request parameter; we treat it as instance state.

## Options considered

**A: Vendor above model.** `LLMProvider` becomes the vendor, exposing `model(id)` which returns a client bound to one model. This is the Vercel AI SDK's shape: `Provider.languageModel(modelId)` returns a model object, `generateText({ model })` takes that object, and `createProviderRegistry({ openai, anthropic })` resolves `"openai:gpt-5.1"` into one. LangChain JS agrees in spirit. Correct and aligned with the field, but it introduces a third concept between the vendor and the agent, and every consumer must hold it even for the single-model case.

**B: Model per call.** `complete(messages, { model, tools })`, the shape of the raw Anthropic and OpenAI SDKs and of Ollama's own wire. Simple, but taken alone it leaves the model unattached: nothing in the type system says which model an agent runs on, and the caller must re-pass it at every iteration.

**C: Neither; ship a discovery function and postpone.** `listOllamaModels()` beside the adapter, port untouched. Smallest possible move, but it leaves the vocabulary wrong and the decision only gets more expensive with each PR that leans on the current shape.

## Decision

**B inside `llm/`, A inside `agent/`.** The two layers answer different questions, and forcing one shape on both is what made every option feel wrong.

`llm/` is a transport to a vendor. It holds no notion of an instance bound to a model. `agent/` is where a model is associated with a prompt and a set of tools, because that association is what an agent *is*.

### The port

```ts
export type ModelInfo = {
  /** What goes into the request body: "qwen2.5:7b". */
  id: string;
  /** Required: whoever declares a model must answer for it. */
  supportsTools: boolean;
  maxInputTokens?: number;
};

export interface LLMProvider {
  /** A plain string, not `ProviderID`: see below. */
  readonly id: string;
  /** Transport-level, not per-model: Ollama streams every chat model. */
  supportsStreaming(): boolean;
  /** Synchronous: these are declared in configuration, not queried. */
  models(): ModelInfo[];
  complete(messages: Message[], opts: { model: string; tools?: ToolDefinition[] }): Promise<LLMResponse>;
  stream?(messages: Message[], opts: { model: string; tools?: ToolDefinition[] }): AsyncIterable<LLMChunk>;
}
```

**`id` is a `string`, not a `ProviderID`.** The closed union types the keys of the shipped `PROVIDERS` registry; the port is implemented by the consumer's own adapters, whose ids that union has never heard of. Typing the port with it would make the package's own registry the only legal set of providers, which contradicts "bring your own provider". This is not the untyped-key failure `ADR-AGENT-0005` warns about: nothing is looked up by this string. The lookup is `resolveProvider(id: string)`, which still narrows to `ProviderID` before indexing the registry.

`ToolDefinition` stays where `ADR-AGENT-0012` put it, in `llm/models/`, and stays a per-call input. It is not a capability: `ADR-AGENT-0011` has the loop call `complete()` **without** tools to force a graceful landing, so the field changes between two iterations on the same model. It moves from a positional parameter into the options object, next to `model`, which is where the wire already puts them both.

### Declared, not discovered

**A provider is registered with the models it offers.** The package queries nothing and verifies nothing:

```ts
const provider = new OllamaLLMProvider({
  models: [
    { id: "qwen2.5:0.5b", supportsTools: true },
    { id: "qwen2.5:7b", supportsTools: true, maxInputTokens: 32768 },
  ],
});
```

The precedent is `ADR-AGENT-0007`: rate tables do not live in the package, the consumer loads its own configuration and passes the object, because prices change and an embedded table expires the library. Available models are the same kind of fact.

This is not the drifting list `ADR-AGENT-0005` rejects, and the difference is ownership. A table **maintained inside the package** rots, because it ages without it. A list **declared by the consumer** is maintained by the same person who installs the models. It can become wrong; it has the right owner.

What it buys, beyond simplicity: no N+1 over `/api/show`, no asynchronous capability lookup contaminating the loop, and no dependence on Ollama's undocumented `"tools"` value. The compile-time guarantee `ADR-AGENT-0013` was built for is not lost, it moves: `supportsTools` is required in `ModelInfo`, so the compiler forces the declaration on the consumer instead of on the adapter author.

**Two distinct errors follow, both free.** Calling `complete()` with a model absent from the declared list raises `MODEL_NOT_FOUND` before any network call, listing what was declared. A model that is declared but not installed still gets Ollama's 404, whose message gains the `ollama pull` command to run. Different causes, different messages, no extra request.

**Refusing an undeclared model is a property of the port, not an adapter's habit.** Every implementation owes it, `FakeLLMProvider` included, or a consumer could not rely on it: a guard one provider honours and another ignores is not a contract. The shipped fake declares exactly one model, fixed in code and beyond the reach of configuration, because its script is a list consumed by a cursor and never indexed by the model. A fake declaring several would answer all of them identically and misrepresent itself.

**Verification is deferred to a script, not built into the port.** Comparing a declared list against what `/api/tags` really holds is a tool the consumer runs on purpose, not a cost the loop pays on every wiring. `listOllamaModels()` lands with that script, not here.

### What this supersedes in ADR-AGENT-0013

Three points, and only three. `ADR-AGENT-0013:10` grants its own window: "the method surface must be right *now*, while there are only two implementations to migrate". Two implementations, no external consumer, `withMetrics` and the agent unwritten: the window is still open, and it closes with the next PRs.

| Superseded | Replaced by |
|---|---|
| `readonly model: string` on the port | `readonly id: string` naming the vendor; the model travels per call |
| "capabilities are per-instance = per-model" | `supportsStreaming()` on the transport, `supportsTools` on `ModelInfo` |
| "no per-call config; the constructor carries model plus fixed options" | an options object carrying `model` and `tools` |

Everything else in 0013 stands, including its central thesis that a capability must be declared rather than inferred, and its rule that how an adapter *computes* a capability is a hidden detail.

### What it amends elsewhere

- **`ADR-AGENT-0007`**, one sentence: "the join key is `LLMProvider.model`". The field no longer exists on the port, so `withMetrics` reads the model from the call. It is the more accurate source anyway, since it records the model actually used. The rest of 0007 stands: its per-instance scope is the collector's, not the provider's, and `withMetrics` is still unwritten.
- **`ADR-AGENT-0015`**, its set of checked invariants. The signature itself does not move: 0015 already wrote it `checkProviderContract(provider, opts?)`, and `opts` merely gains a `model` to exercise. What changes is what gets checked, since the required capabilities 0015 named are no longer the port's: the vendor `id` and the declared models replace them. Its thesis, targeting the port rather than the registry and returning a report rather than throwing, does not move.

### The constraint this places on the agent

PR4 owns the association, and it must respect two rules.

**No runtime registry.** "Registering an agent" must not become a lookup by untyped string, which `ADR-AGENT-0005` ruled out. The association is written in TypeScript and checked by the compiler.

**Requirement and provision are separate.** What an agent *needs* is stable and belongs in code ("this agent requires a model that calls tools"). Which model *serves* it is configuration and arrives at wiring time, from the environment. An agent definition may carry a recommended model; it must not impose one, or changing model becomes editing source, which is exactly what this design set out to avoid.

**A dated assumption, to be re-read rather than inherited.** As of July 2026 the agents are internal to the application and fixed, so a model named at wiring time is enough. The day the IDE lets a user pick their model, the association moves out of the definition and into the wiring. This is a temporary simplification, not a property of the design.

### Configuration

`PROVIDERS.ollama()` declares a single model, `process.env.OLLAMA_MODEL ?? "qwen2.5:0.5b"`, with `supportsTools: true`. The registry stays what it always was: an environment-driven shortcut. Declaring several models is the explicit path, `new OllamaLLMProvider({ models: [...] })`.

## Consequences

**Positive**

- The vocabulary matches the domain: a provider is a vendor and gives access to several models, which is what everyone outside this repo means by the word.
- The two capabilities land where they belong, a split the adapter's own comment had already recorded and the port contradicted.
- `models()` is synchronous, so nothing in the loop awaits a capability, and no vendor's introspection quirks leak into the contract.
- The single-model case stays a one-liner, and the multi-model case needs no new concept: it is a longer array.

**Negative**

- PR2 is reopened: the port, both implementations, the conformance check and the registry, plus their tests. No external consumer is owed a migration, but the work is real and it is the last cheap moment to do it.
- A declared list can be wrong. A model declared but absent from the server fails at the first call, not at wiring. The verification script is what closes that gap, and it does not exist yet. **Deferred with no date, deliberately** (`ROADMAP.md`): the showcase prototype calls hosted providers rather than a local server, so a declared model cannot be missing from an install nobody runs. The day a deployment does run locally, the check belongs to the application's boot, called on purpose and awaited once, never to the constructor: a provider that probed the network on construction would make `models()` asynchronous and would fail wiring on a cold server.
- The package still answers "what was declared here", never "what can this machine hold". That question stays with the IDE.

**Relations**

- Partially supersedes `ADR-AGENT-0013`; amends one sentence of `ADR-AGENT-0007` and the checked invariant set of `ADR-AGENT-0015`. All three are marked in the amended files themselves, not only in the registry: a declared amendment that is never applied leaves a reader following the registry on a contradiction.
- Keeps `ToolDefinition` where `ADR-AGENT-0012` placed it, and keeps the per-call `tools` variation `ADR-AGENT-0011` depends on.
- Binds PR4 to `ADR-AGENT-0005`: the agent-to-model association is typed TypeScript, never a string lookup.

**Sources**

- LM Studio REST API: <https://lmstudio.ai/docs/app/api/endpoints/rest>
- Ollama API reference: <https://github.com/ollama/ollama/blob/main/docs/api.md>
- Anthropic Models API: <https://platform.claude.com/docs/en/api/models-list>
- AI SDK provider and model management: <https://ai-sdk.dev/docs/ai-sdk-core/provider-management>
