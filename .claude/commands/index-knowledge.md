---
description: Review the current conversation, classify each insight, and route it to the right existing home — docs/modules/, docs/zacks-retail-manual/, docs/dev/specs/, docs/dev/plans/, docs/ARCHITECTURE.md, or docs/COMPANY.md. Auto-writes additively. Wraps writes in sandwich commits (snapshot-before-if-dirty + after-commit). Annotates staleness rather than overwriting. Hard cap of 10 files modified per run — above that, falls back to approval-gate.
---

# index-knowledge

Capture what has been learned in the current conversation and route each insight to the right existing home. Writes additively; annotates (never overwrites) for staleness; wraps writes in sandwich commits so the whole pass is cleanly revertible.

Invoked explicitly (`/index-knowledge`) or reached for by Claude when the operator asks to *gather / index / capture / save / distill / extract / route knowledge from a conversation* (see [`CLAUDE.md`](../../CLAUDE.md) "Conversational triggers").

Argument: `$ARGUMENTS`
- Empty → review the full current conversation, write within the 10-file cap.
- `--dry-run` → print the routing plan, don't write or commit.
- `--files <N>` → raise the auto-write cap (default 10). Above the cap, the command refuses to auto-write and reports the plan instead.
- `--scope module:<slug>` / `--scope manual` / `--scope architecture` / `--scope company` / `--scope spec` / `--scope plan` → narrow routing to one destination type; everything else becomes an orphan in the report.

Example: `/index-knowledge` • `/index-knowledge --dry-run` • `/index-knowledge --files 20` • `/index-knowledge --scope company`

## Destinations (routing map)

| Destination | What goes here |
|---|---|
| [`docs/modules/<slug>.md`](../../docs/modules/) | Module-pertinent **dev** knowledge: data sources, phase-gate state, dependencies, modernization decisions, technical quirks at the module boundary |
| [`docs/zacks-retail-manual/<slug>.md`](../../docs/zacks-retail-manual/) | **End-user-only** flows: cashier / buyer / manager steps, screen descriptions, keyboard shortcuts, error messages. **Never dev/code material** — no SQL, no schema, no adapter patterns, no commit discipline. |
| [`docs/dev/specs/<YYYY-MM-DD>-<topic>.md`](../../docs/dev/specs/) | Technical / design **decisions** — new file per decision, dated, records the *why* |
| [`docs/dev/plans/<YYYY-MM-DD>-<topic>.md`](../../docs/dev/plans/) | Implementation **plans** — dated, "steps to build X next" |
| [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) | Technical general — folder layouts, data flow, schemas, adapter layer, ETL, development processes. Updated in place. |
| [`docs/COMPANY.md`](../../docs/COMPANY.md) | Business / company general — chains, stores, categories, seasons, currency-at-business-level, goals. Updated in place. |
| **Orphan** (not written) | Flagged in the after-commit message; operator decides |

### Rules that make routing unambiguous

- **Manual is end-user-only.** A cashier / buyer / manager audience. Code, SQL, schema, adapter translation rules, commit discipline, testing, CI → **never** the manual. Route elsewhere or orphan.
- **ARCHITECTURE.md = technical system.** Data flow, schemas, adapter layer, ETL, folders, dev processes. **Not** module detail, **not** business facts.
- **COMPANY.md = business facts.** Who the company is, chains, stores, categories, seasons, goals. **Not** code, **not** architecture.
- **Decision ≠ Plan.** `dev/specs/` holds *why we chose A over B* (dated, archival). `dev/plans/` holds *steps to build A* (dated, actionable). A single topic can produce both.
- **Module-scoped** dev knowledge that doesn't fit `ARCHITECTURE.md` or a spec → the module's `docs/modules/<slug>.md`.
- When in doubt → **orphan**. Don't jam an insight into the nearest-looking file.

## Steps

1. **Preflight.**
   - `git branch --show-current` must return `master`.
   - Not in detached HEAD.
   - On failure, abort and report.

2. **Before-commit (sandwich layer 1).**
   - Run `git status --porcelain`. If non-empty, stage everything and commit:
     ```
     chore: snapshot before /index-knowledge
     ```
     This separates any pre-existing uncommitted work from the indexing writes so `git revert` of the after-commit is clean.
   - If the tree is already clean, skip.

3. **Review.**
   - Read the conversation turns end to end. Extract each **discrete insight** — a rule, a finding, a decision, a workflow, a data quirk, a naming convention, a dependency, a rejected approach.
   - Group small related insights; don't over-shard. One destination can receive multiple bullets.

4. **Classify.**
   - For each insight, pick **exactly one** destination from the routing map, or mark **Orphan**.
   - Apply the rules above. Bias toward fewer destinations and more orphans when uncertain — orphans get discussed later; bad routing lands forever.

5. **Staleness check.**
   - For each destination file that will be edited, scan for sections the new insight contradicts or supersedes.
   - **Do NOT overwrite.** Annotate the old content in place:
     ```
     > ⚠️ May be stale per YYYY-MM-DD /index-knowledge pass: <one-line reason>. Review and remove if confirmed.
     ```
   - The operator does the final delete later, manually, once they've confirmed the new state is correct.

6. **Cap check.**
   - Count distinct destination files. If > cap (default 10), **stop before writing**. Print the full routing plan as the report would look post-write. Operator either:
     - Re-invokes with `--files <larger>` to raise the cap, or
     - Re-invokes with `--scope <type>` to narrow, or
     - Breaks the conversation into sub-sessions and runs the command multiple times.

7. **Write.**
   - Apply additive edits to each routed destination.
   - New `dev/specs/` / `dev/plans/` files get a minimal header:
     ```markdown
     # <Topic>

     **Date:** <YYYY-MM-DD>
     **Source:** `/index-knowledge` pass — <one-line conversation summary>
     **Type:** <Design decision | Implementation plan>

     ## Context
     <why this came up>

     ## <Decision | Plan> sections
     ```
   - **Never auto-edit `CLAUDE.md`.** Edits to project instructions stay operator-authored. If a conversation produces something that belongs there, route as a `dev/specs/` file and let the operator promote.
   - Scan every write for `$` / `USD` / `en-US` currency formatter / `legacy/` references → reject if present.
   - New `COMPANY.md` additions about chains / stores / categories must match the existing structure (section headers, TBD placeholders) rather than introduce parallel sections.

8. **After-commit (sandwich layer 2).**
   ```
   docs(index): <summary of what moved where>

   Routed:
   - <destination>: <bullet>
   - <destination>: <bullet>

   Staleness flagged: <count or "none">
   Orphans: <count or "none">

   Source: /index-knowledge pass, <YYYY-MM-DD HH:MM>

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```
   - One distinct commit. `git revert <sha>` cleanly undoes the whole pass.

9. **Report.**

## Report format

```
## Knowledge index — <YYYY-MM-DD HH:MM>

### Scope
Conversation turns reviewed: <N>
Before-commit: <sha or "tree was clean">
After-commit:  <sha>
Cap:           <files-modified> / <cap>

### Routed additions
docs/modules/<slug>.md
  + <bullet>
  + <bullet>

docs/ARCHITECTURE.md
  + <bullet>

docs/COMPANY.md
  + <bullet>

docs/dev/specs/<YYYY-MM-DD>-<topic>.md (new)
  Created with <N> sections

### Staleness annotations
docs/modules/<slug>.md §<section> — annotated (superseded by <reason>)

### Orphan insights (not written)
- <insight> — reason: <no fitting destination>
- <insight> — reason: <scope unclear, operator to decide>
```

## Rules the command enforces

- **Branch = `master`.** No force operations, no branching.
- **No secrets in commits.** Scan staged diff for `password=`, `api_key=`, `secret_key=`, `AWS_SECRET`, `BEGIN PRIVATE KEY` before the after-commit. Abort if any match.
- **HNL currency** in generated content. No `$` / `USD` / `en-US` currency formatter ever.
- **No branches / PRs / worktrees** in generated content.
- **Never write to `legacy/`.** That folder is retired.
- **Never auto-edit `CLAUDE.md`.** Route as a `dev/specs/` entry for operator promotion.
- **Operator-neutral voice** in generated text: no "I" / "my" / "we decided" — factual, declarative.
- **Annotate for staleness, don't overwrite.** Information loss is worse than the clutter of an annotation.
- **Respect the 10-file cap by default.** Exceeding it means the command has likely over-classified and a human should look.

## Example invocations

- `/index-knowledge` — review this conversation, auto-write within the 10-file cap, sandwich commits.
- `/index-knowledge --dry-run` — print the plan, don't touch anything.
- `/index-knowledge --files 20` — raise the cap for an unusually broad session.
- `/index-knowledge --scope company` — only route business / company insights; everything else becomes an orphan.
- `/index-knowledge --scope architecture` — only route system-architecture insights.
