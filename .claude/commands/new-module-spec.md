---
description: Scaffold a Zack's Retail module spec at docs/modules/<slug>.md using the canonical 9-section template (Goal, RICS features covered, Modernization decisions, Data model sketch, API surface, UI surface, Dependencies, Contracts exposed, Out of scope, Open questions). Cites RICS manual pages; never invents behavior.
---

# new-module-spec

Produce (or refresh) a module specification for Zack's Retail under `docs/modules/$ARGUMENTS.md`.

Argument handling: `$ARGUMENTS`
- Required: a module slug from [docs/MODULES.md](../../docs/MODULES.md) (e.g., `products`, `inventory`, `otb-planning`, `purchasing`, `sales-pos`, `sales-reporting`, `crm`, `accounts-receivable`, `customer-transactions`, `employees`, `physical-inventory`, `store-ops`, `platform`, `purchase-planning`).
- If no slug → stop, ask the operator which module, do not guess.
- If the slug is not in `docs/MODULES.md` → stop, tell the operator the registry needs a row first.

## Sources to read before writing

1. [docs/MODULES.md](../../docs/MODULES.md) — locate the module's row. Note its RICS chapter references and dependencies.
2. [docs/rics-reference/toc.md](../../docs/rics-reference/toc.md) — map the RICS chapter numbers to manual page ranges.
3. [docs/rics-reference/77manual.txt](../../docs/rics-reference/77manual.txt) — grep for the domain terms of the module (e.g. for `pos`: `ticket`, `batch`, `tender`). Page numbers appear on their own line; anchor grep hits to the nearest page.
4. [docs/rics-reference/77manual.pdf](../../docs/rics-reference/77manual.pdf) — read with the `pages` parameter for layout-sensitive passages (tables, grids, screens). **PDF page ≈ manual page + 7** (cover + TOC prefix).
5. Existing code as context only, never as spec:
   - `apps/api/src/routes/` — any route matching this domain
   - `apps/api/src/services/` + `apps/api/src/repositories/rics/` — any service/repo matching this domain
   - `apps/web/src/pages/` — existing UI
   - `apps/api/prisma/schema.prisma` — existing models
6. [CLAUDE.md](../../CLAUDE.md) — rollout phases and hard rules.

If any of the RICS reference files are missing, stop and tell the operator — do not guess at RICS behavior from memory.

## Spec template — strict, follow exactly

Keep headings in this order and with these exact words. No emojis. Preserve the template structure even if a section has no content (write "_none in v1_" instead of omitting).

```markdown
# Module: <slug>

**Goal**

One paragraph, two sentences: (1) the bounded context this module owns, (2) the primary user value.

## RICS features covered

Bulleted list. Group by sub-area if the module is large. Every bullet cites a manual page.

- **p. N, <Feature Name>** — one-line description of what RICS does here.
- **p. N, <Feature Name>** — ...

## Modernization decisions

What changes in the web version vs. RICS. Each decision names the legacy RICS concept being dropped or reshaped. Example phrasing:

- **<Decision>.** Replaces <RICS concept> (Ch. N / p. N). Rationale: <one sentence>.
- **<Decision>.** ...

## Data model sketch

Prisma-style entity sketch — field names and relationships, not full `schema.prisma`. Flag fields lifted from RICS with page refs.

\`\`\`prisma
model Example {
  id          String   @id @default(uuid())
  code        String   @unique  // RICS "Field#", N chars (p. M)
  ...
}
\`\`\`

## API surface

HTTP endpoints this module exposes. Method + path + one-line purpose. No request/response schemas.

- \`POST /api/v1/<resource>\` — purpose
- \`GET  /api/v1/<resource>?<filter>\` — purpose

## UI surface

Admin or storefront pages this module contributes. One line per page.

- **<Page name>** — what the user does here.

## Dependencies

Other Zack's Retail modules this one imports from.

- **<other-module>** — what it needs (e.g., "SKU definitions", "store list for dropdowns").

## Contracts exposed

What this module exports for other modules. Named functions / types / events.

- \`<functionName>(input)\` — who consumes it and why.
- \`<EventName>\` — who subscribes.

## Out of scope for v1

RICS features deliberately deferred or dropped. Each with a one-line reason.

- **<Feature name> (p. N)** — reason.

## Open questions

Things that need operator input before implementation. Be specific. Format as a numbered list.

1. <Specific question about an ambiguous RICS behavior or a modernization decision that needs a call.>
2. ...
```

## Working rules

1. **RICS is the baseline, not the exact target.** Feature parity first, improvements second. Every improvement appears as an explicit "Modernization decision" so the trail back to the manual stays intact.
2. **Cite the manual page number** every time you reference a RICS behavior. Format: `RICS p. 88` or `(p. 88, Sales Analysis Report)`. Page-less claims are not acceptable.
3. **Drop legacy infrastructure — do not translate it.** Modem comms, diskette POS sync, RICS.CFG, DOS prompt, screen spool files, hardware-printer driver setup — these are explicitly out of scope per [docs/MODULES.md](../../docs/MODULES.md). If tempted to port any of them, add a Modernization decision explaining why it goes away.
4. **Do not guess at RICS behavior.** If the manual is unclear or silent, add to "Open questions" — never invent a default.
5. **Do not read more than you need.** The manual is 219 pages; reading the whole thing wastes tokens. Target the sections via `toc.md` and the grep of `77manual.txt`.
6. **Do not write code.** No TypeScript, no SQL beyond the Prisma-style sketch in the Data model section (which is documentation, not implementation).
7. **Preserve section order.** Do not reorganize, rename, or omit the nine headings. Empty sections are written as "_none in v1_".
8. **Keep the spec to 3–6 pages rendered.** If longer, the module is probably too big — flag this at the end and recommend a split.

## Editing existing specs

- If `docs/modules/<slug>.md` already exists, use `Edit`, not `Write` — preserve history.
- Before editing, read the full existing spec. Preserve every resolved decision and every recorded modernization unless the operator has explicitly asked for a rewrite.
- When moving a question from "Open questions" to another section (because it's been resolved), leave a one-line note in the destination section describing the resolution.

## Report format

After writing or editing the spec, end with a one-paragraph summary (no bullet lists of every file):

> Wrote `docs/modules/<slug>.md` — covers <N> RICS features from Ch. <X>–<Y>, records <M> modernization decisions, <K> open questions remain. Next recommended module (if any): <slug>.

## Example invocations

- `/new-module-spec inventory` — scaffold or refresh the `inventory` module spec.
- `/new-module-spec otb-planning` — scaffold or refresh `otb-planning`.
