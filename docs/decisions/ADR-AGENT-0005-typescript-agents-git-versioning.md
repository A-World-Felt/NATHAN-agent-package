# ADR-AGENT-0005: Agents declared in TypeScript, versioning via git

- **Status**: ✅ Accepted
- **Date**: 2026-07-21
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`

## Context

Stated requirement: "we could register generic agents in the package, but that's more, let's say, for an app that includes the package: the prompts/configs are set up in a JSON, the person could commit 'ok this version is good' and run tests."

The class diagram contains nothing of the sort: `AgenticLLM` receives its prompt and its tools as construction parameters. There is no "agent definition" object independent of execution.

Three questions to settle: **where the definitions live**, **in what format**, and **how versioning is done**.

### What the analysis showed

- **Marcel has no prompt versioning.** Exhaustive search: zero occurrences of `PROMPT_VERSION`, `promptVersion`, `promptRegistry`, `getPrompt`. No `prompt` table in the database, no migration. Prompts are literals interpolated in pure functions, one file per call site, versioned **by git only**. Their own notes treat a prompt change as "validate in a manual gate".
- **Marcel attempted a named registry, and it drifted.** `src/llm/models/index.ts:62`:
  ```ts
  feature: string;  // 'generation' | 'replace' | 'chat' | 'coverage-check' | etc.
  ```
  The real union lives in the comment. Within a few months the documented list became partly fictitious: `coverage-check` does not exist in production as a `feature`.

## Options considered

**A: Runtime registry with lookup by name.** `registry.get("navigateur")`. Reproduces exactly the drift mode observed in Marcel if the keys are `string`.

**B: `defineAgent()` in TypeScript, agents exported as `const`, imported statically.** Free types, no validation code to write, legible git diff, no lookup by name.

**C: Definitions in JSON/YAML loaded at runtime.** A prompt changes without recompiling. Requires a schema and validation code; JSON does not accept comments and copes poorly with long multi-line text, whereas a system prompt *is* long text that one wants to annotate.

## Decision

**Option B, marked "for now".**

```ts
export const navigateur = defineAgent({
  name: "navigateur",
  prompt: "…",
  tools: [navigate, getCurrentPage],
});
```

`defineAgent()` is a pure function that returns a typed object. **No runtime registry, no untyped `string` key.**

The criterion that decided between B and C: *does a prompt need to be able to change without a rebuild?* Current answer: no.

Since `defineAgent()` is a function, adding a JSON/YAML loader later invalidates nothing in this decision.

### Versioning is not built

There is **no `version` field, no registry, no database**. An agent is a committed TypeScript file:

- the **version** is git;
- "this version is good" is **proven by the tests**.

This eliminates the two-diverging-counters problem: a per-agent `version` field would have drifted from the package's `npm version`, and one would have had to decide which is authoritative.

## Consequences

**Positive**

- Zero schema-validation code to write and maintain.
- Autocompletion and typing work on the agent definitions.
- Impossible to reproduce Marcel's `feature: string` drift: there is no text key.
- Versioning is free and already tooled (git, blame, PR, revert).

**Negative**

- Changing a prompt requires recompiling and republishing the package, or, for an agent defined on the consumer side, rebuilding its app.
- A non-developer user cannot adjust a prompt. Not blocking: the agents are written by the team.

**Link with the other decisions**

Versioning is only worthwhile if one can **measure** that a v2 of a prompt beats v1. Versioning and evaluation are the same feature seen from two angles: without the harness of `ADR-AGENT-0006`, versioning would be nothing but a changelog.

**General rule that follows, applicable everywhere in the package**

> If a key is a string, it must be typed. The good precedent is `Marcel/src/llm/providers/index.ts:25`: `PROVIDERS: Record<ProviderID, () => ILLMProvider>`, closed, typed, driven by an environment variable.
