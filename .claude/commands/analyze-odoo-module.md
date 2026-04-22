---
description: Analyze an Odoo addon (intent, schema, key functions, client surface) and map the design patterns to specific Zack's Retail modules. Writes a research note to `docs/dev/research/odoo-<module>-<YYYY-MM-DD>.md` and appends a row to `docs/dev/research/INDEX.md`. Three depth tiers: `--quick` triage, full (default), `--deep`. Fetch-only — never clones Odoo, never copies code, never touches `apps/`.
---

# analyze-odoo-module

Study an Odoo addon from GitHub and extract what's worth borrowing for Zack's Retail. The goal is **pattern stealing, not code porting** — Odoo is a reference for how a mature retail/commerce system decomposes a problem; Zack's Retail has its own stack (Node + Prisma + Postgres + React) and its own lineage (RICS v7.7).

Argument handling: `$ARGUMENTS` — a space-separated list of tokens. Parse in any order; identify each token by shape:

- **Module identifier (required).** Accepted forms:
  - Leaf name: `pos_sale`, `stock`, `account`, `sale_management`
  - Folder path: `addons/pos_sale`
  - Full GitHub URL: `https://github.com/odoo/odoo/tree/19.0/addons/pos_sale`
- **Branch / Odoo version (optional).** A bare token matching `<digits>.<digits>` (e.g. `18.0`, `19.0`). Default `19.0`.
- **Depth flag (optional).** Exactly one of `--quick` or `--deep`. Default is full mode.

Examples: `/analyze-odoo-module pos_sale` — full on 19.0. `/analyze-odoo-module pos_sale 18.0 --quick` — quick triage on 18.0. `/analyze-odoo-module stock --deep` — deep analysis on 19.0.

- If no module identifier → stop, ask the operator which module, do not guess.
- If the module path returns 404 → stop, tell the operator and list the closest matches from a directory listing of `https://github.com/odoo/odoo/tree/<branch>/addons`.
- If both `--quick` and `--deep` are passed → stop, tell the operator only one depth flag is allowed.

Repo base: `https://github.com/odoo/odoo`. Raw content base: `https://raw.githubusercontent.com/odoo/odoo/<branch>/addons/<module>/<path>`. Directory listings go through the tree URL.

## Depth modes

Three depth tiers, selected by the optional `--quick` / `--deep` flag.

### `--quick` (triage)

Stops after two fetches: manifest + `models/` directory listing. Writes nothing to disk and adds no INDEX row. Prints a 10-line triage block to chat:

```
Triage — <module> @ <branch>
Intent: <one-line from manifest description>
Depends: <count> (<first 3 names>…)
Auto-install: <yes|no>
Models: <count> (<first 5 filenames>…)
Views: <count of files in views/>
Client assets: <bundle keys from manifest>
Verdict: <worth full read | probably skip | re-read after <related addon>>
```

Verdict guidance:
- **worth full read** — auto-install bridge, or the addon targets a Zack's module that's in Phase A/B.
- **probably skip** — Enterprise-only, or solves a problem Zack's has explicitly ruled out (e.g., multi-currency primitives, modem comms).
- **re-read after X** — the addon clearly layers on another addon the operator hasn't analyzed yet; name that addon.

Use case: sweeping a category (e.g., the ~10 `stock_*` addons) to decide which deserve a full analysis before committing tokens.

### full (default)

Runs Phases 1–6 as defined below. Writes the research note. Appends one row to `docs/dev/research/INDEX.md`. Prints the 6-line chat summary.

### `--deep`

Runs full, then adds three sub-phases (3.5 / 3.6 / 3.7) before writing the note. The INDEX row is marked `(deep)` in the Verdicts column. See Phases 3.5–3.7 below.

## Sources to read before writing the Fit section

The Fit section is the whole point — it must land in concrete Zack's Retail modules, not abstract ideas. Before writing it, read:

1. [`docs/MODULES.md`](../../docs/MODULES.md) — the 13-module registry plus net-new modules. Every Steal verdict names one of these modules.
2. [`docs/modules/<relevant-slug>.md`](../../docs/modules/) — the spec for any module you intend to map a pattern into. Pick 1–3 based on the Odoo module's category (commerce/POS → `sales-pos`, `customer-transactions`, `crm`; inventory → `inventory`, `products`, `physical-inventory`; accounting → `accounts-receivable`; scheduling/jobs → `platform`).
3. [`CLAUDE.md`](../../CLAUDE.md) — rollout phases. Each Steal verdict declares when the port makes sense: **Steal now** (fits Phase A), **Steal at Phase B**, **Steal at Phase C**, or **Skip**.
4. [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma) — glance at the schema areas adjacent to your target module(s) so schema-delta sketches reference real models, not imagined ones.

If Odoo's addon spans multiple Zack's modules, pick the primary one and note the secondary touch-points.

## Phase 1 — Intent (manifest)

Fetch `__manifest__.py` raw. Extract:

- **One-line description** — Odoo's own words.
- **`depends` list** — the layered stack. Pay attention to whether it depends on `point_of_sale`, `sale_management`, `stock`, `account`, `website`, `mail`, etc. This tells you which other Odoo concepts must be understood to make sense of the addon.
- **`auto_install`** — if `True`, this is a **bridge addon** (glues two modules together) rather than a standalone feature. Bridge addons are usually the most valuable to study because they show seams between concepts.
- **`category`**, **`version`**, **`license`** — lineage.
- **`data` files** count and types — proxy for how much server-side UI/config the addon ships.
- **`assets` keys** — which client bundles get JS/CSS injections (e.g., `point_of_sale._assets_pos`, `web.assets_backend`, `website.assets_frontend`). Tells you whether this is backend-only or extends a specific client.
- **Post-init hooks** — any `post_init_hook` / `uninstall_hook` / `pre_init_hook` names.

State the inferred **Intent** in one sentence at the top of your notes.

## Phase 2 — Schema (models)

Fetch the directory listing for `addons/<module>/models/` via the tree URL. For every `.py` file (skip `__init__.py`), fetch the raw content **in parallel via WebFetch**. From each file, extract:

- Base model — `_inherit = 'xxx'` (extension) vs `_name = 'xxx'` (new model). List both cases.
- **New fields** — name, type (`fields.Char`, `fields.Many2one`, `fields.Selection`, `fields.Monetary`, `fields.Integer`, etc.), relation target (for Many2one/One2many/Many2many), `compute=`, `store=`, `required=`, `default=`.
- **Overridden methods** — name and a one-line summary of what changes beyond `super()`. Focus on lifecycle methods (`create`, `write`, `unlink`, `copy`, `_prepare_*_vals`), action methods (`action_*`), compute methods for new fields, and any new public methods.
- **Cross-model effects** — e.g., POS order confirming a draft sale order, sale order unlink-protecting down-payment lines, stock picking quantities being updated from POS. These are the *behaviors* that describe what the addon actually does; note them even if they span two files.

Synthesize two tables in your output:

**Schema delta:**

| Model | `_inherit` or new? | New fields (name : type → relation) | Purpose |
|---|---|---|---|
| `pos.config` | inherit | `crm_team_id : M2o → crm.team`; `down_payment_product_id : M2o → product.product` | … |

**Function map:**

| Method | Model | What it does (1 line) | Why it matters |
|---|---|---|---|

Only include the behaviors worth remembering — not every setter, not trivial computes. Target ~6–15 rows.

## Phase 3 — Client surface

Directory-list `static/src/`. Catalogue:

- Which OWL components are patched (look for `patch()` calls in the first level of files).
- Any new popups / screens / widgets introduced.
- Any client-side model/store extensions.

Don't deep-dive the JS — the goal is to know *what* the addon changes on the client, not *how*. Skim 1 representative file only if the folder structure is non-obvious. For non-client addons (pure accounting / backend), write "no client surface" and skip to Phase 4.

**Tour tests.** Directory-list `static/tests/tours/`. If tours exist, fetch one representative file (prefer the one matching the addon name; otherwise the shortest). Summarise it in 2–3 sentences: what user flow does the tour script? Tours are Odoo's in-repo end-to-end tests written in a small JavaScript DSL that drives the browser through a canonical use case — e.g., `pos_sale` would likely script "cashier loads an open sale order, adds a down-payment line, settles." They often reveal the addon's intended happy path more clearly than view XML or OWL components. If no tours exist, note that and move on. Record the tour summary in the research note as a subsection of Client surface — not a separate top-level section. (See "Background — what Odoo tours are" at the end of this command file for more.)

## Phase 3.5 — Controllers (`--deep` only)

Directory-list `controllers/`. Fetch the first file (or the one matching the addon name, else the shortest). Extract every HTTP endpoint declared via `@http.route` / `@route`: path, HTTP method(s), auth level (`public` / `user` / `none`). Write a short **Endpoints** subsection in the note summarising each route in one line.

Skip this phase unless `--deep` is set.

## Phase 3.6 — Server tests (`--deep` only)

Directory-list `tests/`. For each `test_*.py`, fetch the raw file and extract test class names plus any one-line docstring on the class or on methods starting with `test_`. Do not paste test bodies — one line per test class, one line per notable test method. Write a **Test catalog** subsection: Class | Method | One-line intent.

Skip unless `--deep` is set.

## Phase 3.7 — Dependency rationale (`--deep` only)

For each entry in the manifest's `depends` list that is **not** `base`, `mail`, `web`, or `web_editor`, write one sentence on *why* this addon needs it. Grounded evidence: grep the top-level model files for `_inherit = '<dep-model>'` or `env['<dep-model>']` references. If you can't ground the dependency, write "dependency rationale not visible from top-level model files — verify before porting." Produce a **Depends rationale** subsection.

Skip unless `--deep` is set.

## Phase 4 — UI, security, data (quick pass)

- **`views/`** — list XML files; note which existing views are extended (`inherit_id`) vs new. One line per file.
- **`security/ir.model.access.csv`** — which groups get access to what. Usually confirms who the feature is for (internal users vs portal users vs POS cashiers).
- **`data/`** — seed records. Often reveals the intended setup (e.g., a default down-payment product, a default sales team, a default tax).

Keep this section under ~10 lines total.

## Phase 5 — Zack's Retail fit (the whole point)

For each distinct capability you identified in Phases 2–3, produce a row:

| Pattern | Zack's module | Verdict | Port sketch |
|---|---|---|---|

- **Pattern** — one-line name for the Odoo capability (e.g., "POS settles an open sale order with partial delivery + down payment").
- **Zack's module** — slug from `docs/MODULES.md` (e.g., `sales-pos`, `customer-transactions`, `accounts-receivable`). If multi-module, list primary + secondary.
- **Verdict** — one of:
  - **Steal now** — applies to Phase A. Port in the current sprint window.
  - **Steal at Phase B** — relevant only once RICS POS stops being the authoring surface.
  - **Steal at Phase C** — relevant only once `rics_mirror` is retired.
  - **Watch** — not actionable yet but worth a link back from the target module's spec.
  - **Skip** — Odoo-specific, solves a problem Zack's doesn't have, or conflicts with an RICS-parity requirement.
- **Port sketch** — 1 line. Must name a concrete target (e.g., `apps/api/prisma/schema.prisma:sales_pos.SalesOrder` + `amount_unpaid Decimal` compute in `apps/api/src/services/salesOrderService.ts`). Avoid generic phrasing like "could be useful for orders."

Below the table, write **one paragraph** naming the top 1–2 patterns that are worth stealing this phase and the single biggest *difference* in stack or domain that makes direct porting hard. This forces the analysis to commit to a recommendation.

## Phase 6 — Write the note

Path: `docs/dev/research/odoo-<module>-<YYYY-MM-DD>.md` (create `docs/dev/research/` if it doesn't exist — it's a sibling of `docs/dev/specs/` for external-system reference material, not for internal decisions).

Frontmatter:

```yaml
---
module: <name>
odoo_version: <branch>
odoo_url: https://github.com/odoo/odoo/tree/<branch>/addons/<module>
analyzed: <YYYY-MM-DD>
intent: <one-line>
verdict_counts: <steal-now>/<steal-B>/<steal-C>/<watch>/<skip>
primary_target_module: <zacks-module-slug>
---
```

Sections in this order, exact headings:

1. `## Intent`
2. `## Dependencies`
3. `## Schema delta` (table)
4. `## Function map` (table)
5. `## Client surface` (with a **Tour tests** subsection if any tours exist; in `--deep` mode, also **Endpoints**, **Test catalog**, and **Depends rationale** subsections)
6. `## UI / security / data`
7. `## Zack's Retail fit` (table + one-paragraph recommendation)
8. `## Open questions` (numbered list — specific things the operator needs to decide before any Steal verdict gets actioned)

Keep the note under ~3 rendered pages. Longer than that means the module was too broad — recommend splitting the analysis (e.g., `/analyze-odoo-module stock_account` separately from `/analyze-odoo-module stock`).

## Index file — `docs/dev/research/INDEX.md`

Every full or deep run appends one row to `docs/dev/research/INDEX.md`. (`--quick` triage runs are not logged.) If the file does not exist, create it with this exact header before appending:

```markdown
# Odoo research index

One row per completed full or deep analysis. `--quick` triage runs are not logged. Rows are appended chronologically; existing rows are never rewritten. If a module is re-analyzed on a later date, a new row is added so the audit trail stays intact.

| Date | Module | Odoo version | Intent (short) | Primary target | Verdicts (now/B/C/watch/skip) |
|------|--------|--------------|----------------|----------------|-------------------------------|
```

For each analysis, append one row with values pulled from the note's frontmatter:

| Frontmatter field | INDEX column |
|---|---|
| `analyzed` | Date |
| `module` | Module |
| `odoo_version` | Odoo version |
| `intent` (truncated to ~80 chars, ellipsis if cut) | Intent |
| `primary_target_module` | Primary target |
| `verdict_counts` (append `(deep)` if the run was `--deep`) | Verdicts |

If a row already exists for the same `module` + `analyzed` date (a same-day re-run), edit that row in place — it's the same analysis refreshed, not a new one.

## Report format (chat summary)

On **`--quick`** runs, print **only** the 10-line triage block defined in the Depth modes section. No file is written, no back-link is suggested.

On **full** or **`--deep`** runs, print **exactly six lines** to chat:

```
Wrote docs/dev/research/odoo-<module>-<YYYY-MM-DD>.md
Intent: <one-line>
Schema delta: <N> model extensions, <M> new fields
Top steal: <pattern> → <zacks-module> (<verdict>)
Top risk: <one line — stack gap, Phase mismatch, or domain mismatch>
Suggested edit: add `- See also: docs/dev/research/odoo-<module>-<YYYY-MM-DD>.md` under a References section in docs/modules/<primary-target>.md
```

The sixth line names `primary_target_module` from the note's frontmatter. If the target spec already contains a `## References` section, phrase it as "add under the existing References section." If not, phrase it as "create a `## References` section in …". **Never auto-apply** this edit — the operator decides whether the back-link makes sense for that module. The research / decision boundary stays with the operator.

No extra commentary. The operator reads the note directly if they want detail.

## Rules

1. **Fetch-only.** Use `WebFetch` for raw files and tree listings. Never `git clone` Odoo, never download archives, never copy Odoo source into the repo. Fetch what you need, synthesize, discard.
2. **Respect the license.** Odoo core is LGPL-3. Pattern reuse (structure, field names, method names for consistency) is fine. Direct code copy is not — Zack's Retail is not LGPL. If you ever feel like the right answer is "paste this Odoo function," flag it as a Skip + note in Open questions.
3. **Parallel fetches.** When fetching sibling files (e.g., every `.py` in `models/`), issue the `WebFetch` calls in the same tool-use block. Sequential fetches of 10 model files wastes an operator's time.
4. **Use raw URLs for content.** `raw.githubusercontent.com/odoo/odoo/<branch>/...` for file content. `github.com/odoo/odoo/tree/<branch>/...` for directory listings. `github.com/...` for file content often returns HTML wrappers that confuse extraction.
5. **Don't guess model behavior.** If a raw fetch returns partial content or you can't tell what a method does, say "Source fetch thin — verify before porting" in the note. Do not invent a behavior that sounds plausible.
6. **Every Steal verdict is concrete.** Name a Zack's file path (existing or to-be-created) and one line of schema or service change. A Steal row without a concrete target is a Watch row in disguise — mark it Watch.
7. **Phase-align every Steal.** Map to Phase A / B / C per `CLAUDE.md`. If you can't tell which phase fits, write the reason under Open questions; don't force a phase label.
8. **Never write code.** No TypeScript, no SQL, no Prisma schema edits. The Port sketch column is documentation, not implementation. The operator decides whether/when to implement.
9. **Never commit.** Write the file; leave staging and commit to the operator.
10. **No branches.** This command runs on `master` like everything else.
11. **Currency.** If an Odoo pattern references USD or an Odoo currency model, note that Zack's is single-currency HNL and do not propose multi-currency primitives as part of the port.
12. **No emojis** in the note or the chat summary.
13. **Skip Enterprise-only addons.** If the target module lives in `enterprise/` (private repo), stop and tell the operator — we only study `odoo/odoo` (community) paths under `addons/`.
14. **INDEX.md is append-only.** When writing `docs/dev/research/INDEX.md`, never reorder or rewrite historical rows. It is an audit trail, not a report. The only in-place edit allowed is a same-day refresh of the row for the current run (same `module` + same date).

## Editing an existing analysis

- If `docs/dev/research/odoo-<module>-<YYYY-MM-DD>.md` already exists for today, use `Edit`, not `Write` — preserve the existing verdicts and Open questions that have been resolved. The INDEX row for today also gets refreshed in place (see INDEX section above).
- If a previous analysis exists for the same module on a different date (Odoo version bump or a re-read), create a new dated file and cross-link to the prior one in Open questions (one line: "Previous analysis: `…-2026-03-10.md` — re-read triggered by <reason>"). Append a new INDEX row as well — do not touch the older row.

## Example invocations

- `/analyze-odoo-module pos_sale` — full analysis of the POS ↔ Sales bridge addon on Odoo 19.0.
- `/analyze-odoo-module stock --quick` — triage the Inventory module (10-line chat block, no note written).
- `/analyze-odoo-module account --deep 18.0` — deep analysis of the Accounting module on Odoo 18.0 (adds controllers, server tests, and dep rationale).
- `/analyze-odoo-module addons/sale_management` — full analysis via folder path form.
- `/analyze-odoo-module pos_restaurant 19.0 --quick` — triage run with explicit branch and depth flag.

## Why this command exists

Odoo has ~20 years of production hardening across the same problem domains Zack's Retail is re-implementing from RICS: sales tickets, inventory movements, accounts receivable, purchase orders, multi-store. RICS is the contract (what the system *must* do); Odoo is a reference (how a modern system *could* decompose it). This command is the repeatable ritual for mining that reference without adopting Odoo as a dependency.

## Background — what Odoo tours are

Odoo ships small JavaScript files under `static/tests/tours/` that script a browser through a canonical user flow: click this button, type into this field, assert this text appears, move to the next screen. They are in-repo end-to-end tests written in a tiny DSL that the server runs against its own client. For `pos_sale`, a tour might open an existing sale order, add a down-payment line, tender cash, and verify the receipt. For the analyst, reading one tour is usually the fastest way to understand what the addon *actually does* from the user's perspective — often clearer than view XML or OWL components, both of which describe layout rather than flow. That is why Phase 3 treats tours as a first-class source.
