---
description: Write the detailed HTTP API contract for a Zack's Retail module at docs/modules/<slug>/api.md. Endpoint-by-endpoint — method, path, purpose, auth, request, response, status codes, error shapes, examples. Reads the module's tech-description.md / rics-module-specs.md for which endpoints to spec. Pairs with /write-schema-spec and /break-module-into-tasks.
---

# write-api-spec

Produce the detailed HTTP API contract for a module. One endpoint per subsection with full request / response examples, status codes, and error shapes. Assumes the engineering overview already exists and names the intended endpoints.

Argument: `$ARGUMENTS` — module slug (required).
- Omitted → stop and ask.
- Neither `tech-description.md` nor `rics-module-specs.md` exists in `docs/modules/<slug>/` → stop; run `/describe-tech-module <slug>` first.

## Sources to read

1. [`docs/modules/<slug>/tech-description.md`](../../docs/modules/) — architecture / routes list (primary source for endpoints in current phase).
2. [`docs/modules/<slug>/rics-module-specs.md`](../../docs/modules/) — RICS "API surface" section if tech-description is not yet written.
3. [`docs/modules/<slug>/business-functional.md`](../../docs/modules/) — inputs / outputs / permissions per endpoint (if it exists).
4. [`docs/modules/<slug>/schema.md`](../../docs/modules/) — align response shapes with DB entities (if it exists).
5. [`apps/api/src/routes/`](../../apps/api/src/routes/) — existing implementation as reference only. If current code has drifted from the intended design, the spec reflects the intended design and flags the drift.
6. [`CLAUDE.md`](../../CLAUDE.md) — currency and hard rules.

## Writing rules

- **One subsection per endpoint.** Method + path as the heading.
- **Currency in responses:** plain numbers (e.g. `1234.56`), no `$` / `USD`. Document the unit once in the document header: "Amounts in Lempira (HNL)".
- **All endpoints rooted at `/api/v1/`.**
- **Examples in JSON** — not TypeScript types. Generated OpenAPI / typed clients belong in code, not docs.
- **Do not invent endpoints** not named in `tech-description.md` or `rics-module-specs.md`. If something is needed but missing from those sources, stop and flag the gap.
- **Errors use the project's shared error shape** — document the statuses and business-level messages, not stack traces.
- **No branching / worktree language** in any examples.
- **HNL only.**

## Template

Path: `docs/modules/<slug>/api.md`. Preserve order; omit subsections that don't apply with a one-line "_none for v1_".

```markdown
# API Contract: <slug>

**Type:** API spec
**Folder landing:** [`README.md`](./README.md)
**Tech description:** [`tech-description.md`](./tech-description.md)
**RICS lineage:** [`rics-module-specs.md`](./rics-module-specs.md)
**Business spec:** [`business-functional.md`](./business-functional.md)
**Schema:** [`schema.md`](./schema.md)
**Tasks:** [`tasks.md`](./tasks.md)
**Decisions:** [`decisions.md`](./decisions.md)
**Last refreshed:** <YYYY-MM-DD>
**Base URL:** `/api/v1`
**Amounts:** Lempira (HNL), plain numbers (no currency symbol)

## Authentication
<Which endpoints require auth, which roles are allowed. Link to the permissions section of the functional spec if it exists.>

## Endpoints

### POST /api/v1/<resource>

**Purpose:** <one-line>
**Auth:** <roles>
**Idempotency:** <yes/no; key source if yes>

**Request body**
\\\`\\\`\\\`json
{
  "field": "value"
}
\\\`\\\`\\\`

**Response 201**
\\\`\\\`\\\`json
{
  "id": "uuid",
  "amount": 1234.56
}
\\\`\\\`\\\`

**Error responses**
- `400 validation_error` — <cases>
- `409 conflict` — <cases>
- `403 forbidden` — <cases>

---

### GET /api/v1/<resource>?<filter>

(repeat subsection for each endpoint)

## Events emitted

If the module emits domain events on API calls, list them:

- `<event.name>` — emitted on <endpoint>, payload `{ ... }`

## Rate limits / quotas

<Any module-specific limits, or "standard platform limits apply.">

## Drift from current code

<If the current implementation disagrees with this spec, list the drift items — endpoint-level. "None" if aligned.>

- `POST /api/v1/<resource>` — current code accepts field `X`; spec requires field `Y`. Code needs updating.
```

## Editing existing specs

- If the file exists, use `Edit`, not `Write`.
- Add new endpoint subsections at the bottom of "Endpoints" unless grouping makes a different position clearer.
- Update `**Last refreshed:**` on every edit.

## Commit

```
docs(api): <slug> — API contract

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Report

> Wrote `docs/modules/<slug>/api.md` — <N> endpoints, <M> events emitted, <K> error codes documented. Drift items flagged: <count or "none">. Next: `/write-schema-spec <slug>` to pair the DB side, or `/break-module-into-tasks <slug>` for the ticket breakdown.

## Example invocations

- `/write-api-spec inventory-transfer`
- `/write-api-spec sales-pos`
- `/write-api-spec otb-planning`
