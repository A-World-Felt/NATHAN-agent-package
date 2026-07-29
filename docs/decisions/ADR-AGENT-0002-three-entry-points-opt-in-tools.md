# ADR-AGENT-0002: Three entry points, opt-in tools

- **Status**: ✅ Accepted
- **Date**: 2026-07-21
- **Deciders**: Arthur-Olivier Fortin
- **Scope**: `@a-world-felt/nathan-agent-core`

## Context

The package ships three kinds of code that do not share the same constraints:

| Kind | Constraint |
|---|---|
| Engine (ports, loop, `defineAgent`) | must be importable everywhere, including where there is no disk |
| Generic file tools | coupled to `fs` |
| Test harness | must **never** end up in a production bundle |

Explicit team decision: "tools can be added from the consumer repo. The package may provide generic ones, but they are not tools that are always present."

If everything comes out of a single barrel, importing the package just to read a type drags `fs` and the test code along with it.

In-house precedent: an in-house package already published to the same registry has only one `exports` branch. An in-house Next.js application, for its part, already separates `llm/index.ts` from `llm/server.ts` with an `import "server-only"` guard: the instinct exists.

## Options considered

**A: A single barrel.**
The simplest to write. Drags `fs` and the harness everywhere; makes any non-Node execution impossible.

**B: Three subpaths in the `exports` map.**
`.`, `./tools`, `./testing`. A single publication unit, three surfaces.

**C: Three separate npm packages.**
Maximum separation. Three versions to keep in sync, three publications, for a single-maintainer project. Disproportionate overhead.

## Decision

**Option B.**

```json
"exports": {
  ".":         { "types": "./dist/index.d.ts",                      "default": "./dist/index.js" },
  "./tools":   { "types": "./dist/tools/infrastructure/index.d.ts", "default": "./dist/tools/infrastructure/index.js" },
  "./testing": { "types": "./dist/testing/index.d.ts",              "default": "./dist/testing/index.js" }
}
```

- `.`: engine, ports, `defineAgent`, types. **No disk access.**
- `./tools`: the generic tools provided. Opt-in.
- `./testing`: simulator, fake provider, scenarios.

`Tool` and dispatch stay in `.`: everyone needs them. Only the concrete tool **implementations** move to `./tools`.

An agent receives exactly the tools it is handed. **Nothing implicit.**

## Consequences

**Positive**

- The main entry point stays light and portable.
- The harness cannot end up in production by accident.
- The consumer chooses its tools the way it chooses its provider: the same philosophy on both axes.

**Negative**

- An `exports` map to maintain: a new subpath is a public-API change.
- A deviation from that in-house precedent, whose map has only one branch. Documented in `CLAUDE.md`.
- The barrel-contract tests must cover all three branches, not one.

**Known risk**

The file tools couple `./tools` to Node. Since NATHAN's IDE is Electron or Tauri, Node is present. If a consumer ever had to run in a browser, `./tools` would break on import, but `.` would stay sound. That is precisely what this separation protects.
