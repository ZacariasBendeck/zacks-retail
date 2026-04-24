---
description: Write the forward technical description for a Zack's Retail module at docs/modules/<slug>/tech-description.md. Anchors in current code (routes, services, adapters, schema, UI pages), not in the RICS manual. Captures architecture, data flow, dependencies, contracts exposed, feature flags, observability, testing approach. Pairs with /describe-module (business spec), /write-api-spec (HTTP), /write-schema-spec (DB), /break-module-into-tasks. The RICS port lineage lives in rics-module-specs.md (separate, hand-edited).
---

# describe-tech-module

Produce (or refresh) the **forward technical description** for a Zack's Retail module at `docs/modules/<slug>/tech-description.md`. This is how the module is implemented in the current codebase — architecture, data flow, contracts. The RICS lineage (port history + modernization decisions) lives separately in `rics-module-specs.md`.

Argument: `$ARGUMENTS` — module slug (required) from the registry in [`docs/MODULES.md`](../../docs/MODULES.md).
- Omitted → stop and ask.
- Slug not in registry → stop; tell the operator to add a registry row first.
- Module folder `docs/modules/<slug>/` doesn't exist → stop; the per-module folder restructure expects the folder to already be present (it's seeded with at least `README.md`).

## Sources to read

Primary anchor is **current code state**, not the RICS manual:

1. [`docs/modules/<slug>/README.md`](../../docs/modules/) — folder landing page; phase + RICS chapter context.
2. [`docs/modules/<slug>/rics-module-specs.md`](../../docs/modules/) — RICS port lineage; reference for what the module is *supposed* to do, but don't restate it here.
3. [`apps/api/src/routes/`](../../apps/api/src/routes/) — every route file matching this module. List them.
4. [`apps/api/src/services/`](../../apps/api/src/services/) — services + adapters for this module.
5. [`apps/api/src/repositories/`](../../apps/api/src/repositories/) — repositories (RICS or app-side) for this module.
6. [`apps/web/src/pages/`](../../apps/web/src/pages/) — UI pages.
7. [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma) — module-owned models and their `@@schema(...)` annotations.
8. [`docs/modules/<slug>/decisions.md`](../../docs/modules/) — module-scoped ADR log; reference any decisions that explain the current shape.
9. [`CLAUDE.md`](../../CLAUDE.md) — Rollout phases, hard rules, data-surfaces section.

## Writing rules

- **Forward-looking.** Describe what the module *is* today (and what it's becoming for the current phase), not what RICS did. RICS lineage cites belong in `rics-module-specs.md`.
- **Anchor in code.** Every architecture / data-flow claim should cite a file, route, service, or schema model.
- **No invented behavior.** If the code doesn't do something, don't claim it does. If a section has no current content, write `_none in current phase_`.
- **Operator-neutral voice.** No "I" / "we decided" — declarative.
- **HNL currency** in any examples. No `$` / `USD` / `en-US` formatters.
- **No branches / worktrees / PR language.**
- **Do not write code.** No TypeScript, no SQL beyond illustrative one-liners.
- **Preserve section order.** Empty sections written as `_none in current phase_`.
- **Phase-aware.** Every description states the phase target (A / B / C) per [`CLAUDE.md`](../../CLAUDE.md) Rollout phases. In Phase A, reads may come from `rics_mirror.*` only until the surface has an app-owned authoritative table; after that, request-path reads come only from the app-owned table. Writes land in `public.*` / `app.*`.

## Template — strict, follow exactly

Path: `docs/modules/<slug>/tech-description.md`. Preserve section order and headings.

```markdown
# Tech Description: <slug>

**Type:** Technical description
**Folder landing:** [`README.md`](./README.md)
**RICS lineage:** [`rics-module-specs.md`](./rics-module-specs.md)
**Business spec:** [`business-functional.md`](./business-functional.md)
**API contract:** [`api.md`](./api.md)
**Schema:** [`schema.md`](./schema.md)
**Tasks:** [`tasks.md`](./tasks.md)
**Decisions:** [`decisions.md`](./decisions.md)
**Phase target:** <A | B | C>
**Last refreshed:** <YYYY-MM-DD>

## Goal

One paragraph — what this module owns and the forward value it provides in the current phase.

## Architecture

How the module is structured in the codebase: route layer, service layer, adapters, UI pages. How it plugs into the overall system. List the actual files.

- **Routes:** `apps/api/src/routes/<...>` — purpose
- **Services:** `apps/api/src/services/<...>` — purpose
- **Repositories:** `apps/api/src/repositories/<...>` — purpose
- **UI pages:** `apps/web/src/pages/<...>` — purpose

## Data flow

Where reads come from and where writes land. Be explicit about Postgres schemas (`rics_mirror`, `public`, `app`, `platform`), the current authoritative request-path surface for each read, and any remaining per-request OLEDB paths (Phase A cutover state).

- **Reads:** `<schema.table>` via `<service>` — used by `<route>`; note whether this is still the temporary `rics_mirror` path or the app-owned authoritative request path
- **Writes:** `<schema.table>` via `<service>` — emitted by `<route>`
- **Per-request OLEDB (legacy):** list any service that still calls [`accessOleDb.ts`](../../apps/api/src/services/accessOleDb.ts) at request time; cross-link [`docs/operations/rics-mirror-sync.md`](../../docs/operations/rics-mirror-sync.md).

## Dependencies

Other Zack's Retail modules this one imports from. Be specific about what is consumed.

- **<other-module>** — consumes `<function|type|event>` for `<purpose>`.

## Contracts exposed

What this module exports for other modules to consume. Named functions / types / events.

- `<functionName>(input): output` — consumed by `<module>` for `<purpose>`.
- `<EventName>` — emitted on `<trigger>`; subscribed by `<module>`.

## Feature flags

Flags that gate behavior in the current code. Reference where the flag is read.

- `<FLAG_NAME>` (env var / settings key) — controls `<behavior>`; default `<value>`. Read in `<file:line>`.

If none: `_none in current phase_`.

## Observability

Key log lines, metrics, dashboards. The things operators look for when something breaks.

- **Log line:** `<exact log line>` — emitted by `<service>` on `<event>`.
- **Metric:** `<metric_name>` — labeled by `<dimensions>`.
- **Dashboard:** `<link or path>` — what it shows.

If hard-rule surfaces are touched (SKU lookup warmup, OLE DB async helper, RICS mirror sync), cite the runbook in [`docs/operations/`](../../docs/operations/).

## Testing approach

Unit, integration, end-to-end strategy. Where the tests live; what coverage gaps are accepted for the current phase.

- **Unit:** `<test path>` — covers `<surface>`.
- **Integration:** `<test path>` — covers `<surface>`.
- **E2E:** `_planned for Phase B_` (or path if it exists).

## Out of scope for current phase

What this module deliberately does NOT do in the current phase, with a one-line reason. Helps consumers know what to expect.

- **<deferred behavior>** — reason: `<phase-driven or design-driven>`.

## Open questions

Technical decisions that need operator input. When resolved, move the answer to [`decisions.md`](./decisions.md) as a dated ADR entry and replace this bullet with a one-line reference to it.

1. <Specific technical question.>
2. ...
```

## Editing existing specs

- If the file already exists, use `Edit`, not `Write` — preserve resolved content.
- Read the full existing file first. Preserve every recorded contract and dependency unless the operator asks for a rewrite.
- Update `**Last refreshed:**` on every edit.
- When a question moves from "Open questions" to a resolved state, append the answer to `decisions.md` and leave a reference here pointing at the dated ADR entry.

## Commit

Single commit direct to `master`:

```
docs(tech-description): <slug> — forward technical description

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Report

> Wrote `docs/modules/<slug>/tech-description.md` — covers <N> route files, <M> service files, <K> dependencies, <J> contracts exposed, <L> open questions. Phase target: <A | B | C>. Pair with `/describe-module <slug>` for the business spec, `/write-api-spec <slug>` for endpoints, `/write-schema-spec <slug>` for tables, `/break-module-into-tasks <slug>` for tickets. Append any design calls made during this pass to `decisions.md`.

## Example invocations

- `/describe-tech-module inventory`
- `/describe-tech-module otb-planning`
- `/describe-tech-module sales-pos`
