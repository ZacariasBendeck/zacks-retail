---
description: Break a Zack's Retail module into engineering tasks/tickets at docs/modules/<slug>-tasks.md. Numbered tasks with phase target (A/B/C), size (S/M/L), dependencies, scope deliverables, and per-task acceptance checks. Reads the functional spec, engineering overview, API spec, and schema spec. Never includes branches, worktrees, or subagent delegation.
---

# break-module-into-tasks

Produce an engineering ticket breakdown for a module. Each task is sized to fit in a single session and has measurable acceptance checks. Consumed by the operator to sequence implementation work directly on `master`.

Argument: `$ARGUMENTS` — module slug (required). Omitted → stop and ask.

## Sources to read

1. [`docs/modules/<slug>-functional.md`](../../docs/modules/) — features, workflow, acceptance criteria.
2. [`docs/modules/<slug>.md`](../../docs/modules/) — engineering overview.
3. [`docs/modules/<slug>-api.md`](../../docs/modules/) — endpoints to implement.
4. [`docs/modules/<slug>-schema.md`](../../docs/modules/) — tables and migrations.
5. [`CLAUDE.md`](../../CLAUDE.md) — Rollout phases, hard rules, master-only commit discipline.
6. [`docs/PROJECT_STATUS.md`](../../docs/PROJECT_STATUS.md) — current project phase.

If any paired spec is missing, note the gap under "Prerequisites" — don't refuse to write tasks, but make the missing input explicit.

## Writing rules

- **One measurable acceptance check per task minimum.** Something QA can verify — a test, a log line, an API response shape, a visible UI state.
- **Phase target per task** (A / B / C) per the Rollout-phases section of [`CLAUDE.md`](../../CLAUDE.md).
- **Size:**
  - `S` — fits in one session.
  - `M` — two sessions.
  - `L` — too big; needs further decomposition. Flag L tasks at the bottom of the report so the operator splits them.
- **Dependencies** by task number. Tasks with no dependencies are parallelizable — they go in the "Independent" group in the final section.
- **Never include `Agent` tool invocation** with `isolation: "worktree"`.
- **Never include branching steps** — project commits direct to `master`.
- **Never include subagent delegation** — subagents are retired on this project.
- **Hard-rule surfaces.** If a task touches the SKU lookup warmup, the OLE DB async helper, or the RICS mirror sync path, the task MUST reference the runbook in [`docs/operations/`](../../docs/operations/) in its "Runbook references" block.
- **HNL currency** in any examples.
- **No PR / review-gate language** — work lands as direct commits on `master`.

## Template

Path: `docs/modules/<slug>-tasks.md`.

```markdown
# Task breakdown: <slug>

**Type:** Engineering tasks
**Functional spec:** [`<slug>-functional.md`](./<slug>-functional.md)
**Engineering overview:** [`<slug>.md`](./<slug>.md)
**API spec:** [`<slug>-api.md`](./<slug>-api.md)
**Schema spec:** [`<slug>-schema.md`](./<slug>-schema.md)
**Target phase:** <A | B | C>
**Last refreshed:** <YYYY-MM-DD>

## Prerequisites

<Paired specs that are missing, cross-module contracts needed, operator decisions outstanding. "None" if clear to start.>

## Tasks

### Task 1 — <short title>

**Phase target:** <A | B | C>
**Size:** <S | M | L>
**Depends on:** <task numbers or "none">

**Description**
<Two to four sentences. What the task accomplishes and why it's scoped this way.>

**Scope**
- <Concrete deliverable 1>
- <Concrete deliverable 2>
- <Files expected to change>

**Acceptance checks**
- [ ] <Measurable check 1 — test, log line, API shape, UI state>
- [ ] <Measurable check 2>

**Runbook references**
- [`docs/operations/<runbook>.md`](../operations/<runbook>.md) — why this task touches this surface

---

### Task 2 — <short title>

(repeat per task)

## Parallelizable groups

- **Independent (can run in parallel):** Task <n>, Task <n>, Task <n>
- **Sequential chains:** Task <n> → Task <n> → Task <n>

## Large tasks flagged for further decomposition

- Task <n> — <reason it's `L`; suggested split into sub-tasks>

## Risk / unknowns

- <Risk 1 — what happens if an assumption is wrong, and which task is most affected>
```

## Editing existing spec

- If the file exists, use `Edit`, not `Write`.
- When a task completes, mark its acceptance checks with `[x]` and add a "Completed:" line with the commit SHA.
- Renumber only if absolutely necessary — append new tasks at the end rather than reorganize.
- Update `**Last refreshed:**` on every edit.

## Commit

```
docs(tasks): <slug> — task breakdown

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Report

> Wrote `docs/modules/<slug>-tasks.md` — <N> tasks (<S-count> S, <M-count> M, <L-count> L), <K> with dependencies, <J> parallelizable. `L` tasks that need further decomposition: <list or "none">. Next: pick a Task 1 with no dependencies and start implementation on `master`.

## Example invocations

- `/break-module-into-tasks inventory-transfer`
- `/break-module-into-tasks sales-pos`
- `/break-module-into-tasks purchase-planning`
