# @a-world-felt/nathan-agent-core

> **Current version: 0.1.0-alpha** (prerelease). The public API is not frozen yet; only the `.` entry point (the contract models) ships. See [ROADMAP.md](./ROADMAP.md).

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

Three subpaths, **opt-in**: an agent receives only what you pass it, nothing implicit.

| Subpath | Contents | State in `0.1.0-alpha` |
|---|---|---|
| `.` | engine, ports, types (**no disk access**, importable anywhere) | **available** (contract models) |
| `./tools` | generic file tools (coupled to `fs`, opt-in) | **coming** (PR2+) |
| `./testing` | test harness (fake provider, simulator, scenarios) | **coming** (PR5) |

> In `0.1.0-alpha`, only `.` resolves to code. `./tools` and `./testing` are declared in the `exports` map (the 3 entry points are a design choice, `ADR-AGENT-0002`) but their frameworks are still skeletons: **do not import them before the PRs that fill them in.**

### What `.` exports today

The **contract models**: pure types, no runtime dependency, that *are* the contract the implementations will honor:

- **LLM**: `Role`, `Message`, `ToolCall`, `ToolResult`, `Usage`, `LLMResponse`, `LLMErrorCode`, and the `LLMError` class.
- **Tools**: `JSONSchemaType`, `JSONSchemaProperty`, `ToolSchema`.

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

This import **compiles** and **runs** against `0.1.0-alpha`: it is the PR1 install verification.

---

## Configuration

**A library does not read a config file.** It reads `process.env`; it is the **consuming application** that loads its `.env` (e.g. via `dotenv` in its entry point). This package never loads a `.env` on import: doing so would inject variables into the consumer's `process.env`, which is not a library's role.

API keys and provider URLs therefore go **through the consumer's environment**, never hardcoded, never committed. The concrete variables (Ollama endpoint, etc.) arrive with the LLM port in PR2.

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
