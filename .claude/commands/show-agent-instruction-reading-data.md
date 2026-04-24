---
description: Read-only listing of every file that guides implementation work on Zack's Retail — root rules, module contracts, dated specs/plans, operations hard-rule runbooks, forward user manual, legacy RICS ancestor docs, and the slash-command rituals. Writes nothing. Use when you need to orient to the "sources of truth" before starting a task.
---

# show-agent-instruction-reading-data

Enumerate the files an agent (or programmer) consults for guidance when implementing anything on Zack's Retail. **Read-only** — this command never writes, never stages, never commits.

Argument: `$ARGUMENTS`
- Empty → list every guidance surface.
- Single category keyword (`root`, `modules`, `specs`, `plans`, `operations`, `manual`, `rics`, `commands`) → scope output to that category only.

Example: `/show-agent-instruction-reading-data` • `/show-agent-instruction-reading-data operations`

## How to produce the list

Run the enumerations below, then render the report in the format at the bottom. Do not summarize contents — just list paths with a one-line role. The operator is looking up *where* to read, not *what* it says.

### 1. Root-level ground rules

Always include these, in this order:

- [`CLAUDE.md`](../../CLAUDE.md) — agent rules: phases, hard rules, sources-of-truth order, postgres-only, no-branches
- [`WORKFLOW.md`](../../WORKFLOW.md) — human-facing version of the same
- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) — system architecture
- [`docs/COMPANY.md`](../../docs/COMPANY.md) — business/domain context
- [`docs/MODULES.md`](../../docs/MODULES.md) — module registry + "what's not being ported" table
- [`docs/PROJECT_STATUS.md`](../../docs/PROJECT_STATUS.md) — rollout state, latest milestone

### 2. Module contracts

For each subdirectory of [`docs/modules/`](../../docs/modules/), list the guidance files that exist. The full template is:

| File | Role |
|---|---|
| `business-functional.md` | Business/functional spec (17-section template, by `/describe-module`) |
| `tech-description.md` | Forward technical description (by `/describe-tech-module`) |
| `api.md` | HTTP API contract (by `/write-api-spec`) |
| `schema.md` | Database schema spec (by `/write-schema-spec`) |
| `tasks.md` | Engineering breakdown (by `/break-module-into-tasks`) |
| `rics-module-specs.md` | Ancestor RICS behavior per module |
| `decisions.md` | Module-scoped ADRs |
| `README.md` | Module entry point |

Glob `docs/modules/*/` to discover module slugs, then glob each slug for the files above. Only print files that actually exist — missing ones are expected (most modules only have `README`, `decisions`, and `rics-module-specs` so far).

Also surface any testing checklists found inside module directories (e.g. `*-testing-checklist.md`, `Checklists-tests/`).

### 3. Dated architecture & phase-design specs

List every `.md` under [`docs/dev/specs/`](../../docs/dev/specs/), sorted by filename (date-prefixed). These are binding contracts for in-flight work — read before implementing any non-trivial feature.

### 4. Implementation plans

List every `.md` under [`docs/dev/plans/`](../../docs/dev/plans/), sorted by filename.

### 5. Operations hard-rule docs

List every `.md` under [`docs/operations/`](../../docs/operations/). Call out the three HARD RULE runbooks explicitly by name in the report — they are enforced invariants, not just runbooks:

- `sku-lookup-index-warmup.md` — full InventoryMaster warmup at startup
- `access-oledb-async-spawn.md` — OLEDB helper must stay async
- `rics-mirror-sync.md` — one-way RICS → Postgres ETL contract

### 6. Forward user manual

List [`docs/zacks-retail-manual/INDEX.md`](../../docs/zacks-retail-manual/INDEX.md) plus every chapter `.md` in that directory. These are the forward UX/operator spec (supersede the RICS manual).

### 7. Legacy RICS ancestor

List files under [`docs/rics-reference/`](../../docs/rics-reference/) (the v7.7 User Manual PDF/TXT and TOC) and [`docs/rics-db-schema.md`](../../docs/rics-db-schema.md). Cite for lineage, not live spec.

### 8. Slash-command rituals

List every `.md` under [`.claude/commands/`](../../.claude/commands/) with its front-matter `description` trimmed to one line. These are the workflow surface — when a task matches one, invoke the command rather than improvising.

### 9. Reading order

Close the report with the canonical reading order from [`CLAUDE.md`](../../CLAUDE.md):

1. `docs/modules/<slug>/` — the module's governed contract
2. `docs/dev/specs/` — dated architecture / phase-design specs
3. `docs/zacks-retail-manual/<slug>.md` — forward user manual
4. `docs/rics-reference/` — ancestor RICS manual (lineage only)

And note: operations docs apply whenever code touches the systems they govern (OLEDB helper, SKU warmup, mirror sync, lifecycle backfill).

## Report format

```
## Agent instruction reading data — <YYYY-MM-DD HH:MM>

### 1. Root-level ground rules
- <path> — <role>
...

### 2. Module contracts
Modules present: <slug>, <slug>, ...

#### <slug>
- <path> — <role>
(repeat for each module; omit files that don't exist)

Testing checklists:
- <path>

### 3. Dated architecture & phase-design specs — docs/dev/specs/
- <path>
...

### 4. Implementation plans — docs/dev/plans/
- <path>
...

### 5. Operations hard-rule docs — docs/operations/
HARD RULES:
- <path> — <one-line invariant>
Other runbooks:
- <path>
...

### 6. Forward user manual — docs/zacks-retail-manual/
- <path>
...

### 7. Legacy RICS ancestor
- <path>
...

### 8. Slash-command rituals — .claude/commands/
- /<name> — <description>
...

### 9. Reading order
(render the 4-step order + ops-doc note)
```

## Rules

- **Read-only.** Never writes, never stages, never commits.
- **Do not summarize contents.** The operator wants paths + one-line roles, not a synthesis of what each doc says. A clickable list is the deliverable.
- **Use relative markdown links** (`[path](../../path)`) so every entry is navigable from the IDE.
- **Never fabricate files.** Only list paths that actually exist on disk — glob to discover, don't recite from memory.
- **Exclude `node_modules/`, `legacy/` (retired), `.tmp/`, build output.** Only list repo-authored guidance.
- **Keep the report under ~250 lines.** If a category is huge, summarize by count and offer to drill in with a category argument.
- **When a category argument is passed,** emit only that section (plus the reading-order footer).

## Example invocations

- `/show-agent-instruction-reading-data` — full guidance map.
- `/show-agent-instruction-reading-data operations` — just the operations runbooks.
- `/show-agent-instruction-reading-data specs` — just the dated architecture / phase-design specs.
- `/show-agent-instruction-reading-data modules` — just the module contract files.