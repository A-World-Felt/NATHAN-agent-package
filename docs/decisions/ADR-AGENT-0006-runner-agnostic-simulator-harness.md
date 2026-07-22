# ADR-AGENT-0006: Harness: stateful simulator, runner-agnostic

- **Status**: ✅ Accepted
- **Date**: 2026-07-21
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`

## Context

The harness is **what justifies the package**. An agent loop is two hundred lines that anyone can rewrite; what is hard and genuinely reusable is being able to test something non-deterministic. It is also the only part with no in-house precedent: neither Marcel nor `NATHAN-jira-package` has an equivalent.

Stated need: *"put an agent in an app and check whether it can navigate inside it. Before putting it in the app, give it the tools: change pages, fetch the current position, click on the components. But instead of really putting it in the app, when it asks to fetch the page, it returns the list from the mock app that doesn't exist. When it changes page, it just changes a variable. The agent has no idea it's not really in the app."*

Then: *"a harness that swaps models and checks the same criteria, with a visualization of cost, duration, and success by parameters: model, memory type, etc."*

### The principle that makes this possible

The agent has **no access to the world** other than tool results. Controlling that boundary means controlling its entire reality. This is not a testing trick, it is a structural property.

Meastro exploits exactly this (`_toolMapping`, `ToolDispatcherBlockExecutor.cs:62-73`): a substitution table redirects tool identifiers to capture blocks that record the intent and return realistic responses without touching the disk. Checked **after** permissions, and therefore unusable for escaping.

## A distinction that changes the API: mock ≠ simulator

- A **mock** returns a frozen value. Stateless.
- What is described here is a **simulator**: several tools sharing a mutable, coherent state. `navigate("réglages")` then `getCurrentPage()` must return `"réglages"`.

A stateless `mockTool(name)` does not cover the need.

## Options considered

**A: Stateless mocks, one per tool.** Insufficient: does not model navigation.

**B: Simulator: an environment factory whose tools are views onto a shared state.** The final assertion bears on the simulator's state.

**C: Recording/replay of real traces.** Faithful, but requires a real app (which does not yet exist) and breaks as soon as the app changes.

## Decision

**Option B**, on two levels.

### Level 1: the scenario

```ts
const naviguer = defineScenario({
  name: "aller aux réglages",
  env: () => fakeApp({ pages: ["accueil", "réglages", "profil"], current: "accueil" }),
  input: "amène-moi aux réglages",
  expect: {
    toolsUsed: ["navigate"],
    finalState: (s) => s.current === "réglages",
    stopReason: "completed",
  },
});
```

### Level 2: the matrix

```ts
const report = await runMatrix({
  scenarios: [naviguer, chercher, écrire],
  axes: { model: ["qwen2.5-coder", "llama3.1"], memory: [slidingWindow(8), slidingWindow(20)] },
  runs: 5,
});
report.toJSON();  report.toCSV();
```

`axes` as a Cartesian product rather than fixed fields: model and memory today, temperature or `maxIterations` tomorrow, without changing the signature.

### Three non-negotiable rules

1. **`env` is a factory, not an instance.** Each run starts again from a fresh state. Otherwise the 2nd of the 5 repetitions starts where the 1st left off and the rates mean nothing. An invisible bug.
2. **Expectations are predicates, not a strict sequence.** Requiring the exact order fails a model that calls `getCurrentPage` before `navigate` even though it is right.
3. **The report keeps the failures, not just the rates.** "60% success" teaches nothing without seeing what the 40% did. Each failed run keeps its trace: tool calls, final state, `stopReason`.

### One run measures nothing

Models are non-deterministic: a single successful attempt does not distinguish a 95% model from a 60% model. `runs: N` per combination, aggregated into rates. Designed from the start: adding it afterward changes the signature.

## Two distinct suites, two tools

| | What it tests | Tool |
|---|---|---|
| **Unit tests** | our loop: dispatch, `maxIterations`, termination. Deterministic. | `node:test` (zero dependencies) |
| **Evals** | the model. Non-deterministic, slow, paid in V2. | **in-house driver**, run by hand |

The harness is **runner-agnostic**: it returns a result, and the consumer asserts with whatever it wants. Coupling it to vitest would make it a peer dependency imposed on consumer repos.

An eval is not a test suite: it does not think in pass/fail but in **rates**, over a **matrix**, and produces a **report**. It never blocks a commit. What is needed is therefore not a test runner, but a loop and a table: small, and justified.

## The package emits data, it displays nothing

A web interface is envisaged later. It has no place in a library: `toJSON()` / `toCSV()` suffice, and the interface will be built in the IDE repo. If the report's shape is right, it will cost nothing.

**Invest in the report's structure, not in the display.**

## Consequences

**Positive**

- The package ships the fake provider and the simulator: without them, each consumer rewrites them, badly.
- No test dependency imposed on consumers.
- The same harness serves both suites: with the fake provider it tests the loop deterministically, with a real provider it evaluates the model.
- Made possible by `step()` (`ADR-AGENT-0003`): the harness drives tool execution instead of being subjected to it.

**Negative**

- A simulator is code to write and maintain for each domain tested. The package provides the mechanics; the IDE's simulators will live in the IDE repo.
- A simulator diverges from the real app over time. A green scenario does not guarantee it works for real: that is an integration test that will always be missing.

**No substitution table is necessary**

Meastro needs a redirection table (`_toolMapping`) because its tools are on-disk manifests resolved by identifier at runtime: there is no other way to inject a different implementation.

Here, `ITool` is an interface and tools are passed as objects: substitution happens **at construction**, simply by passing different objects. The abstraction is the interface itself. See `ADR-AGENT-0010`.

This is also what avoids inheriting Meastro's pitfall: there, `_toolMapping` is a session variable propagated between sessions, so an agent able to write session variables could rewire its own tools.
