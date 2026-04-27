# Zack's Retail — Company Knowledge

Living reference for business and operational facts about the company. Updated in place by `/index-knowledge` and by hand. Dated records of *how a fact was learned* live in [`dev/specs/`](dev/specs/) or [`dev/handoffs/`](dev/handoffs/); this doc is the *current state*.

Scope: who the company is, what it sells, where, at what scale, in what currency, on what rhythm. **Not** technical architecture (that's [`ARCHITECTURE.md`](ARCHITECTURE.md)); **not** module implementation (that's [`modules/`](modules/)); **not** end-user screen flows (that's [`zacks-retail-manual/`](zacks-retail-manual/)).

Target size: under 400 lines. If a section bloats, split it out.

## Overview

Retail chain operating in **Honduras** — brick-and-mortar stores plus an online storefront under development. The legacy operating system is **RICS v7.7** (Windows / Access-based); Zack's Retail is the modern web-based replacement, rolling out in phases A → B → C (see [`ARCHITECTURE.md`](ARCHITECTURE.md) "Rollout phases"). RICS remains live in the stores during Phase A; operators still transact against it daily.

**Primary business:** women's shoes. Secondary categories exist (see "Categories" below).

## Currency

All monetary values are in **Honduran Lempira** (`HNL`, symbol `L`). The system is single-currency — no other currency is introduced.

**Display policy** (enforced in code — see [`CLAUDE.md`](../CLAUDE.md) "Currency"):
- Plain numbers with comma thousands separators and two decimals: `1,234.56`, `1,860`.
- **No currency symbol inside cells, chart axes, tooltips, CSV, or XLSX.** The repetition adds noise; the data is single-currency.
- One-line "Amounts in Lempira (HNL)" note at the top of reports, purchase orders, and ledgers where unit clarity matters.
- Never hardcode `$`, `USD`, or `en-US` currency formatters. Use `Intl.NumberFormat` without `style: 'currency'`, or the `es-HN` locale without currency style.

## Chain structure

Four chains total, each budgeted for separately. Same SKU can be carried by multiple chains.

### 1. Unlimited

- Stores: **1–8, 11–15, 26, 28–34** (20 stores)
- Store number ranges span the roster; not every integer in the range is necessarily an Unlimited store — the explicit list above is authoritative.

### 2. Magic Shoes & Fashion

- Stores: **10, 16, 17, 20–22, 24, 25, 35, 41–43** (13 stores)

### 3. TBD

- Stores: _TBD — operator to fill in_
- Role: _TBD_

### 4. TBD

- Stores: _TBD — operator to fill in_
- Role: _TBD_

### Cross-chain notes

- **SKUs** can be available in multiple chains (e.g. a women's shoe carried by both Unlimited and Magic Shoes).
- **Stores** belong to exactly one chain (assumed — correct this if wrong).
- Store numbers in `rics_mirror.store_master.number` are authoritative; the chain → store roster lives in `app.store_group` once the purchase-planning v2 persistence lands.

## Categories

RICS category codes are 1–999. Known ranges:

| Range | Label | Notes |
|---|---|---|
| **556–599** | Women's shoes | The core business. Used by the storefront (`RICS_STOREFRONT_CATEGORY_MIN=556`, `RICS_STOREFRONT_CATEGORY_MAX=599`) and by the planned chain-level purchase plans. |
| _other ranges_ | _TBD — fill in as documented_ | |

Categories are grouped into **departments** (contiguous ranges: `departments.beg_categ ≤ category.number ≤ departments.end_categ`) and into **sectors** (larger groupings of departments, 1–99).

## Seasons

Retail seasons, as encoded in the inquiry sales-rollup computation:

| Season | Window |
|---|---|
| **Spring** | Feb 1 – Jul 31 |
| **Fall** | Aug 1 – Jan 31 (crosses year boundary) |

Fiscal-period close lifecycle (Close Week / Month / Season / Year) is owned by the [`accounts-receivable`](modules/accounts-receivable.md) module.

## Store rosters (canonical)

> ⚠️ May be stale per 2026-04-25 /index-knowledge pass: `rics_mirror` schema was dropped on 2026-04-25 (migration `20260425113000_drop_rics_mirror_schema`). Store labels for live reads now come from `app.store_master`. Review and remove the `rics_mirror.store_master` reference if confirmed no longer accurate.

For now, the canonical roster is in `rics_mirror.store_master` (reloaded from RICS each sync). The chain → store mapping is informal — lives only in this doc — until `app.store_group` + `app.store_group_member` land with purchase-planning v2.

A frontend mirror of the chain → store mapping lives at [`apps/web/src/constants/storeChains.ts`](../apps/web/src/constants/storeChains.ts) so the Sales by Day chain shortcut and any other UI that needs to expand a chain into its store list can do so without a round-trip. **Keep that file in lockstep with the rosters in this section** until `app.store_group` lands and replaces both.

**No first-class chain column in `app.store_master`.** Verified 2026-04-26: every row imports with `region = 0` (37 of 37 stores). The legacy import did not bring chain identity through; chain affiliation lives only in the description prefix (e.g. `UNLIMITED METROMALL`, `Magic Shoes CityMall`, `Mercaderia Dañada`). Reports that need a chain criteria today derive it as `SPLIT_PART(store_master.desc, ' ', 1)` — see the Inventory Aging report's dimensions endpoint at [`apps/api/src/services/reports/inventoryAgingPg.ts`](../apps/api/src/services/reports/inventoryAgingPg.ts) (`getAgingDimensions`). The prefix-derivation is a stopgap; once the operator confirms the canonical chain taxonomy, an `app.store_master.chain` column (or `app.store_group` membership) replaces it.

Store numbers observed in sales / transfer reports include (non-exhaustive, pulled from real data): 1, 2, 5–8, 9 (The Jeans Company Tg), 10 (Magic Shoes MP.SPS), 12 (UNLIMITED MEGAMALLSP), 13 (UNLIMITED MIRAFLORES), 14 (UNLIMITED METROMALL), 15 (GIANNI SALVATORE), 16 (THE PLACE MIRAFLORES), 17 (La Femme Multiplaza), 18 (Tienda 18), 19, 20 (Magic Shoes), 21 (Magic ShoesMetroMall), 22 (Magic Shoes Galerias), 23 (La Femme Cascadas), 24 (Magic Shoes Cascadas), 25 (Magic Shoes CityMall), 26, 28 (UNLIMITED LASCASCADA), 29 (Unlimited GaleriasSP), 30 (Unlimited CityMall T), 31 (Unlimited City SPS), 32 (Unlimited Premier), 35 (Magic Shoes City Teg), 41, 42 (Traffic Cascasdas), 43 (TRAFFIC City Mall TG), 90 (Mercaderia Dañada), 91 (UNLIMITED PREMIER DÑ), 97, 99 (BODEGA GENERAL).

## Operational rhythm

- **POS batches** — daily per-store batch-of-sales lifecycle (start / close / count money / over-short). Post-to-inventory at batch close.
- **Transfers** — inter-store transfers track in `rics_mirror.inv_changes` with `chg_type = 'TOU'` (transfer-out) / `'TIN'` (transfer-in).
- **RICS MDB sync** — operator-invoked via `pnpm sync:rics`. Cadence is currently manual (on demand).
- **Pricing** — four price slots per SKU (List / Retail / Markdown 1 / Markdown 2); one is flagged "current." Price changes can be scheduled future-dated with an optional auto-revert.

## Goals (TBD — operator to fill in)

_Placeholder for company-level goals. Examples of what goes here when known:_

- _Revenue / GMV targets by chain or by season_
- _Inventory-turn targets per category_
- _Over-stock or under-stock tolerance per chain_
- _Expansion plans (new stores / new chains / new cities)_
- _Systems goals (retire RICS by date X, cut over chain Y first, etc.)_

## RICS heritage

The predecessor system is **RICS v7.7**, a Windows/Access-based retail operations system. The user manual at [`docs/rics-reference/77manual.pdf`](rics-reference/) is the ancestor spec — cited for lineage when porting a feature, not as the forward source of truth. The Zack's Retail user manual at [`docs/zacks-retail-manual/`](zacks-retail-manual/) has superseded it for forward-looking design.

### What's explicitly not being ported from RICS

(Short list; full table in [`MODULES.md`](MODULES.md).)

- Modem / dial-up communications, diskette POS sync, Call-and-Poll registers — replaced by real-time cloud sync.
- Job List / Super Jobs / Unattended Backup — replaced by scheduled tasks under `platform`.
- RICS.CFG editor — replaced by typed settings + feature flags.
- Macros — replaced by saved views + keyboard shortcuts.
- DOS prompt, screen spool, bar-code printer driver setup — not relevant to a web UI.
- Dial-up / modem test / find-port utilities — not relevant.

## How this document evolves

- **Additive by default.** New facts about the business → updates here.
- **Annotate, don't overwrite, for staleness.** When a fact becomes outdated (store count changes, a chain rebrands, goals evolve), mark the old entry `> ⚠️ May be stale per <date> — review.` rather than silently rewriting. Operator does the final delete.
- **Routed by `/index-knowledge`.** Company / business insights from conversations land here.
- **TBD placeholders are expected.** Don't remove them until the value is actually known — an explicit TBD is more honest than silent absence.
- **Under 400 lines.** If this doc sprawls past that, split the biggest section out (e.g. "Store directory" as its own file once it's fuller).
