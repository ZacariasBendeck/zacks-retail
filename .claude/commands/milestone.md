---
description: Lean milestone ceremony — preflight, write milestone doc, commit all working-tree changes with a structured message, tag, push to origin/master. Takes a kebab-case label as $ARGUMENTS. No interactive pauses. Remote-affecting.
---

# milestone

Record a project milestone. Ritual stages: preflight → gather context → write milestone doc → update `PROJECT_STATUS.md` → commit → tag → push.

Argument: `$ARGUMENTS` = kebab-case label. Required. Example: `/milestone rics-mirror-live`.

No flags, no pauses. The operator's invocation is the authorization — run end-to-end unless a preflight check fails.

## 1. Preflight (abort on any failure)

- `git branch --show-current` must return `master`. Project commits direct to `master` — no branches.
- `$ARGUMENTS` must match `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (lowercase, digits, hyphens; no leading/trailing hyphen; no spaces).
- Tag `milestone-<YYYY-MM-DD>-<label>` must not already exist (`git tag -l`).
- Scan modified + untracked files. If any filename ends in `.env` / `.env.local` or matches `apps/*/.env`, abort. Grep the working-tree diff for `password=`, `api_key=`, `secret_key=`, `AWS_SECRET`, `BEGIN PRIVATE KEY`; if any match lands in a staged or about-to-stage file, abort.
- Working tree must have at least one change (modification, addition, or deletion). An empty milestone is a no-op — abort with "nothing to record."

## 2. Gather context

- **Previous milestone tag:** `git tag -l 'milestone-*' --sort=-creatordate | head -1`. If none, use `rics-baseline-pre-postgres`.
- **Commits since:** `git log <prev-tag>..HEAD --oneline` — capture subjects.
- **New migrations:** list folders matching `apps/api/prisma/migrations/YYYYMMDDHHMMSS_*/` that are untracked or newly created since the previous tag.
- **Working tree surface:** `git status --short` — list modified, added, deleted files. Group by top-level directory for the summary.
- **Current phase:** read the Rollout-Phases section of `CLAUDE.md`. Default is **A** if unclear. Infer shifts (A → B → C) from which schemas hold which data (empty `app.*` = still Phase A; populated module-owned schemas = Phase B or later).

## 3. Write the milestone doc

At `docs/dev/milestones/<YYYY-MM-DD>-<label>.md`:

```markdown
# Milestone: <label>

**Date:** <YYYY-MM-DD>
**Tag:** `milestone-<YYYY-MM-DD>-<label>`
**Phase:** <A | B | C>
**Previous milestone:** `<previous tag>`

## What shipped

<3–8 bullets synthesized from the git log since the previous tag AND the working-tree additions. Group by area if helpful:>
- **Sync / ETL:** <...>
- **Schemas / migrations:** <migration names>
- **Docs:** <...>
- **Commands:** <...>

## Next

<one line — the concrete next step, inferred from current state or left as "TBD: operator to update">

## Notes

<any carry-forward items from the previous milestone doc that remain open; one line each>
```

Keep it tight. If the previous milestone was `rics-baseline-pre-postgres`, reference it as a plain tag rather than a doc link.

## 4. Update `docs/PROJECT_STATUS.md`

If the file doesn't exist, create it:

```markdown
# Zack's Retail — Project Status

**Latest milestone:** [<label>](dev/milestones/<YYYY-MM-DD>-<label>.md) — <date>
**Tag to check out:** `milestone-<YYYY-MM-DD>-<label>`
**Current phase:** <A | B | C>
**Next:** <one line from the milestone doc>

## Milestone history

- [<label>](dev/milestones/<YYYY-MM-DD>-<label>.md) — <date> — <one-line summary>
```

If it exists, update the top block (latest milestone / tag / phase / next) and prepend a row to Milestone history.

## 5. Stage + commit

- Stage everything: `git add -A`. Preflight stage 1 already ruled out secrets, so this is safe.
- Commit using HEREDOC:

```
chore(milestone): <label> — <one-line summary from milestone doc>

Phase: <A | B | C>

Shipped:
- <3–5 most significant bullets from the milestone doc>

Migrations:
- <list, or "none">

Next: <one line from milestone doc>

See: docs/dev/milestones/<YYYY-MM-DD>-<label>.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## 6. Tag

Annotated tag, no lightweight:

```
git tag -a milestone-<YYYY-MM-DD>-<label> -m "Milestone: <label>"
```

## 7. Push

```
git push origin master
git push origin milestone-<YYYY-MM-DD>-<label>
```

**Never `--force`.** If either push fails, print the error and stop — do not retry. The commit and tag remain locally; operator investigates.

## 8. Report

```
Milestone recorded — <label>

Commit: <short SHA>  <subject>
Tag:    milestone-<YYYY-MM-DD>-<label>
Push:   origin/master + tag
Doc:    docs/dev/milestones/<YYYY-MM-DD>-<label>.md

Next: <one line>
```

## Rules (brief)

- `master` only. No branches. No force-push. Never.
- No `.env` or secret-patterns in commits.
- No tag collisions — abort if tag exists.
- No interactive pauses — invocation is authorization.
- Empty working tree → abort.

## Example

- `/milestone rics-mirror-live`
- `/milestone products-phase-b-cutover`
