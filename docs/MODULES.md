# Zack's Retail — Module Registry

The domain split of Zack's Retail into bounded contexts. Each module is:

- **Ownable by one engineer or agent** — clear scope, limited dependencies
- **Traceable to RICS chapters** — the manual at [rics-reference/](rics-reference/) is the spec
- **Web-first** — no modems, diskettes, job lists, RICS.CFG, or screen spool files

---

## Modules (refined after `rics-module-analyst` pass)

The `rics-module-analyst` agent read the manual's TOC, sampled Sales (Ch. 2), Stock Maintenance (Ch. 4), Sales Reports (Ch. 6), File Setup (Ch. 11), and Accounts Receivable (Ch. 16), and refined the initial 13-module proposal. Changes made:

- Split **OTB planning + OTB reports** out of `purchasing` into their own module (`otb-planning`). In RICS the OTB Plan (p. 158) is a distinct data surface with its own setup screen and two dedicated reports (OTB vs. Sales p. 100, OTB Report p. 100); keeping it inside `purchasing` hid the fact that it's consumed by `sales-reporting` too. The codebase is already moving this way (`otbBudgetRoutes`, `otbMonthlyPlanRoutes`).
- Merged **labels-barcodes** into `products`. Ch. 5 is ~5 pages — stock label printing, UPC cross-reference, UPC generation. It's SKU-feature surface, not a bounded context of its own.
- Renamed `pos` → **sales-pos** to reflect that this module owns all of Ch. 2 (batch-of-sales, special orders, layaways, gift certs, house charges, close batch, count money, post-to-inventory closeout), not just the register keypresses.
- Split **fiscal close** (`finance-close`) from **data retention** (moved into `platform`). Ch. 8 mixes the two — Close Week / Month / Season / Year is a fiscal-period lifecycle concern that belongs with GL Summary, but Clear Saved Sales Transactions / Clear Deleted Record Keys / Clear Saved Inventory Changes / Auto-Delete SKUs / Clear Saved Time Clock Data / Clear Gift Certificate Data are retention-policy plumbing that belongs in `platform`.

Further refinements after user review (2026-04-17):

- **Split `sales-pos` → `sales-pos` + `customer-transactions`.** The register core (regular sales, refunds, batch lifecycle, cash drawer, pay outs, post-to-inventory) stays in `sales-pos`. The customer-account-linked transaction types — special orders (deposit + pickup + refund), layaways (sale + payment + pickup + refund), gift certificate sales + redemptions, house charge sales + payments — become a separate module that depends on `sales-pos` (ticket framework) and `crm` (customer account). Each of these types has its own report (Print Special Orders, Print Layaways, Print House Payments/Charges, Print Gift Certificate Activity) and its own downstream implications in A/R and CRM; isolating them keeps `sales-pos` focused on the register.
- **Folded `finance-close` into `accounts-receivable`.** GL Summary + close week/month/season/year + Season Setup live with the A/R year rollover since they share the fiscal-period primitive. The A/R module's name stays — renaming to `finance` is deferred until we need it.
- **Quotes stay in `crm`** (customer-anchored; per-customer state in one place).
- **Retention purges stay in `platform`** (centralized retention admin, one cadence).

| # | Module | Goal | RICS chapters | Owner |
|---|---|---|---|---|
| 1 | **products** | SKUs, taxonomy (dept/category/group/season/keyword), vendors, size types, NRF codes, pricing, perks, pictures, stock labels, UPC cross-reference, UPC generation, GMAIC vendor UPC import. | Ch. 11 (File Setup: SKUs, Vendors, Categories, Departments, Groups, Size Types, Keywords, Return Codes, Promotion Codes), Ch. 4 (Price Changes, Discounts, Discontinue SKUs, Change Average Cost), Ch. 5 (Labels + UPC) | _operator-owned; agent invocation retired 2026-04-21_ |
| 2 | **inventory** | On-hand, on-order, movements ledger, multi-location, transfers (manual / auto / balancing), models + max + reorder, inventory inquiry, find-by-size, change detail, inventory detail report, recommended transfer report, transfer summary. | Ch. 4 (most of Stock Maintenance) | _unassigned — operator-owned; agent invocation retired 2026-04-21_ |
| 3 | **physical-inventory** | Worksheets, count entry, portable scanner ingestion, items-not-counted, variance report, inventory update. | Ch. 10 | _unassigned — operator-owned; agent invocation retired 2026-04-21_ |
| 4 | **purchasing** | Purchase orders (entry / receive / combine / merge / replicate / duplicate), auto POs, order worksheets, ASN cartons, reset future orders, PO reports, open P.O. by month. Purchasing owns PO lifecycle and receiving mechanics; `import-management` owns international voyage/container/goods-in-transit/customs/liquidation logic and may supply estimated/final landed unit costs to linked PO lines. | Ch. 3 | _unassigned — operator-owned; agent invocation retired 2026-04-21_ |
| 5 | **otb-planning** | Open-To-Buy plan setup per store × category × month (two calculation methods — fixed percentages and % change vs. last year), 12-month OTB projection, OTB vs. Sales comparison, integration points with `purchasing` (PO dollars against plan), `import-management` (estimated/final landed HNL commitments), and `sales-reporting`. | Ch. 11 (OTB Plan, p. 158), Ch. 6 (OTB Report p. 100, OTB vs. Sales p. 100), Ch. 17 (Company Setup — OTB calculation method) | _unassigned — operator-owned; agent invocation retired 2026-04-21_ |
| 6 | **sales-pos** | Sales ticket entry (header / detail / tender) for regular sales, manager options, batch-of-sales lifecycle (start / close / count money / over-short), refunds, void / reclaim / reprint, credit slips, pay outs, cash drawer, post-sales-to-inventory, sales tax recap, sales-by-day, reprint posted sales, returned sales report, promotion code analysis, change sales passwords. Owns the sales-ticket framework that `customer-transactions` extends. | Ch. 2 (register core), Ch. 13 (customer-facing register flow only; sync infrastructure dropped) | _unassigned — operator-owned; agent invocation retired 2026-04-21_ |
| 7 | **customer-transactions** | Transaction types that require a customer account and have their own lifecycle beyond a single ticket: special orders (deposit / pickup / refund / print), layaways (sale / payment / pickup / refund / print), gift certificate sales + redemptions + maintenance + activity report, house charge sales + payments + print. Extends `sales-pos` ticket flow; depends on `crm` for customer accounts; reports into `accounts-receivable` where relevant. | Ch. 2 (Special Orders pp. 36–37, Layaways pp. 38–39, Gift Certificate pp. 40, House Charge pp. 40–41, related print reports), Ch. 9 (Gift Certificate Maintenance p. 131, Print Gift Certificate Activity p. 132) | _unassigned — operator-owned; agent invocation retired 2026-04-21_ |
| 8 | **sales-reporting** | Sales Analysis (with all its options), 8-week trending, best sellers, sales history by month, stock status, size type analysis, sales by time / SKU / salesperson, sales journal, sales-by-day summary, exports (NPD, inventory quantities CSV, SKUs HTML). | Ch. 6 (most, minus OTB), Ch. 2 (report sub-sections: Sales by Time p. 41, Sales by SKU p. 43, Sales Journal p. 44) | _unassigned — operator-owned; agent invocation retired 2026-04-21_ |
| 9 | **crm** | Customer / mail list, family members, mail detail, print mail list + labels, customer analysis, quotes (setup + entry + pricing applied at sale), frequent buyer plan, import mail list, stored labels, delete / clear mail list totals, change account numbers. | Ch. 9, Ch. 15 (Frequent Buyer Plan, pp. 201–205), Ch. 17 (Mail List Setup p. 218) | _unassigned — operator-owned; agent invocation retired 2026-04-21_ |
| 10 | **accounts-receivable** | A/R setup (terms, grace period, finance charges, statement format, dunning messages), customer A/R accounts (balance-forward vs. open-item), payments, adjustments, aged trial balance, A/R detail + transaction summary, statements (monthly rollover with finance-charge application), purge A/R detail, A/R year rollover. **Also**: fiscal-period operations — General Ledger summary (monthly debit/credit by Cash / Non-Cash / House / Special Orders / Layaways / Gift Certs / Sales Tax / Sales / COGS / Other / Payouts / Over-Short), close week / month / season / year, period-to-date rollups, fiscal calendar, Season Setup — since these share the fiscal-period primitive with A/R year rollover. | Ch. 16, Ch. 8 (Close Week / Month / Season / Year — retention purges moved to `platform`), Ch. 6 (GL Summary p. 100), Ch. 17 (Season Setup p. 218) | _unassigned — operator-owned; agent invocation retired 2026-04-21_ |
| 11 | **identity-access** | Internal app users, login, sessions, roles, permissions, effective access, store/data scopes, MFA/SSO readiness, password policy, access reports, and security audit events. The operator-facing screen label remains "Users"; the module name is Identity & Access. | Ch. 11 (Users p. 163) as lineage; modern auth/access is app-native | _unassigned — operator-owned_ |
| 12 | **employees** | Salespeople, time clock (login / logout / admin / print), commission overrides, hours + perks, salesperson analysis, close salesperson period, sales passwords, manager options. Depends on `identity-access` for app users/auth/permissions. | Ch. 7 | _unassigned — operator-owned; agent invocation retired 2026-04-21_ |
| 13 | **store-ops** | Stores, sales taxes (+ category overrides), tender types, bill-to addresses, case packs, company setup, sectors. | Ch. 11 (Stores, Sales Tax Override, Case Packs), Ch. 17 (Company Setup p. 214) | _unassigned — operator-owned; agent invocation retired 2026-04-21_ |
| 14 | **platform** | Background workers + scheduled tasks (replaces Ch. 14 Job List / Super Jobs / Unattended Backup), generalised audit log (the super-set of `otb_policy_audit_log` + `otb_budget_audit` and Identity & Access security events), notifications / reminders / store broadcasts (unifies Ch. 14 Reminders + Ch. 13 Send Messages to Stores), typed settings + feature flags (replaces RICS.CFG), managed-Postgres backup observability, integrations transport + durable message log (EDI including SPS Commerce from Ch. 14; GMAIC Vendor UPC inbound transport from Ch. 5 — parse lives in `products`; optional marketplace/external-sales inbound connector — handler lives in `sales-pos`), data retention purges (sales transactions, time clock, deleted keys, auto-delete SKUs, inventory changes, gift certificate data, orphaned SKU asset files), saved views + keyboard shortcuts (replaces Ch. 15 Macro Management), admin telemetry (live dashboard replacing System Status Report). | Ch. 14, Ch. 15 (DB utilities + RICS.CFG reimagined as feature flags, Macro Management reimagined as saved views + shortcuts, Reset Pictures reimagined as orphaned-asset retention), Ch. 13 (Send Messages to Stores reimagined as in-app broadcasts; dial-up sync dropped), Ch. 8 (retention purges only — fiscal closes moved to `accounts-receivable`), Ch. 5 (GMAIC Vendor UPC inbound transport only — parse + apply stay in `products`), Ch. 17 (System Status Report) | _unassigned — operator-owned; agent invocation retired 2026-04-21_ |
| 15 | **utilities** | Operator-facing batch-change surface. Criteria-based SKU picker (SKUs / Categories / Vendors / Seasons / Styles-Colors / Groups / Keywords + "future price changes" / "WTD sales" filters) feeding a shared `applyBatchChange(criteria, change)` primitive. Utilities: Change Keywords (add/remove), Change Categories, Change Vendors, Change Seasons, Change Group Codes, Change Size Columns (global label rename), Change Size Types (restructure grid with consolidation). Owns the batch-operation audit (`products_batch_operation` + items) and the undo path. All writes land in `app.*` overlay tables owned here; reads merge on top of `rics_mirror.*` via the effective-value adapter. Deferred: Reset Pictures, Check Data Integrity (rescoped as Ingest Diagnostics), Change Salespeople. | Ch. 15 (Utilities 2 — the batch-change tools from p. 193 onward). Explicitly ported: Change Size Columns (p. 193), Change Size Types (p. 193), Change Categories (p. 194), Change Vendors (p. 194), Change Seasons (p. 194), Change Group Codes (p. 194), Change Keywords (p. 195). Explicitly dropped (see cut list): Compact/Repair DB, Create/Delete DB, Backup, Test Modem, Change RICS.CFG, Macro Management, Run Other Utilities. | _unassigned — operator-owned_ |

### Net-new modules (no RICS predecessor)

| # | Module | Goal | Source of truth | Owner |
|---|---|---|---|---|
| N1 | **purchase-planning** | Forecast-driven replenishment calculator. Given historical sales and current on-hand, project 12 months of buy quantities per department / category / vendor with four selectable forecast methods (same-month-last-year, trailing average, YoY growth %, blended multi-year) and two EOH target methods (forward-demand cover, seasonal multiplier). Read-only; no persisted plans in v1. | [`docs/modules/purchase-planning.md`](modules/purchase-planning.md) — derived from four Python scripts (`presupuesto_compras*.py`), no RICS chapter. **Independent of `otb-planning`.** | _unassigned_ |
| N2 | **import-management** | ERP-style landed-cost workflow for international buying: voyages/shipments, containers, goods in transit, supplier invoices, taxable/non-taxable invoice groups, FX, estimated/final landed cost, customs/taxes, shipment liquidation, and suggested retail pricing. This is not RICS/customer CSV importing. | [`docs/modules/import-management/README.md`](modules/import-management/README.md) — net-new module derived from Zack's import workbooks (`09 Suits repeat order.xlsx`, `Liquizacion Carga Suelta Panama # 2 IB.xlsx`) and ERP landed-cost/voyage patterns. | _unassigned_ |
| N3 | **accounts-payable** | Vendor-side payables foundation: merchandise supplier bills, freight/insurance/customs-broker invoices, customs/tax authority obligations, payment applications, balances, due dates, and vendor statements. Separate from customer-side `accounts-receivable`. | [`docs/modules/accounts-payable/README.md`](modules/accounts-payable/README.md) — net-new module introduced to support `import-management` and future general vendor AP. | _unassigned_ |

> The cross-module storefront UI surface (cart, checkout, orders, account pages) and its supporting public API routes are operator-owned. Invoke slash commands from `.claude/commands/` when relevant, otherwise work in plain Claude Code.

---

## RICS features explicitly **not** being ported

| RICS concept | Reason for cutting |
|---|---|
| Modem / dial-up communications (Ch. 13, Ch. 17) | Replaced by real-time cloud sync; no modem, no COM ports, no ISP config. |
| "Copy to POS diskette" / "Copy from POS diskette" (Ch. 13) | No two-computer split — single Postgres is the source of truth. |
| Call / Poll POS Registers (Ch. 13) | Replaced by real-time sync; the register is a web client. |
| Send Messages to Stores (Ch. 13) | Replaced by in-app notifications / broadcast messages in `platform`. |
| Import Internet Sales (Ch. 13, p. 180) | Our storefront (`apps/storefront`) writes directly to the same DB — no CSV import loop. |
| Job list + Super Jobs + Run Job List (Ch. 14) | Replaced by background workers + scheduled tasks. |
| Screen Spool Files (Ch. 14) | Reports download as PDF / CSV from the browser. |
| RICS.CFG editor (Ch. 15) | Replaced by settings UI + feature flags. |
| Macros (Ch. 15) | Replaced by keyboard shortcuts + saved views / URL state. |
| Compact / Repair / Create / Delete Database (Ch. 15) | Managed Postgres — operator doesn't touch DB maintenance. |
| DOS Prompt access (Ch. 1) | Not relevant in a web UI. |
| CD / Diskette backup (Ch. 14) | Managed Postgres snapshots. |
| Bar code printer driver setup (Ch. 5) | Browser-side label generation + print. |
| Reminders stored in local config (Ch. 14) | Replaced by in-app notifications + email reminders. |
| Test Modem / Find Port (Ch. 15) | Not relevant. |
| Printer Setup in Windows / Bar Code Printer (Ch. 1) | Browser handles printing. |
| Portable Bar Code Reader (Percon PT2000) driver setup (Ch. 1) | Device-agnostic — scanner is just a keyboard input or a mobile web client. |
| Backup Database (Ch. 15) | Managed Postgres — backups are operator-invoked snapshots (`platform`), not a user utility. |
| Run Other Utilities (Ch. 15) | DOS shell-out; no web equivalent needed. |

---

## How to evolve this registry

1. Drop the RICS manual PDF at [rics-reference/77manual.pdf](rics-reference/77manual.pdf).
2. Use the `/new-module-spec <slug>` slash command to scaffold or refresh a module spec at `docs/modules/<slug>.md` against the RICS manual.
3. Work through the modules one at a time. Don't try to spec everything in parallel — the point of this structure is that each module can be picked up independently.

---

## How to use this registry

New here? Start with this file, then walk into the spec for whichever module you need to touch. Each spec at [modules/](modules/)`<name>.md` follows the canonical 9-section template scaffolded by `/new-module-spec <slug>` (sections: Goal · RICS features covered · Modernization decisions · Data model sketch · API surface · UI surface · Dependencies · Contracts exposed · Out of scope for v1 · Open questions).

**Routing guide for changes**

| You want to… | How |
|---|---|
| Change the module decomposition (split, merge, rename, add a new module) | Edit this file directly. Describe the change to plain Claude Code and iterate. |
| Produce or update a single module's spec | `/new-module-spec <slug>` to scaffold or refresh against the RICS manual. |
| Implement / fix any module | Open the relevant `docs/modules/<slug>.md` and work in plain Claude Code. |

The "RICS features explicitly **not** being ported" table above is the canonical cut list. New specs' Modernization decisions sections should reference it rather than restate it.
