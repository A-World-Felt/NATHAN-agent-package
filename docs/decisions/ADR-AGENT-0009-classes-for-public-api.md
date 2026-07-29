# ADR-AGENT-0009: Classes for the public API, pure functions inside

- **Status**: ✅ Accepted
- **Date**: 2026-07-21
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`
- **Supersedes**: `ADR-AGENT-0001` on the "use-cases as functions" point. The rest of `ADR-AGENT-0001` (hexagonal architecture, layers, placement rule) **remains in force**.

## Context

`ADR-AGENT-0001` decided that use-cases would be partially applied functions, by carrying over Marcel's convention:

```ts
export const makeRunAgent = (deps) => async (input) => { … };
```

That decision is revised. The original reasoning transposed a Marcel convention without checking that it applied.

**Marcel is an application, not a published library.** Its use-cases are internal, wired once in `src/app/composition/`, and their only consumer is Marcel itself. In that context, the partial-dependency function is the right tool: it makes the wiring explicit at the composition point.

**A published package has a constraint Marcel does not: a public API surface**, consumed by third-party repos and by teammates who will not read the internal code.

Mental model stated by the team: *"apps import the package, declare an `AgenticLLM` or a `VoiceAgenticLLM` and use its functions."*

## Options evaluated

**A: Partially applied functions** (`ADR-AGENT-0001`).
Consistent with Marcel. But `makeRunAgent(deps)` returns an **opaque function**: nothing in it is discoverable, and `step()` has to be exported separately, which breaks the link between the two.

**B: Classes for everything, including dispatch and helpers.**
Faithful to the original diagram. Brings stateless classes for pure functions, which `ADR-AGENT-0001` rightly rules out.

**C: Classes for the public API, pure functions for the internal machinery.**
The class is the entry point; the testable orchestration stays a function.

## Decision

**Option C.**

```ts
export class AgenticLLM {
  constructor(deps: AgentDeps);                   // { llm, context, tools, maxIterations }
  run(input: AgentInput): Promise<AgentResult>;
  step(state: AgentState): Promise<AgentState>;   // the harness drives through here
}

export class VoiceAgenticLLM {
  constructor(deps: { agent: AgenticLLM; voice: VoiceProvider });
  run(input: string | AudioBuffer): Promise<AgentResult>;
}
```

`AgenticLLM.run()` wraps a pure function `step(state, deps)`: testable without instantiating the class.

### Dividing line

| Nature | Form | Examples |
|---|---|---|
| **Public API with state and multiple operations** | **class** | `AgenticLLM`, `VoiceAgenticLLM` |
| Adapter implementing a port via I/O | class | `OllamaLLMProvider`, `SlidingWindowStrategy`, the tools |
| Pure function for orchestration or computation | function | `step`, `dispatchTool`, `defineAgent`, aggregation |

The rest of the `ADR-AGENT-0001` placement rule is unchanged.

## Justification, point by point

- **Discoverability.** `agent.` triggers autocompletion of the entire API. A returned function exposes nothing.
- **The object genuinely has state and multiple operations**: shared configuration, `run()`, `step()`. That is the usage definition of a class.
- **Composition reads well.** `new VoiceAgenticLLM({ agent, voice })` directly expresses what the diagram draws (`VoiceAgenticLLM` composes `AgenticLLM` and `VoiceProvider`).
- **Testability is not an argument**: a class with dependencies injected in the constructor tests exactly like a function with dependencies as parameters. That was the analysis error in `ADR-AGENT-0001`.
- **The team's vocabulary is preserved.** `AgenticLLM` and `VoiceAgenticLLM` are the names established in the architecture diagram and in the team's discussions. Renaming them to `run-agent` would have cut the code off from the documentation and the conversations.

## Consequences

**Positive**

- The public API matches the architecture diagram: no more gap to document on this point.
- A teammate discovering the package finds their way through autocompletion.
- The machinery stays in pure functions: the testability from `ADR-AGENT-0001` is preserved in full.

**Negative**

- A deliberate divergence from Marcel on this precise point. It is justified by a difference in nature between the two projects (application versus library) and must be explained to anyone who knows Marcel.
- Two styles coexist in the package. The dividing line above must stay explicit in `CLAUDE.md`, otherwise it will blur.

**Method lesson**

A convention observed in another project must be **justified by the need here**, not transposed because it exists elsewhere. The neighboring repo cited (a private application, never published, which the team does not know and which is not the package's consumer) had authority over nothing. The right question was not "what does Marcel do?" but "what does a developer write when they install this package?".

See `ADR-AGENT-0001` § "On external references" for the general framing.
