# @a-world-felt/nathan-agent-core

> **Current version: 0.4.0-alpha** (prerelease). The public API is not frozen yet; the `.`, `./llm`, and `./testing` entry points ship (`./tools` is still coming). See [ROADMAP.md](./ROADMAP.md).

A **reusable** LLM agentic engine: the **engine** (LLM providers, tools, loop, memory), the **agent definitions** (prompt + tools), and an **agent test harness**. Provider-agnostic **and** application-agnostic: **the consumer repo chooses its provider and brings its own tools**. It plugs into any Node/TypeScript project.

The reasoning behind each design choice is in [`docs/decisions/`](./docs/decisions) (the ADRs).

- **Pure ESM** (`"type": "module"`, `NodeNext`). Node ≥ 18.
- **Private, restricted package** (`@a-world-felt`). Repo: `A-World-Felt/NATHAN-agent-package`.

---

## Installation

The package is published to the organization's **GitHub Packages registry** under `A-World-Felt`. The consumer configures the registry for the `@a-world-felt` scope, then installs by **SemVer**.

`.npmrc`, at the root of the consumer project:

```
@a-world-felt:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
npm i @a-world-felt/nathan-agent-core@^0.4.0-alpha
```

```json
{
  "dependencies": {
    "@a-world-felt/nathan-agent-core": "^0.4.0-alpha"
  }
}
```

The registry **requires authentication**, even for reads (the package is private):

- **Locally**: a GitHub PAT exported as `NODE_AUTH_TOKEN` (never committed). A classic PAT needs `read:packages` **and `repo`**: the package lives in a private repository, and without `repo` the registry answers 404 rather than 401, which reads like a misspelled package name. A fine-grained token needs read access to that repository's packages.
- **In GitHub Actions**: `actions/setup-node` writes the `.npmrc`, but that alone is not enough. The consuming job must also grant `packages: read` and hand the token to the install step:

```yaml
permissions:
  contents: read
  packages: read
steps:
  - uses: actions/setup-node@v4
    with:
      node-version: '22'
      registry-url: 'https://npm.pkg.github.com'
      scope: '@a-world-felt'
  - run: npm ci
    env:
      NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The built-in `GITHUB_TOKEN` only reaches packages of its own organization. A consumer outside `A-World-Felt` uses a PAT, as above.

You pin a SemVer range (`^X.Y.Z`); publishing a new version is described in the versioning convention in [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Consumer-side setup

This package is **pure ESM** and exposes its code and types **only** through the `exports` map. Your consumer project must therefore be **ESM** (`"type": "module"`) and use **NodeNext** resolution, otherwise neither the code nor the types resolve: classic resolution (`"moduleResolution": "node"`) cannot read an `exports` map.

The minimum the consuming project needs:

```jsonc
// package.json (of the consumer)
{
  "type": "module"
}
```

```jsonc
// tsconfig.json (of the consumer)
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true
  }
}
```

Under NodeNext, your own relative imports also carry the `.js` extension, even from a `.ts` file.

---

## Entry points

Four subpaths, **opt-in**: an agent receives only what you pass it, nothing implicit.

| Subpath | Contents | State in `0.4.0-alpha` |
|---|---|---|
| `.` | engine, ports, types, **the agentic loop** (**no disk access**, importable anywhere) | **available** (contract models, LLM layer, context layer, tools port, agent layer) |
| `./llm` | LLM layer: the `LLMProvider` port, `OllamaLLMProvider`, the `PROVIDERS` registry + `resolveProvider`, and the LLM models | **available** |
| `./tools` | generic file tools (coupled to `fs`, opt-in) | **empty**: it resolves, and exports nothing yet |
| `./testing` | test harness: `FakeLLMProvider` + `checkProviderContract` (simulator, scenarios coming) | **available** (`FakeLLMProvider`, `checkProviderContract`) |

> `./tools` is declared in the `exports` map because the entry points are a design choice (`ADR-AGENT-0002`), and it now resolves to a real, empty module. It carries **no symbol** until the file tools land, so importing it is safe but pointless. Note the split: the tools **port** and the dispatcher are pure and ship from `.`; only the concrete tools that touch the disk will live behind `./tools`.

### What `.` exports

`.` re-exports the full `./llm` engine barrel, the context layer, the pure half of the tools layer, and the agent layer. The umbrella entry point carries everything the LLM layer offers (importing from `./llm` gives that layer standalone, without the rest). It exposes:

- **Models** (pure types): `Role`, `Message`, `ToolCall`, `ToolDefinition`, `ToolResult`, `ToolOutcome`, `Usage`, `LLMResponse`, `LLMChunk`, `ModelInfo`, `LLMErrorCode`, and the JSON-Schema types `JSONSchemaType`, `JSONSchemaProperty`, `ToolSchema`.
- **Engine**: the `LLMProvider` port with its `CompletionOptions`, `OllamaLLMProvider`, the `PROVIDERS` registry with `resolveProvider` and `DEFAULT_OLLAMA_MODEL`, and the `LLMError` class.
- **Context**: the `ContextStrategy` and `TokenCounter` ports, `SlidingWindowStrategy` (the V1 baseline: keep the newest history that fits, pin the system message, never split a tool call from its result) and `HeuristicTokenCounter` (characters divided by four, approximate by design, `ADR-AGENT-0008`). There is no `./context` subpath: the layer has no standalone consumer yet (`ADR-AGENT-0012`).
- **Tools**: the `Tool` port, `dispatchTool` (which never throws) and `toToolDefinition`. All pure, hence here rather than behind `./tools`.
- **Agent**: `AgenticLLM`, `defineAgent`, and the loop's contracts `AgentDefinition`, `AgentDeps`, `AgentInput`, `AgentState`, `AgentResult`, `Budget`, `StopReason`, plus `DEFAULT_LANDING_INSTRUCTION`.

No disk access reaches `.`, so it stays importable everywhere (`ADR-AGENT-0002`).

### Minimal example

```ts
import { LLMError, type Message, type ToolSchema } from "@a-world-felt/nathan-agent-core";

// A conversation message, as sent to the model.
const salut: Message = { role: "user", content: "amène-moi aux réglages" };

// A tool's parameter schema, as presented to the model.
const navigate: ToolSchema = {
  type: "object",
  properties: { page: { type: "string", description: "page cible" } },
  required: ["page"],
};

// Provider errors bubble up (unlike tool failures) and carry a code.
const err = new LLMError("UNKNOWN_PROVIDER", "provider inconnu");
console.log(salut.role, navigate.required, err.code);
```

This import **compiles** and **runs**: `.` exposes both the contract types and the engine.

---

## Running an agent

An agent is a **prompt plus tools**, declared in TypeScript and imported statically. There is no registry and no lookup by name: the compiler checks the wiring (`ADR-AGENT-0005`).

```ts
import {
  AgenticLLM, defineAgent, OllamaLLMProvider,
  SlidingWindowStrategy, HeuristicTokenCounter,
  type Tool,
} from "@a-world-felt/nathan-agent-core";

// A tool returns an outcome; it never throws, and it does not know which call it answers.
const navigate: Tool = {
  name: "navigate",
  description: "Aller à une page de l'application",
  schema: { type: "object", properties: { page: { type: "string" } }, required: ["page"] },
  async execute(args) {
    return { content: `Vous êtes sur ${String(args.page)}`, isError: false };
  },
};

const navigateur = defineAgent({
  name: "navigateur",
  prompt: "Tu aides une personne non voyante à se déplacer dans l'application.",
  tools: [navigate],
});

const agent = new AgenticLLM({
  agent: navigateur,
  llm: new OllamaLLMProvider({ models: [{ id: "qwen2.5:0.5b", supportsTools: true }] }),
  context: new SlidingWindowStrategy({ maxTokens: 4000, counter: new HeuristicTokenCounter() }),
});

const result = await agent.run("amène-moi aux réglages");
console.log(result.content, result.stopReason, result.iterations);
```

### How a run ends

The loop stops when the model asks for no tool. That is the nominal path and it is the providers' own mechanism, not a convention of ours (`ADR-AGENT-0003`).

| `stopReason` | What happened |
|---|---|
| `completed` | the model returned no tool call |
| `budget` | a bound fell, so the agent was asked to conclude |
| `stuck` | the same call kept repeating, so the agent was asked to conclude |
| `error` | reserved: nothing produces it, since a provider failure propagates as `LLMError` |

**A forced exit is a landing, never a cutoff** (`ADR-AGENT-0011`). When a bound falls, the agent is told to conclude and the model is called once more **with no tools at all**, so it cannot call anything and therefore writes. You always get an answer rather than a truncated result, which matters when someone dictated a request and is waiting to hear one.

### What you can tune

Everything that shapes behaviour is a parameter, so a test harness can sweep it as an axis rather than inherit one hard-coded set.

```ts
new AgenticLLM({
  agent: navigateur,
  llm, context,
  model: process.env.AGENT_MODEL,   // else the agent's recommendation, else the provider's first
  tools: simulator.tools,           // swaps the real tools for a simulator's, no table involved
  budget: {
    maxIterations: 10,              // the default, and the last net against a loop bug
    maxDurationMs: 30_000,
    maxTokens: 50_000,
    repetitionThreshold: 3,         // same call, same arguments, this many times in a row
  },
  landingInstruction: "Conclus maintenant avec ce que tu as.",
  now: () => Date.now(),            // injectable clock, so a duration bound is testable
});
```

The **first bound reached wins**. A bound that is not a finite number counts as unset, so `Number(process.env.SOMETHING_UNSET)` cannot silently disable the loop's safety net.

### Driving the loop yourself

`run()` is a `while` around a function you can call directly. Suspension is the primitive and the loop is the sugar (`ADR-AGENT-0003`), so a consumer that needs to interpose between two iterations, to ask for confirmation before a write for instance, drives it itself:

```ts
let state = agent.initialState("amène-moi aux réglages");
while (state.stopReason === undefined) {
  state = await agent.step(state);
  // inspect state.history, state.toolCalls, state.iterations between iterations
}
```

---

## Using the LLM layer (`./llm`)

The `./llm` subpath ships the LLM layer: the `LLMProvider` port, the `OllamaLLMProvider` adapter, the `PROVIDERS` registry with `resolveProvider`, and the LLM models. It has **no import-time side effect** (no disk, no `.env`): it reads only `process.env`.

### Quick start

```ts
import { OllamaLLMProvider, type Message } from "@a-world-felt/nathan-agent-core/llm";

// A provider is a vendor: it offers several models, and you name one per call.
const provider = new OllamaLLMProvider({
  models: [
    { id: "qwen2.5:0.5b", supportsTools: true },
    { id: "qwen2.5:7b", supportsTools: true, maxInputTokens: 32768 },
  ],
});

const messages: Message[] = [{ role: "user", content: "Bonjour !" }];

// One-shot completion → { content, toolCalls, usage? }.
const res = await provider.complete(messages, { model: "qwen2.5:0.5b" });
console.log(res.content); // the assistant text
console.log(res.usage);   // { tokensIn, tokensOut } | undefined

// Streaming → yields { contentDelta, done, usage? }; the terminal chunk carries usage.
for await (const chunk of provider.stream(messages, { model: "qwen2.5:0.5b" })) {
  process.stdout.write(chunk.contentDelta);
  if (chunk.done) console.log("\n", chunk.usage);
}
```

`OllamaLLMProvider`'s constructor takes `{ models, baseURL?, fetch? }`. `baseURL` defaults to `process.env.OLLAMA_HOST ?? "http://localhost:11434"`; `fetch` is injectable (the real global `fetch` in prod, a fake in tests). `complete` and `stream` take `{ model, tools? }`, where `tools` is the list of `ToolDefinition`s to present to the model on that call.

**Models are declared, never discovered** (`ADR-AGENT-0017`). The package queries no catalogue and checks no hardware: it reports what you declared, and `provider.models()` returns it synchronously. Two consequences worth knowing:

- Asking for a model you did not declare raises `LLMError("MODEL_NOT_FOUND")` **before any request**, listing what you did declare.
- Asking for one you declared but never installed gets the same code from Ollama's 404, with the `ollama pull` command to run.

Whether a model can call tools is declared per model, on `supportsTools`, because that is where it varies. Streaming is declared once per provider, by `supportsStreaming()`, because it is a property of the transport.

### The provider registry

For **env-driven** selection, the registry maps a typed provider id to a factory (a string key must be typed, no untyped lookup):

```ts
import { PROVIDERS, resolveProvider } from "@a-world-felt/nathan-agent-core/llm";

// Direct, typed access to a known provider:
const a = PROVIDERS.ollama(); // declares the single model named by OLLAMA_MODEL

// From a runtime string (e.g. an env var); throws LLMError("UNKNOWN_PROVIDER") on an unknown id:
const b = resolveProvider(process.env.LLM_PROVIDER ?? "ollama");
```

`PROVIDERS.ollama()` declares **one** model, `process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL`, read at call time. It is the environment-driven shortcut; offering several models is the explicit path, `new OllamaLLMProvider({ models: [...] })`. The library reads `process.env`; the consuming application loads its `.env`.

### Verifying a provider

Bringing your own provider? `./testing` ships a **runner-agnostic** conformance check: it runs the port's happy path and returns a report. It never throws on a failed check and never couples to a test runner: you assert on the result with whatever you use.

```ts
import { checkProviderContract } from "@a-world-felt/nathan-agent-core/testing";

const report = await checkProviderContract(provider);
if (!report.ok) console.error(report.checks.filter((c) => !c.ok));
```

---

## Setting up Ollama

`OllamaLLMProvider` talks to a local [Ollama](https://ollama.com) server over HTTP.

1. Install Ollama (see the official site).
2. Pull a model: `ollama pull qwen2.5:0.5b` (small, tool-capable, the default).
3. Ollama serves on `http://localhost:11434` by default.

Two environment variables configure the Ollama path:

| Variable | Default | Read by |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | `OllamaLLMProvider`'s `baseURL` when the constructor passes none |
| `OLLAMA_MODEL` | `qwen2.5:0.5b` | `PROVIDERS.ollama()` / `resolveProvider("ollama")` |

The library reads `process.env`; the consuming application loads its `.env` (e.g. via `dotenv` in its entry point). Nothing is read from disk on import.

---

## Configuration

**A library does not read a config file.** It reads `process.env`; it is the **consuming application** that loads its `.env` (e.g. via `dotenv` in its entry point). This package never loads a `.env` on import: doing so would inject variables into the consumer's `process.env`, which is not a library's role.

API keys and provider URLs therefore go **through the consumer's environment**, never hardcoded, never committed. The variables the LLM layer reads today are **`OLLAMA_HOST`** (default `http://localhost:11434`) and **`OLLAMA_MODEL`** (default `qwen2.5:0.5b`). See [Setting up Ollama](#setting-up-ollama).

---

## ⚠️ Security warning

**Command checking is not a security boundary.** It protects against accident, not against an adversary: with an LLM in the loop, a prompt injection can produce calls designed to bypass it. **Only a container is a security boundary.** A tool with broad access (disk writes, shell) must be isolated by the consumer. Rationale: `ADR-AGENT-0004`.

---

## Developing the package

> These commands are for **developing this package**, not consuming it. To use it in a project, see "Consumer-side setup" above.

```bash
npm run build       # tsc -p tsconfig.build.json → dist/
npm test            # node:test, zero dependencies
npm run typecheck   # tsc --noEmit
```

The build produces `dist/index.js` **and** `dist/index.d.ts`. ESM + `NodeNext` pitfall: relative imports carry the **emitted** file's extension, so `.js` even from a `.ts`: `import type { Message } from "./models/index.js"`.

---

## Going further

| Document | Contents |
|---|---|
| [ROADMAP.md](./ROADMAP.md) | the 4 versions and the target tree map |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | branches, commits, PRs, file/architecture/versioning conventions |
| [`docs/decisions/`](./docs/decisions) | the ADRs, the *why* of each choice |
| [`docs/plans/`](./docs/plans) | the V1 breakdown into 6 PRs |
