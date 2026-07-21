---
mode: 'agent'
description: 'Commit pending changes as separate, logical commits without Co-Authored-By'
---

**Instruction for the agent:**

Analyze all pending changes (staged, unstaged, and untracked) and create separate, logical commits. Do NOT add a `Co-Authored-By` line.

### Steps

1. Run these commands to understand the current state:
```bash
git status
git diff --name-only
git diff --name-only --cached
git ls-files --others --exclude-standard
git log --oneline -5
```

2. Read changed files and diffs to understand the intent of each change.

3. Group related files into logical commits. Each commit should represent one coherent change (e.g., one refactor, one feature, one fix).

4. For each commit, in order:
   - Stage only the relevant files with `git add <file1> <file2> ...`
   - Commit with a conventional commit message (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`)
   - Do NOT include `Co-Authored-By`

5. Run `git status` after all commits to verify everything is clean.

### Rules

* Never use `git add -A` or `git add .`
* Never amend existing commits
* Keep commit messages concise (1-2 lines)
* Follow conventional commits format
* Separate unrelated changes into distinct commits
