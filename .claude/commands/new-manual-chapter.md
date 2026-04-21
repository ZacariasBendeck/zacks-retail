---
description: Scaffold a Zack's Retail user manual chapter. Chapters are FORWARD SPECS — written ahead of UI, superseding the RICS v7.7 manual. Writes `docs/zacks-retail-manual/<slug>.md` from a template and updates INDEX.md. Requires a module slug argument.
---

# new-manual-chapter

Scaffold a Zack's Retail user manual chapter for the module named in `$ARGUMENTS`.

## The manual's role

The Zack's Retail user manual at `docs/zacks-retail-manual/` is the **forward-looking specification** for the system. It supersedes the RICS v7.7 manual at `docs/rics-reference/77manual.pdf` as the source of truth. Chapters can be written **before** the corresponding UI ships — they describe what the system will do, the same way the RICS manual did for its era.

**Manual chapter vs. module spec — both are authoritative, different audiences:**

| `docs/modules/<slug>.md` | `docs/zacks-retail-manual/<slug>.md` |
|---|---|
| Developer / agent audience | End-user and developer reference |
| WHAT & WHY (contract, modernization decisions, data surfaces, phase gates) | HOW (screens, flows, reports, keyboard shortcuts, error messages) |
| Structured around code boundaries | Structured around user tasks |
| Cites RICS manual page numbers for lineage | Cites RICS manual chapters as ancestry; own authority going forward |

Cross-link: manual chapter → module spec. Module specs do **not** link forward to the manual.

## Status lifecycle

| Status | Meaning |
|---|---|
| **Draft** | Scaffolded, content needs drafting |
| **Spec** | Design complete; UI not yet shipped. Chapter describes intended behavior. |
| **In progress** | UI partially shipped; chapter evolving as screens stabilize. |
| **Stable** | Chapter matches shipped UI; reviewed. |
| **Stale** | Drift detected between chapter and shipped UI; resync needed. |

## Preconditions

- `$ARGUMENTS` must be a valid module slug from the registry in `docs/MODULES.md`. Valid slugs as of 2026-04-21: `products`, `inventory`, `physical-inventory`, `purchasing`, `otb-planning`, `sales-pos`, `customer-transactions`, `sales-reporting`, `crm`, `accounts-receivable`, `employees`, `store-ops`, `platform`, `purchase-planning`.
- The module's developer spec at `docs/modules/<slug>.md` must exist. If it doesn't, stop and tell the user — a manual chapter without a matching module spec is an orphan.
- If `docs/zacks-retail-manual/<slug>.md` already exists, stop. Do not overwrite. Point the operator at the existing file.

## Steps

1. **Validate the slug.** Read `docs/MODULES.md`, extract the registry table, confirm the slug is present. Capture its display name, goal, and RICS chapter mapping.
2. **Check preconditions** (spec exists, chapter file absent).
3. **Ensure the directory** `docs/zacks-retail-manual/` exists. Create it if not.
4. **Ensure `docs/zacks-retail-manual/INDEX.md` exists.** If it doesn't, create it from the INDEX template below.
5. **Scaffold `docs/zacks-retail-manual/<slug>.md`** from the chapter template below. Pre-fill: display name, module-spec link, RICS-chapter ancestry, goal (paraphrased from registry for end-user voice). Leave Screens / Common tasks / Reports / Errors sections with TODO markers — those depend on the UI direction, which varies per module.
6. **Update INDEX.md** to add or update the row for this chapter. Ordering follows the registry (1. products, 2. inventory, …, 13. platform, N1. purchase-planning).
7. **Report what was created** — full paths, summary of what to fill in next, and a note about screenshot location.

## INDEX.md template (create only if missing)

```markdown
# Zack's Retail — User Manual

> **Forward spec for Zack's Retail.** Supersedes the RICS v7.7 manual at [../rics-reference/77manual.pdf](../rics-reference/77manual.pdf) as the system's source of truth. The RICS manual is ancestry — cited as lineage, not live spec.
>
> **Audience:** store operators, cashiers, managers, developers, administrators. The developer-facing module contracts at [../modules/](../modules/) cross-reference these chapters.
>
> **Status:** living document. Chapters can be written ahead of UI (status Spec) and evolve as screens ship.

## Conventions

- **Currency:** HNL (Honduran Lempira). Plain numbers with thousands separators — no `$`, no `L` inside tables or on-screen cells. Reports carry one top-of-page note: "Amounts in Lempira (HNL)".
- **Keyboard shortcuts** shown as `Ctrl+S`-style.
- **Screenshots:** `assets/<module-slug>/`.
- **Status legend:** Draft (scaffolded) • Spec (design done, UI pending) • In progress (UI shipping) • Stable (matches UI, reviewed) • Stale (drift detected)

## Chapters

| # | Chapter | Module spec | RICS ancestry | Status |
|---|---|---|---|---|
| _(rows added by `/new-manual-chapter`)_ | | | | |

## How this manual evolves

- Add a chapter: `/new-manual-chapter <slug>`.
- Update Status as UI progresses (Draft → Spec → In progress → Stable).
- When a module's scope changes, update the manual chapter and module spec in the same commit.
- Never reference `legacy/`, branches, or PR workflows in manual content.
```

## Chapter template

Placeholders in `<angle brackets>`. Do not include HTML comments in the final file.

```markdown
# <Chapter number>. <Module Display Name>

> **Status:** Draft
> **Module spec:** [../modules/<slug>.md](../modules/<slug>.md)
> **RICS ancestry:** <copied from registry RICS-chapters column>
> **Last updated:** <today's date YYYY-MM-DD>

## What this module does

<One paragraph. Paraphrase from the registry "Goal" column for an end-user voice. Replace developer phrasing like "owns the SKU identity" with user phrasing like "lets merchandisers add, edit, and retire items.">

## Audience

- **<Role 1>** — <what they do here>
- **<Role 2>** — <what they do here>
- **<Role 3>** — <what they see here but rarely edit>

## Prerequisites

- <Prerequisite 1 — e.g. dependency on another module's data being present>
- <Prerequisite 2>

## Screens

_TODO: enumerate top-level screens, one subsection each. For each: route path, purpose, fields, actions, screenshot. For chapters at Status: Spec (pre-UI), describe intended behavior; mark screens as "intended" until UI ships._

### <Screen name>

**Path:** `<route>`
**Purpose:** <one sentence>

**Fields:**
- <field>: <what it is>

**Actions:**
- <button>: <what it does>

## Common tasks

_TODO: numbered step-by-step flows for the most-used operations. Bread-and-butter of the manual._

### <Task name>

1. <step>
2. <step>

## Reports

_TODO: list every report this module produces._

| Report | Where | Filters | Exports |
|---|---|---|---|
| <name> | <path> | <list> | <CSV / XLSX / PDF / print> |

## Keyboard shortcuts

_TODO: list as UI ships._

| Shortcut | Action |
|---|---|
| <keys> | <action> |

## Common errors

_TODO: enumerate as validation and error surfaces solidify._

| Message | Meaning | How to fix |
|---|---|---|
| <text> | <cause> | <fix> |

## Data sources (current)

- **Primary read:** <from module spec — e.g. `rics_mirror.inventory_master` for Phase A, `products.sku` for Phase C>
- **Primary write:** <from module spec — e.g. `public.ProductContent`, `app.<table>`>

## Related modules

- [<Other module>](<other-slug>.md) — <how they relate>

## What's different from RICS

_TODO: list user-visible differences from the RICS equivalent. Draw from the "Modernization decisions" section of the module spec, but filter to things a user would notice (workflow changes, new data, removed steps)._
```

## Output on success

```
Created:
  docs/zacks-retail-manual/<slug>.md
  (docs/zacks-retail-manual/INDEX.md — new)  [only if this was the first chapter]
Updated:
  docs/zacks-retail-manual/INDEX.md — added row for <slug>

Next steps:
  1. Set Status to "Spec" once the module's design is complete, or leave at "Draft" until then.
  2. Fill in "Screens" and "Common tasks" as UI direction crystallizes.
  3. Draft "What's different from RICS" from the module spec's Modernization decisions.
  4. Drop screenshots at docs/zacks-retail-manual/assets/<slug>/ when UI ships.
  5. Flip Status to "Stable" once chapter matches shipped UI.
```

## Rules

- **Never overwrite an existing chapter.** If the chapter file exists, stop and tell the user.
- **Currency: HNL plain numbers.** Never use `$`, `USD`, or an `en-US` currency format in generated content or template examples.
- **No branch/PR/worktree language.** Commit to `master` directly.
- **Don't auto-fill Screens or Common-tasks from the module spec.** The spec describes code boundaries; the manual describes user flows. Auto-copying creates confusion. Leave TODOs and let the operator draft.
- **Don't link forward from module specs to manual chapters.** Links go manual → spec only.
- **Don't touch `legacy/`.** Never reference it.
- **Don't subagent-delegate this work.** Subagents are retired; run this command in plain Claude Code or as-is.
- **Don't compile PDFs here.** PDF is a separate (future) workflow.

## Example invocations

- `/new-manual-chapter products` — scaffold the Products chapter.
- `/new-manual-chapter otb-planning` — scaffold OTB Planning.
- `/new-manual-chapter purchase-planning` — net-new module, no RICS ancestry.
