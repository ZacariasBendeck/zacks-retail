---
description: Search the working tree for SQLite references (code, scripts, docs, comments) and rewrite each one to its Postgres equivalent — or flag it for removal if no Postgres equivalent exists. Complements `/postgres-only` (which audits read-only) by actually performing the migration edits.
---

# purge-sqlite

`/postgres-only` restates the rule and audits. **This command applies the fix.**

Every reference to SQLite — whether a `db.prepare(...)` call, an `import` from the legacy `db/database.ts`, a comment that describes the SQLite path as authoritative, or a doc sentence that presents SQLite as a current data source — is wrong and must be rewritten to the Postgres-backed equivalent. Per [`CLAUDE.md`](../../CLAUDE.md) HARD RULE:

> Every new feature built on Zack's Retail from 2026-04-23 writes **exclusively to Postgres**.

The backlog from before that date is still present in the tree — this command works through it.

Argument: `$ARGUMENTS`
- Empty → scan the whole repo, report findings, apply fixes within the **5-file cap** (see below).
- A path (file or directory, e.g. `apps/api/src/services/salesService.ts`, `apps/api/scripts/`) → scope the scan and fix to that path.
- `--dry-run` → scan and report only; make no edits. Always safe to run first.
- `--docs-only` → only rewrite markdown / comment references; don't touch runtime code. Use when code paths are complex and need a human.
- `--code-only` → only rewrite runtime code; leave docs for a follow-up pass.

Example: `/purge-sqlite --dry-run` • `/purge-sqlite apps/api/src/services/salesService.ts` • `/purge-sqlite --docs-only`

## The narrow exception

The legacy `ref_*` dimension tables (`ref_colors`, `ref_color_families`, `ref_brands`, `ref_categories`, `ref_heel_types`, `ref_size_labels`, `ref_size_types`, `ref_patterns`, `ref_occasions`, `ref_occasions`) are the one category that stays on SQLite until their own migration tickets land. References to these tables are NOT drift yet — leave them alone unless the operator explicitly asks to migrate one. Anything else on SQLite is backlog.

If in doubt, ask before rewriting.

## What gets scanned

### Code (`--code-only` + default)

| Pattern | File globs | Meaning |
|---|---|---|
| `getDb()` | `apps/api/src/**/*.ts`, `apps/api/tests/**/*.ts`, `apps/api/scripts/**/*.ts` | Call to the SQLite handle. Must be replaced with `prisma` from [`apps/api/src/db/prisma.ts`](../../apps/api/src/db/prisma.ts). |
| `from ['"].*db/database['"]` | same | Import of the SQLite module. Remove. |
| `better-sqlite3` | package.json files, code | Direct use of the driver. Code uses → remove; package.json entry stays until every `getDb()` is gone. |
| `db\.prepare\(`, `db\.exec\(`, `db\.transaction\(` | same | Prepared statements / exec / tx on the SQLite handle. Replace with the Prisma client method; functions likely become async. |
| `resetDb\(`, `initializeDb\(` | tests, scripts | SQLite test fixtures. Replace with `await prisma.<model>.deleteMany({})` + `await prisma.$disconnect()`. |
| `CREATE TABLE .* IF NOT EXISTS` inside [`apps/api/src/db/database.ts`](../../apps/api/src/db/database.ts) | that file only | Delete outright (not commented). If the table has migrated, the Postgres migration owns it now. |
| `*Row` types + `rowTo*()` helpers | `apps/api/src/models/*.ts` | Row-shape + mapper for a migrated SQLite table. Delete; consumers read Prisma models directly. |
| `message.includes('UNIQUE constraint')`, `SQLITE_CONSTRAINT`, `.code === 'SQLITE_` | code | SQLite-specific error sniffing. Replace with `err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'` (or the appropriate Prisma code). |
| `.db` file references (`rics.db`, `admin.db`, `app.db`, etc.) | scripts, comments, docs | Hardcoded paths to SQLite files. Replace with Postgres connection references (`DATABASE_URL`, `prisma`). |

### Scripts (`--code-only` + default)

Everything under [`apps/api/scripts/`](../../apps/api/scripts/) and the repo root. ETL/seed/one-off scripts often open a SQLite file directly via `better-sqlite3` or `Database()`. Those scripts need to be rewritten against Postgres, or replaced with a `prisma.*` script under [`apps/api/scripts/seeds/`](../../apps/api/scripts/seeds/). If a script **must** still open a SQLite file (e.g. one-shot migration tool), rename it to include `-legacy` in the filename and add a comment block explaining why it's exempt.

### Docs and comments (`--docs-only` + default)

Grep `docs/`, `.claude/`, and code comments for:

- `SQLite` (case-insensitive)
- `sqlite`
- `better-sqlite3`
- `getDb()`
- `apps/api/src/db/database.ts`
- `.db` file references
- Phrases like "stored in SQLite", "SQLite table", "the admin DB", "frozen SQLite read-store"

Per-match decision:
- **Describes current state wrongly** (e.g. "the admin DB holds ref_colors") → rewrite to match actual current state. If the table has migrated to Postgres, say so; if it hasn't, the `ref_*` exception applies and the sentence is correct — leave it.
- **Historical / lineage** (e.g. "was originally on SQLite, migrated in 2026-04-23 commit X") → leave. Accurate history.
- **Instructional** (how-to that tells a developer to open SQLite) → rewrite to the Prisma equivalent.
- **Ambiguous** → annotate with the staleness marker (`> ⚠️ May be stale per YYYY-MM-DD /purge-sqlite pass: <reason>`), don't delete. Operator reviews later.

Never auto-edit `CLAUDE.md` — route a dated spec entry under [`docs/dev/specs/`](../../docs/dev/specs/) for operator promotion instead.

## Per-fix migration checklist

When rewriting a SQLite service/route/test, tick through (same list as [`/postgres-only`](./postgres-only.md) — kept in sync here for when the command runs standalone):

- [ ] Prisma model exists for the target table (usually in the `app` schema). Add it if missing.
- [ ] Migration SQL written under `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql` if the table shape is new. If the data already existed in SQLite, the migration must include the backfill (or be paired with a seed script that runs once).
- [ ] Applied via `pnpm exec prisma migrate deploy` (never `migrate dev` — `rics_mirror` trips the shadow DB).
- [ ] Prisma client regenerated via `pnpm exec prisma generate`. Stop the dev server first (DLL lock → `EPERM`).
- [ ] Every `db.prepare(...)` / `db.exec(...)` / `db.transaction(...)` replaced with the Prisma client API. Functions that touched SQLite become async.
- [ ] Routes become `async`; every service call is `await`ed.
- [ ] SQLite error sniffing rewritten to `Prisma.PrismaClientKnownRequestError`.
- [ ] SQLite `CREATE TABLE` + indexes for the migrated table **deleted** (not commented) from [`apps/api/src/db/database.ts`](../../apps/api/src/db/database.ts).
- [ ] Legacy `*Row` types and `rowTo*()` helpers deleted from the models file.
- [ ] Cross-service FK preflight checks flipped to `prisma.<model>.findUnique({ where: { id }, select: { id: true } })`.
- [ ] Tests updated: SQLite `resetDb()` replaced with `await prisma.<model>.deleteMany({})` in `beforeEach` / `afterAll`, plus `await prisma.$disconnect()` at the end.
- [ ] `pnpm exec tsc --noEmit` clean for touched files.
- [ ] Jest suite for the module passes.

## Steps

1. **Preflight.**
   - `git branch --show-current` must return `master`. No worktrees, no feature branches.
   - Not in detached HEAD.
   - On failure, abort.

2. **Before-commit (sandwich layer 1).** If `git status --porcelain` is non-empty, stage everything and commit:
   ```
   chore: snapshot before /purge-sqlite
   ```
   Separates pre-existing work from the purge edits so the after-commit is a clean revert target. If the tree is clean, skip.

3. **Scan.** Apply the grep patterns above to the scoped path (or the whole repo). Group findings by file. For each file, classify the change needed: `rewrite` | `delete` | `annotate-stale` | `exempt (ref_*)` | `ambiguous (flag for operator)`.

4. **Cap check.** Count distinct files that would be edited. If > 5 files, **stop before writing** and print the full plan. Operator either:
   - Re-invokes with a narrower path argument to scope down.
   - Breaks the purge into sub-sessions.
   - Explicitly widens the cap for this session (`/purge-sqlite --files N`, not yet wired — until then, narrow via path).

5. **Apply fixes.** For each routed file:
   - **Code files** — rewrite SQLite calls to Prisma. Prefer smallest viable diff. If the rewrite requires changing a function signature (sync → async), follow the cascade up through every caller in the same pass — do NOT leave a half-migrated chain. If the cascade crosses more than one service boundary, flag it and stop instead of half-finishing.
   - **Doc files** — rewrite prose to match current state; or annotate-stale if ambiguous.
   - **Script files** — rewrite against Prisma, or rename with `-legacy` suffix + comment block if it must stay as a historical artifact.
   - **Tests** — update fixtures, swap assertions.

6. **Verify.** After all edits:
   - `pnpm exec tsc --noEmit` scoped to touched packages — must be clean for touched files (pre-existing unrelated errors OK, report them).
   - Jest suites for any touched service — must pass. If tests fail, DO NOT proceed to commit; report failures and let the operator decide.

7. **After-commit (sandwich layer 2).**
   ```
   refactor(db): purge SQLite references — <one-line summary>

   Files rewritten:
   - <path> — <what changed>
   Files with stale-annotations:
   - <path> — <annotation reason>
   Files flagged (ambiguous, operator review):
   - <path> — <why flagged>

   Tests touched: <list>
   typecheck: clean (or: pre-existing errors in <files>, unrelated)

   Source: /purge-sqlite pass, <YYYY-MM-DD HH:MM>

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```
   One commit. `git revert <sha>` cleanly undoes the whole pass.

8. **Report.**

## Report format

```
## SQLite purge — <YYYY-MM-DD HH:MM>

### Scope
Path argument:    <path or "whole repo">
Mode:             <default | --dry-run | --docs-only | --code-only>
Before-commit:    <sha or "tree was clean">
After-commit:     <sha or "--dry-run, no commit">
Cap:              <files-modified> / 5

### Files rewritten (<N>)
<path>
  - <one-line summary of change>
  - <one-line summary of change>

### Stale-annotations added (<N>)
<path> — <reason>

### Flagged for operator review (<N>)
<path> — <why: cross-service cascade, ambiguous intent, etc.>

### Exempt (ref_* tables, left alone)
<path> — references ref_colors (still on SQLite per exception)

### Verification
typecheck:  <clean | pre-existing errors in unrelated files>
tests:      <passed for touched services | failed, see below>

### Remaining SQLite debt (not in scope for this pass)
<file>:<line> — <snippet>
<file>:<line> — <snippet>
```

## Rules the command enforces

- **Branch = `master`.** No force operations, no branching, no worktrees.
- **Never touch `ref_*` dimension tables** unless the operator explicitly scopes to one. That's the narrow exception.
- **Never auto-edit `CLAUDE.md`.** Route changes as a dated spec entry for operator promotion.
- **Never invent a cross-DB shim.** If a migration needs data on both sides, flag and stop — don't build a Postgres-reads-SQLite-writes hybrid.
- **Never leave half-migrated call chains.** If flipping a function sync → async cascades into callers, finish the cascade in the same pass or back out entirely.
- **Annotate for staleness, don't delete prose** when the intent is ambiguous. Information loss is worse than an annotation.
- **5-file cap by default.** Exceeding it means the pass likely spans multiple logical migrations — split into sub-sessions.
- **No secrets in commits.** Scan staged diff for `password=`, `api_key=`, `secret_key=`, `AWS_SECRET`, `BEGIN PRIVATE KEY` before the after-commit. Abort if any match.
- **HNL currency** in any rewritten prose. No `$` / `USD` / `en-US`.
- **No branches / PRs / worktrees** in rewritten text.
- **Never write to `legacy/`.** Retired folder.

## When NOT to run this

- When the operator is mid-feature and the working tree is large — run `/purge-sqlite --dry-run` first so the edits don't conflict.
- When a migration requires a backfill that reads from the live RICS mirror — that's a real migration, not a find-and-replace. Drop into a normal implementation session with a spec.
- To migrate a `ref_*` table — that's a dedicated ticket. Use `/brainstorm` to scope the dimension design first.

## Related docs

- [`.claude/commands/postgres-only.md`](./postgres-only.md) — the audit counterpart. Run first to see the backlog.
- [`CLAUDE.md`](../../CLAUDE.md) — HARD RULE: Postgres-only for new development.
- [`apps/api/src/db/prisma.ts`](../../apps/api/src/db/prisma.ts) — the only supported Postgres client handle.
- [`apps/api/src/db/database.ts`](../../apps/api/src/db/database.ts) — the SQLite file being drained. A successful purge shrinks this file toward zero (minus the `ref_*` exception).
- [`docs/dev/specs/2026-04-23-postgres-only-development-policy.md`](../../docs/dev/specs/2026-04-23-postgres-only-development-policy.md) — policy spec that governs this command.
