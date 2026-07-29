---
name: cycle
description: Plan-driven dev loop for nathan-agent-core. Walks an implementation plan task by task, dispatching a builder then an independent judge per task, retrying on request_changes (max 2), and stopping at a reviewed, committed branch, ready for the human to push and open the PR. Never merges.
user-invocable: true
---

# Development Cycle: nathan-agent-core

You are the **orchestrator**. You do **NOT** build or review yourself: you spawn a subagent for each phase and route on its verdict. Adapted from an in-house Next.js application's cycle for this **headless TypeScript library**: no issue-picking, no UI verifiers, no auto-merge. The unit of work is a **Task in an implementation plan** (`docs/plans/…`), not a GitHub issue.

**Companion:** brainstorming happens in the main thread (superpowers:brainstorming), the plan is written with superpowers:writing-plans. `/cycle` executes an existing plan.

## Inputs

- **Plan path**: e.g. `docs/plans/2026-07-22-dev-194-llm-port.md`.
- **JIRA id**: e.g. `DEV-194` (commit trailers).

If not given, ask for the plan path once, then read it to get the JIRA id from its header.

## Step 0: Preconditions

```bash
git branch --show-current      # a feature branch: type/JIRAID-name, NOT main/development/release/*
git status --short             # should be clean (or only the plan file)
```
- Wrong branch (main/development/release) → **STOP**: "Create/checkout the feature branch first."
- Dirty tree with unrelated changes → **STOP** and surface them.

Read the plan fully. Extract the ordered list of **Tasks** and, for each, the ADRs it references.

## Step 1: For each Task, in order

### 1a. Build: dispatch `builder`

```
Agent(
  subagent_type="builder",
  prompt="Implement <Task N> of the plan at <plan path> for <JIRA id>.
You are on branch <branch>. Read .claude/CLAUDE.md and the ADRs the task references first.
Follow the task's TDD steps verbatim, run the gates, make the task's commit(s). Do NOT push or merge.
Return your verdict JSON."
)
```

Route on the returned verdict:
- `status: "committed"`, all gates pass → **1b**.
- `status: "blocked"` or `"failed"` → **STOP**. Surface the reason to the user; do not improvise a fix.

### 1b. Review: dispatch `judge`

```
Agent(
  subagent_type="judge",
  prompt="Review <Task N> of the plan at <plan path> for <JIRA id>, just committed on branch <branch>.
Run Stage 1 (plan/ADR compliance + structural placement) then Stage 2 (sandbox gates + quality).
Sandbox output is mandatory. Return your strict verdict JSON."
)
```

Route on `verdict`:
- `approved` → next Task (back to 1a).
- `request_changes` → **1c**.
- `rejected` → **STOP**, paste the verdict for the user to decide.
- Missing/empty sandbox block → the verdict is invalid; **re-dispatch judge** once.

### 1c. Fix: dispatch `builder` (retry, max 2 per Task)

```
Agent(
  subagent_type="builder",
  prompt="Address the judge's request_changes on <Task N> (plan <plan path>, <JIRA id>), branch <branch>.
Fix every blocking and important issue below. Re-run all gates. Commit the fix. Do NOT push or merge.
Judge verdict: <paste the verdict JSON>.
Return your verdict JSON."
)
```

Then back to **1b** (re-judge). After **2** `request_changes` rounds on the same Task → **STOP**: paste the latest verdict, let the user decide (amend the plan? an ADR conflict? take over manually?).

## Step 2: Finish (no merge)

When every Task is `approved`:

```bash
npm run typecheck && npm test && npm run build     # one clean full-suite pass
git log --oneline <base>..HEAD                     # show the task commits
```

Delete any stray untracked probe files you created while orchestrating (explicit paths only: never `git clean`, never a tracked or `.env`/`_jira-scratch`/`dist` path).

Then **STOP and hand off**, do not push, do not open a PR:

```
Plan <plan path> complete: <N> tasks, all judge-approved, full suite green.
Commits on <branch>:
  <oneline list>
Ready for you to push and open the PR (your teammates review). For the real-Ollama check, run the gated integration test with Ollama up: OLLAMA_INTEGRATION=1 npm test, then paste its output into the PR.
```

## Rules

- **Never build or review yourself**: `Agent()` for every phase.
- **One Task per builder→judge round.** Per-task review, not per-feature.
- **Max 2 fix retries per Task**, then stop for the human.
- **Never merge, never push.** The loop ends at a reviewed, committed branch; the human opens the PR (branch-protection + teammate review is the team's gate).
- **Judge verdict must include sandbox output**: re-dispatch if missing.
- The builder and judge are **independent**: never pass the builder's reasoning to the judge as justification; the judge reviews the code and the plan, not intent.
- A plan-vs-ADR conflict (`spec_defect` from the judge) → stop and fix the **plan/ADR** with the user, not the code.

## Summary

```
/cycle <plan> <JIRA id>
  ├─ preconditions: feature branch, clean tree, read plan + ADRs
  └─ for each Task, in order:
       ├─ Agent(builder) → TDD steps, gates, commit → verdict
       │     └─ blocked/failed → STOP, surface
       ├─ Agent(judge)   → Stage 1 plan/ADR/placement → Stage 2 sandbox + quality → verdict
       │     ├─ approved         → next Task
       │     ├─ request_changes  → Agent(builder) fix + re-judge (max 2)
       │     └─ rejected         → STOP
       └─ after 2 request_changes → STOP for the user
  finish: one clean full-suite pass, list commits, HAND OFF (no push, no merge)
```
