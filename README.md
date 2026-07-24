# @a-world-felt/nathan-agent-core

> **Current version: 0.1.0-alpha** (prerelease). The public API is not frozen yet; the `.`, `./llm`, and `./testing` entry points ship (`./tools` is still coming). See [ROADMAP.md](./ROADMAP.md).

A **reusable** LLM agentic engine: the **engine** (LLM providers, tools, loop, memory), the **agent definitions** (prompt + tools), and an **agent test harness**. Provider-agnostic **and** application-agnostic: **the consumer repo chooses its provider and brings its own tools**. It plugs into any Node/TypeScript project.

The reasoning behind each design choice is in [`docs/decisions/`](./docs/decisions) (the ADRs).

- **Pure ESM** (`"type": "module"`, `NodeNext`). Node ≥ 18.
- **Private, restricted package** (`@a-world-felt`). Repo: `A-World-Felt/NATHAN-agent-package`.

---

## Installation

The package is consumed as a **git dependency by tag**: npm clones the repo, reads its `package.json` and resolves it under the scoped name. **No npm token required**: authentication goes through git (SSH, or HTTPS with a GitHub token that has access to the private repo). npm runs the `prepare` (`tsc` build) at install time.

```bash
npm i github:A-World-Felt/NATHAN-agent-package#v0.1.0-alpha
```

In the consumer's `package.json`, the dependency key is the **scoped name**; the value is the git spec:

```json
{
  "dependencies": {
    "@a-world-felt/nathan-agent-core": "github:A-World-Felt/NATHAN-agent-package#v0.1.0-alpha"
  }
}
```

You pin a **version** via the tag (`#vX.Y.Z`); to repoint, change the tag (see the versioning convention in [CONTRIBUTING.md](./CONTRIBUTING.md)).

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

| Subpath | Contents | State in `0.1.0-alpha` |
|---|---|---|
| `.` | engine, ports, types (**no disk access**, importable anywhere) | **available** (contract models) |
| `./llm` | LLM layer: the `LLMProvider` port, `OllamaLLMProvider`, the `PROVIDERS` registry + `resolveProvider`, and the LLM models | **available** |
| `./tools` | generic file tools (coupled to `fs`, opt-in) | **coming** (PR2+) |
| `./testing` | test harness: `FakeLLMProvider` + `checkProviderContract` (simulator, scenarios coming) | **available** (`FakeLLMProvider`, `checkProviderContract`) |

> In `0.1.0-alpha`, `.`, `./llm`, and `./testing` resolve to code; `./tools` is declared in the `exports` map (the entry points are a design choice, `ADR-AGENT-0002`) but its file tools are still a skeleton: **do not import `./tools` before the PR that fills it in.**

### What `.` exports

`.` re-exports the full `./llm` engine barrel plus `ToolResult`. The umbrella entry point carries everything the LLM layer offers (importing from `./llm` gives the same surface standalone). It exposes:

- **Models** (pure types): `Role`, `Message`, `ToolCall`, `ToolDefinition`, `ToolResult`, `Usage`, `LLMResponse`, `LLMChunk`, `LLMErrorCode`, and the JSON-Schema types `JSONSchemaType`, `JSONSchemaProperty`, `ToolSchema`.
- **Engine**: the `LLMProvider` port, `OllamaLLMProvider`, the `PROVIDERS` registry and `resolveProvider`, and the `LLMError` class.

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

## Using the LLM layer (`./llm`)

The `./llm` subpath ships the LLM layer: the `LLMProvider` port, the `OllamaLLMProvider` adapter, the `PROVIDERS` registry with `resolveProvider`, and the LLM models. It has **no import-time side effect** (no disk, no `.env`): it reads only `process.env`.

### Quick start

```ts
import { OllamaLLMProvider, type Message } from "@a-world-felt/nathan-agent-core/llm";

const provider = new OllamaLLMProvider({ model: "qwen2.5:0.5b" });

const messages: Message[] = [{ role: "user", content: "Bonjour !" }];

// One-shot completion → { content, toolCalls, usage? }.
const res = await provider.complete(messages);
console.log(res.content); // the assistant text
console.log(res.usage);   // { tokensIn, tokensOut } | undefined

// Streaming → yields { contentDelta, done, usage? }; the terminal chunk carries usage.
for await (const chunk of provider.stream(messages)) {
  process.stdout.write(chunk.contentDelta);
  if (chunk.done) console.log("\n", chunk.usage);
}
```

`OllamaLLMProvider`'s constructor takes `{ model, baseURL?, supportsTools?, fetch? }`. `baseURL` defaults to `process.env.OLLAMA_HOST ?? "http://localhost:11434"`; `fetch` is injectable (the real global `fetch` in prod, a fake in tests). `complete(messages, tools?)` and `stream(messages, tools?)` optionally take a list of `ToolDefinition`s to present to the model.

### The provider registry

For **env-driven** selection, the registry maps a typed provider id to a factory (a string key must be typed, no untyped lookup):

```ts
import { PROVIDERS, resolveProvider } from "@a-world-felt/nathan-agent-core/llm";

// Direct, typed access to a known provider:
const a = PROVIDERS.ollama(); // OllamaLLMProvider built from OLLAMA_MODEL

// From a runtime string (e.g. an env var); throws LLMError("UNKNOWN_PROVIDER") on an unknown id:
const b = resolveProvider(process.env.LLM_PROVIDER ?? "ollama");
```

`PROVIDERS.ollama()` builds the provider from `process.env.OLLAMA_MODEL` (falling back to `qwen2.5:0.5b`). The library reads `process.env`; the consuming application loads its `.env`.

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
