# Commit scoping when the index has unrelated staged work

**Date:** 2026-04-23
**Source:** `/index-knowledge` pass — lesson from a botched `git commit` during the report chrome session
**Type:** Design decision (git workflow)

## Context

During the report-chrome foundation commit, a working tree with ~100 files pre-staged by a prior operator session got swept into a single commit along with the intended nine-file foundation. The commit message described the nine files accurately and attributed ~100 operator-authored files to it.

The mistake: `git add <specific files>` appends those files to the index without removing whatever was there before. `git commit` with no path argument then commits **every staged file** — not just the ones the current session added.

Status at the time had `MM` (both staged and unstaged modifications) on six of the nine target pages, which is how a prior session's staged edits surface in a new session's view: they look like just another pending change.

## Decision

Two discipline rules for multi-agent sessions against a shared working tree:

### 1. Prefer `git commit <paths>` over `git add <paths>` + `git commit`

`git commit <pathspec>` commits **only** the paths named, regardless of what else is in the index. Other staged entries stay staged, untouched by the commit.

```bash
# Safe — commits only the listed files even if 100 others are staged
git commit apps/web/src/utils/reportFormatters.ts \
           apps/web/src/components/reports/ReportHeader.tsx \
           -m "..."

# Unsafe — commits EVERY staged file in the index
git add apps/web/src/utils/reportFormatters.ts apps/web/src/components/reports/ReportHeader.tsx
git commit -m "..."
```

For **new files** (not yet tracked), `git commit <pathspec>` still works — it stages and commits them in one step — as long as they exist on disk.

### 2. When a file has both yours and someone-else's changes, surgical split via checkpoint

For a file where the working tree contains a mix of this session's edits + another session's edits (e.g. `MM` state), the cleanest path is:

```bash
# 1. Checkpoint the combined state
cp apps/web/src/App.tsx /tmp/App.combined.tsx

# 2. Revert to HEAD
git show HEAD:apps/web/src/App.tsx > apps/web/src/App.tsx

# 3. Re-apply ONLY this session's edits (manual edits or a saved patch)
# ... edit App.tsx to add just the two lines this session needed ...

# 4. Commit the scoped version
git commit apps/web/src/App.tsx -m "..."

# 5. Restore the combined state so the other session's work is back in the working tree
cp /tmp/App.combined.tsx apps/web/src/App.tsx
```

The other session's changes are restored to the working tree (unstaged) after the commit. They're preserved — just not part of this commit.

## Why not `git add -p`

`git add --patch` is the canonical tool for selecting hunks, but it's interactive and doesn't run reliably from a non-interactive shell. The checkpoint-and-re-edit approach works without TTY assumptions.

## Why not `git stash`

`git stash push <path>` would also work but restores the full stashed state, including staged hunks. The checkpoint approach is more explicit about what's being preserved versus discarded at each step.

## Related

- Commit `f5cd374` — the botched foundation commit that triggered this note (109 files, 9,704 insertions — should have been 9 files, ~340 insertions).
- Commit `9431916` — the Report Viewer commit, which used the checkpoint approach on `App.tsx` and came out clean (4 files, 644 insertions).
- Not a promotion candidate for `CLAUDE.md`'s HARD RULES — this is a workflow preference, not a correctness rule. If operators find the pattern valuable across sessions, it could move to `WORKFLOW.md` instead.
