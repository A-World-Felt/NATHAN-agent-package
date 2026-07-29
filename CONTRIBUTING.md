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

**The package** is on **SemVer** (`version` in `package.json`) and published to the organization's **GitHub Packages registry**. Publication is **driven by the version field**, and the whole release fits in the PR: the only thing you do by hand is bump the number.

**Every PR that changes the public API bumps the version**, in the PR itself. While the package is in `0.x`, an addition to the public surface is a **minor** bump: a PR that ships a new port, a new entry point or a new exported class goes `0.1.0-alpha` to `0.2.0-alpha`. A PR that only touches documentation, tests or internals changes nothing.

1. Change `version` in `package.json`. Prereleases carry a suffix: `-alpha`, `-beta`, `-rc.1`.
2. Update **Current version** in `README.md`. The two must agree: a reviewer checks it, and a consumer reading a stale README installs a version that does not exist.
3. Commit: `chore: bump vX.Y.Z (JIRAID)`, **on the feature branch, inside the PR**. The reviewer therefore sees the version being shipped, in the diff, before it ships.
4. Merge. `.github/workflows/publish.yml` fires on `push: main`, reads the version, and stops there if a `vX.Y.Z` tag already exists. Otherwise it builds, publishes, and **then** tags the merge commit.
5. Consumers repoint their SemVer range (`^X.Y.Z`).

**Nobody creates a tag by hand.** The tag is a consequence of the publication, not its trigger, and it is what tells you later which commit a published version was built from: exactly what you need to cut a fix on top of a shipped release.

**One exception, and only one.** If a run publishes successfully but then fails to push its tag, the version exists in the registry with nothing pointing at it, and every later run would try to republish it and be refused. Repair that by tagging by hand the commit the run published. Never tag to *start* a release: that is what the bump is for.

**A merge that bumps nothing publishes nothing.** The tag lookup is the guard: same version as last time means the tag exists, and the workflow exits. So documentation or refactoring PRs merge without producing a release, and a PR that changes the public API publishes one, per the bump rule above.

**The tag is written after `npm publish`, never before.** A tag placed first would claim a version that never reached the registry, and the guard would then skip the retry forever. If publication fails, no tag is written, and the next merge tries again.

**Never tag a feature branch.** PRs land here with *Rebase and merge*, which replays the commits under new hashes, so a tag placed on a branch designates a lineage `main` never receives. The failure mode is not hypothetical: it is what happened on the first release attempt of this package. This is also why the workflow tags from `main` and not from the PR.

**Agents**, on the other hand, are **not** versioned by a field: an agent is a committed TypeScript file, the version is git, and "this version is good" is what the tests/evals prove. No `version` field, no runtime registry. See `ROADMAP.md` and `ADR-AGENT-0005`. Versioning a prompt is only worthwhile if the harness can **measure** that v2 beats v1.
