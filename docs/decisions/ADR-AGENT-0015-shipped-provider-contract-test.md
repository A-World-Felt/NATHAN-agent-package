# ADR-AGENT-0015: The package ships a provider contract test

- **Status**: ✅ Accepted
- **Date**: 2026-07-24
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`

## Context

The package promise is **"bring your own provider"**: `LLMProvider` (ADR-AGENT-0013) is a
port implemented by the consumer's own adapters, not only by the two we ship
(`OllamaLLMProvider`, `FakeLLMProvider`). A published port is a contract, and a contract
without a conformance check is only a hope. TypeScript proves the *shape* (the methods
exist) but not the *behavior*: that `complete()` actually resolves to a well-formed
`LLMResponse`, that a streaming provider's chunks terminate with exactly one `done:true`,
that `usage`, when present, carries two numbers.

Every consumer who writes an adapter faces the same question: *did I implement the port
correctly?* Left to themselves, each answers it by rewriting the same ad-hoc checks,
badly, or not at all. This is the identical reasoning that made us ship the fake provider
and the simulator (ADR-AGENT-0006): the hard, reusable part belongs in the package, once.

## Options considered

**A: Ship nothing; document the port and trust implementers.** Zero code, but every
consumer reinvents the verification, and drift between an adapter and the port surfaces only
at runtime, inside the loop, far from the cause.

**B: Ship a conformance *test* coupled to a runner.** A `node:test` suite the consumer
runs. But that imposes `node:test` (or worse, vitest) as a peer dependency on every consumer
repo, exactly the coupling ADR-AGENT-0006 rejected for the harness. The harness is
runner-agnostic; the contract check must be too, for the same reason.

**C: Ship a runner-agnostic function that returns a report.** `checkProviderContract(provider)`
runs the port's happy path, records one `ContractCheck` per invariant, and returns a
`ContractReport`. The caller asserts on it with whatever runner it likes, or none.

## Decision

**Option C.** `./testing` exports `checkProviderContract(provider, opts?): Promise<ContractReport>`
alongside the fake.

```ts
export type ContractCheck = { name: string; ok: boolean; detail?: string };
export type ContractReport = { ok: boolean; checks: ContractCheck[] };
```

**It returns a report; it never throws on a failed check.** A violated invariant is *data*,
not an exception: each check runs in isolation, a thrown error is caught and recorded as
`{ ok:false, detail }`, and `report.ok` is the AND of every check. This is the load-bearing
property. A function that threw would force a `try/catch` on the caller and would stop at the
first failure instead of reporting *all* of them; a function that returned a report lets the
consumer assert with `node:test`, vitest, or a bare `if`. Our own suites are thin wrappers:
the unit test asserts `report.ok` against the fake, the gated integration test asserts it
against a live Ollama.

**It targets the port, not the registry.** `checkProviderContract` takes an `LLMProvider`
instance, so it serves a consumer's own provider that is not in `PROVIDERS`.

**Streaming checks are conditional on the declared capability.** They run only when
`provider.supportsStreaming()` is true: the fake (which returns `false`) records none, a
real Ollama exercises them. This mirrors ADR-AGENT-0013's "unsupported unless proven": the
contract checks exactly what the provider claims to support, no more.

## Consequences

**Positive**

- A consumer verifies any adapter against the port with one call, and asserts with its own
  runner. No verification code to rewrite, no test dependency imposed.
- Behavioral drift between an adapter and the port surfaces at the boundary, named, not deep
  inside the loop.
- The same function serves both of our suites (fake, live Ollama), each a one-line assert.

**Negative**

- The set of invariants is ours to keep honest: an invariant the port gains later must be
  added here too, or conformance under-checks. That is the cost of shipping the check.
- A green report is not a proof of correctness for every input; it exercises the happy
  path. It catches shape and protocol violations, not semantic ones.

**Relations**

- Same rationale and same runner-agnostic constraint as the harness (ADR-AGENT-0006); ships
  from `./testing` (ADR-AGENT-0002).
- Checks the invariants frozen by the port (ADR-AGENT-0013): required capabilities, the
  `LLMResponse` shape, and the streaming chunk protocol with its terminal `usage`.
