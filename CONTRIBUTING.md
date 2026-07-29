# Contribution conventions (nathan-agent-core)

Branches, commits and PRs. Three formats, one single principle: **the JIRA ID travels everywhere**, so that ticket ↔ code ↔ PR traceability rests on nobody's memory.

---

## 1. Branches

```
type/JIRAID-short-name
```

```
feat/DEV-194-package-initialisation
fix/DEV-207-stopreason-budget
docs/DEV-212-adr-tokenizer
```

| Segment | Rule |
|---|---|
| `type` | one from the list below, lowercase |
| `JIRAID` | JIRA key in UPPERCASE + number: `DEV-194` |
| `short-name` | 2 to 5 words, lowercase, dashes. Describes the *what*, not the *how*. |

**Types**, identical to the commit ones:

| Type | Usage |
|---|---|
| `feat` | new feature |
| `fix` | bug fix |
| `refactor` | restructuring without behavior change |
| `docs` | documentation, ADRs, schemas |
| `test` | tests or harness only |
| `chore` | tooling, dependencies, cleanup |
| `build` | build, packaging, CI |

**Rules**

- Never work directly on `main`. The only exception: the repository bootstrap commit, already done.
- One branch = one ticket. If scope overflows, open a second ticket rather than widening the branch.
- Branch deleted after merge.

---

## 2. Commits

```
type(scope): description (JIRAID)
```

```
feat(llm): add OllamaLLMProvider (DEV-194)
fix(agent): incorrect stopReason when the budget is reached (DEV-207)
docs(schema): fix the UML realization arrows (DEV-212)
build(ci): add the review workflow (DEV-201)
```

The ID is **at the end of the subject, in parentheses**. This placement keeps the `scope` for the technical domain (the useful information when reading history) while letting JIRA attach the commit to its ticket.

**Scopes**, the touched domain, aligned with the `src/` tree:

`llm` · `context` · `tools` · `agent` · `metrics` · `testing` · `schema` · `docs` · `ci`

The scope is optional when the change is cross-cutting: `chore: update dependencies (DEV-220)`.

**Rules**, taken from `.claude/commands/commit.md`:

- **Separate, logical commits.** One commit = one coherent change. Grouping a refactor and a fix in the same commit makes `revert` impossible.
- **Never `git add -A` or `git add .`**: stage files explicitly, one commit at a time.
- **Never `amend`** an existing commit.
- **No `Co-Authored-By` line.**
- Concise message, 1 to 2 lines. The body is reserved for the *why*, when it is not obvious.
- **No emoji.** The kitchen emojis from `C:\Marcel` are specific to that project and have no place here.

---

## 3. Pull requests

The `.github/workflows/claude-pr-description.yml` workflow **generates the title and body** when the PR is opened (the `opened` event), detecting the JIRA ID **from the branch name** (hence the importance of the §1 format). The convention below is the one this workflow applies: it is the source of truth for it.

Note: unlike commits (§2), the **PR title uses its own shape**. Commits stay `type(scope): description (JIRAID)`; the PR title is the one below.

**Title**:

```
{Type} : {Issue-ID} – {Short summary}
```

- `Type`: `Feature | Bugfix | Refactor | Docs | Chore | Hotfix`
- `Issue-ID`: detected from the branch. **If empty, the `{Issue-ID} – ` part is dropped. We invent nothing.**
- `Short summary`: one clear sentence fragment.
- **No emoji.**

**Body**, four sections, **included only when they add value**:

| Section | When to include it | Contents |
|---|---|---|
| **Changes** | always | concise bullet list (6 max) of what changed |
| **How to test** | except for pure config/chore/docs PRs with nothing to test | 2 to 4 bullets, each = *where to go + what to do + what to verify* (happy path + one edge case if relevant). The PR completion criterion is in `docs/plans/2026-07-21-v1-decoupage-pr.md` for each of the six V1 PRs; refer to it |
| **Architecture** | only if the PR introduces or changes a meaningful flow (new service wiring, new route, new pipeline, new component interaction) | a small Mermaid diagram (`flowchart LR` for data/call flows, `sequenceDiagram` for request/response), max 8 nodes. No diagram for UI-only or trivial changes |
| **Impact** | only if there is a breaking change, a new dependency, or a migration step | a barrel contract break (`barrel-contract.test.ts`) is **always** an Impact |

**What the contributor therefore does before opening the PR**: name the branch correctly (§1, so the ID is detected) and check the PR completion criterion. The workflow writes the rest.

---

## 4. Traceability

```
JIRA ticket  →  branch  →  commits  →  PR  →  ADR (if decision)
   DEV-194      feat/DEV-194-…    (DEV-194)    (DEV-194)    ADR-AGENT-00XX
```

This is the same scheme as the rest of the project (`PMC/CONTEXT-AGENT.md` §10.3), applied to code.

---

## 5. Code conventions

### 5.1 Files

- **Strict TypeScript**: no `any` without a comment that justifies it.
- Files in **`kebab-case.ts`**; ports in **`IPascalCase.ts`** (`ILLMProvider.ts`, `IContextProvider.ts`).
- **One `index.ts` barrel per layer.** Consumers (internal and external alike) import **from the barrel**, never from an individual file.
- **Barrel contract tests** (`barrel-contract.test.ts`): they lock the public API. An export removed by mistake breaks a test, not a consumer.
- `models/`: types only, no runtime dependency, no SDK import.
- Simple, readable code; comment non-obvious logic (prompts, transformations). No sophisticated generics for a single case.
- ESM + `NodeNext` pitfall: relative import with the **emitted** file's extension, so `.js` even from a `.ts`: `import type { Message } from "./models/index.js"`.

### 5.2 Architecture

Hexagonal: ports and adapters, strict separation. The domain imposes it (six ports, about fifteen implementations). The per-file placement rule, the layer pattern common to the six frameworks, the class/function distinction and the ban on the runtime registry are detailed in:

> **[`docs/conventions/architecture.md`](./docs/conventions/architecture.md)**: to read before creating a file or moving code.

The *why* is in the ADRs (`docs/decisions/`), in particular `ADR-AGENT-0001`, `-0002`, `-0009`, `-0005`.

### 5.3 Versioning

Two versionings not to be confused.

**The package** is on **SemVer** (`version` in `package.json`) and published to the organization's **GitHub Packages registry**. Publication is **tag-driven**: pushing a `v*` tag triggers `.github/workflows/publish.yml`, which builds and runs `npm publish`. Release protocol:

1. Change `version` in `package.json` (e.g. `0.1.0-alpha` → `0.1.0`, then `0.1.0` → `0.2.0`). Prereleases carry a suffix: `-alpha`, `-beta`, `-rc.1`.
2. Update **Current version** in `README.md`.
3. Commit: `chore: bump vX.Y.Z (JIRAID)`.
4. Tag and push the tag: `git tag vX.Y.Z`, then `git push origin main --tags`.
5. CI (`publish.yml`) detects the `v*` tag, builds, and publishes to the registry. Consumers repoint their SemVer range (`^X.Y.Z`).

**Merging into `main` publishes nothing**: only pushing a `v*` tag triggers publication. By convention, the bump and the tag happen on `main` (a release is cut from `main` after merging). `publish.yml` must therefore be present on `main`.

**Agents**, on the other hand, are **not** versioned by a field: an agent is a committed TypeScript file, the version is git, and "this version is good" is what the tests/evals prove. No `version` field, no runtime registry. See `ROADMAP.md` and `ADR-AGENT-0005`. Versioning a prompt is only worthwhile if the harness can **measure** that v2 beats v1.
