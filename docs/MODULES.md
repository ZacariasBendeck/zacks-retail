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
| 1 | **products** | SKUs, taxonomy (dept/category/group/season/keyword), vendors, size types, NRF codes, pricing, perks, pictures, stock labels, UPC cross-reference, UPC generation, GMAIC vendor UPC import. | Ch. 11 (File Setup: SKUs, Vendors, Categories, Departments, Groups, Size Types, Keywords, Return Codes, Promotion Codes), Ch. 4 (Price Changes, Discounts, Discontinue SKUs, Change Average Cost), Ch. 5 (Labels + UPC) | `products-dev` |
| 2 | **inventory** | On-hand, on-order, movements ledger, multi-location, transfers (manual / auto / balancing), models + max + reorder, inventory inquiry, find-by-size, change detail, inventory detail report, recommended transfer report, transfer summary. | Ch. 4 (most of Stock Maintenance) | _unassigned — use `rics-module-analyst` for spec evolution_ |
| 3 | **physical-inventory** | Worksheets, count entry, portable scanner ingestion, items-not-counted, variance report, inventory update. | Ch. 10 | _unassigned — use `rics-module-analyst` for spec evolution_ |
| 4 | **purchasing** | Purchase orders (entry / receive / combine / merge / replicate / duplicate), auto POs, order worksheets, ASN cartons, reset future orders, PO reports, open P.O. by month. | Ch. 3 | _unassigned — use `rics-module-analyst` for spec evolution_ |
| 5 | **otb-planning** | Open-To-Buy plan setup per store × category × month (two calculation methods — fixed percentages and % change vs. last year), 12-month OTB projection, OTB vs. Sales comparison, integration points with `purchasing` (PO dollars against plan) and `sales-reporting`. | Ch. 11 (OTB Plan, p. 158), Ch. 6 (OTB Report p. 100, OTB vs. Sales p. 100), Ch. 17 (Company Setup — OTB calculation method) | _unassigned — use `rics-module-analyst` for spec evolution_ |
| 6 | **sales-pos** | Sales ticket entry (header / detail / tender) for regular sales, manager options, batch-of-sales lifecycle (start / close / count money / over-short), refunds, void / reclaim / reprint, credit slips, pay outs, cash drawer, post-sales-to-inventory, sales tax recap, sales-by-day, reprint posted sales, returned sales report, promotion code analysis, change sales passwords. Owns the sales-ticket framework that `customer-transactions` extends. | Ch. 2 (register core), Ch. 13 (customer-facing register flow only; sync infrastructure dropped) | _unassigned — use `rics-module-analyst` for spec evolution_ |
| 7 | **customer-transactions** | Transaction types that require a customer account and have their own lifecycle beyond a single ticket: special orders (deposit / pickup / refund / print), layaways (sale / payment / pickup / refund / print), gift certificate sales + redemptions + maintenance + activity report, house charge sales + payments + print. Extends `sales-pos` ticket flow; depends on `crm` for customer accounts; reports into `accounts-receivable` where relevant. | Ch. 2 (Special Orders pp. 36–37, Layaways pp. 38–39, Gift Certificate pp. 40, House Charge pp. 40–41, related print reports), Ch. 9 (Gift Certificate Maintenance p. 131, Print Gift Certificate Activity p. 132) | _unassigned — use `rics-module-analyst` for spec evolution_ |
| 8 | **sales-reporting** | Sales Analysis (with all its options), 8-week trending, best sellers, sales history by month, stock status, size type analysis, sales by time / SKU / salesperson, sales journal, sales-by-day summary, exports (NPD, inventory quantities CSV, SKUs HTML). | Ch. 6 (most, minus OTB), Ch. 2 (report sub-sections: Sales by Time p. 41, Sales by SKU p. 43, Sales Journal p. 44) | _unassigned — use `rics-module-analyst` for spec evolution_ |
| 9 | **crm** | Customer / mail list, family members, mail detail, print mail list + labels, customer analysis, quotes (setup + entry + pricing applied at sale), frequent buyer plan, import mail list, stored labels, delete / clear mail list totals, change account numbers. | Ch. 9, Ch. 15 (Frequent Buyer Plan, pp. 201–205), Ch. 17 (Mail List Setup p. 218) | _unassigned — use `rics-module-analyst` for spec evolution_ |
| 10 | **accounts-receivable** | A/R setup (terms, grace period, finance charges, statement format, dunning messages), customer A/R accounts (balance-forward vs. open-item), payments, adjustments, aged trial balance, A/R detail + transaction summary, statements (monthly rollover with finance-charge application), purge A/R detail, A/R year rollover. **Also**: fiscal-period operations — General Ledger summary (monthly debit/credit by Cash / Non-Cash / House / Special Orders / Layaways / Gift Certs / Sales Tax / Sales / COGS / Other / Payouts / Over-Short), close week / month / season / year, period-to-date rollups, fiscal calendar, Season Setup — since these share the fiscal-period primitive with A/R year rollover. | Ch. 16, Ch. 8 (Close Week / Month / Season / Year — retention purges moved to `platform`), Ch. 6 (GL Summary p. 100), Ch. 17 (Season Setup p. 218) | _unassigned — use `rics-module-analyst` for spec evolution_ |
| 11 | **employees** | Salespeople, time clock (login / logout / admin / print), commission overrides, hours + perks, salesperson analysis, close salesperson period, users + auth + permissions, sales passwords, manager options. | Ch. 7, Ch. 11 (Users p. 163) | _unassigned — use `rics-module-analyst` for spec evolution_ |
| 12 | **store-ops** | Stores, sales taxes (+ category overrides), tender types, bill-to addresses, case packs, company setup, sectors. | Ch. 11 (Stores, Sales Tax Override, Case Packs), Ch. 17 (Company Setup p. 214) | _unassigned — use `rics-module-analyst` for spec evolution_ |
| 13 | **platform** | Background workers + scheduled tasks (replaces Ch. 14 Job List / Super Jobs / Unattended Backup), generalised audit log (the super-set of `otb_policy_audit_log` + `otb_budget_audit`), notifications / reminders / store broadcasts (unifies Ch. 14 Reminders + Ch. 13 Send Messages to Stores), typed settings + feature flags (replaces RICS.CFG), managed-Postgres backup observability, integrations transport + durable message log (EDI including SPS Commerce from Ch. 14; GMAIC Vendor UPC inbound transport from Ch. 5 — parse lives in `products`; optional marketplace/external-sales inbound connector — handler lives in `sales-pos`), data retention purges (sales transactions, time clock, deleted keys, auto-delete SKUs, inventory changes, gift certificate data, orphaned SKU asset files), saved views + keyboard shortcuts (replaces Ch. 15 Macro Management), admin telemetry (live dashboard replacing System Status Report). | Ch. 14, Ch. 15 (DB utilities + RICS.CFG reimagined as feature flags, Macro Management reimagined as saved views + shortcuts, Reset Pictures reimagined as orphaned-asset retention), Ch. 13 (Send Messages to Stores reimagined as in-app broadcasts; dial-up sync dropped), Ch. 8 (retention purges only — fiscal closes moved to `accounts-receivable`), Ch. 5 (GMAIC Vendor UPC inbound transport only — parse + apply stay in `products`), Ch. 17 (System Status Report) | _unassigned — use `rics-module-analyst` for spec evolution_ |

> `storefront-dev` is not a module owner — it owns the cross-module storefront UI surface (cart, checkout, orders, account pages) and its supporting public API routes. Invoke it for storefront feature work that spans modules.

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
| Change Salespeople / Size Columns / Size Types / Categories / Vendors / Seasons / Groups / Keywords batch tools (Ch. 15) | Collapsed into ordinary admin edit flows in each module; no separate "rename/renumber utility" screen. |

---

## How to evolve this registry

1. Drop the RICS manual PDF at [rics-reference/77manual.pdf](rics-reference/77manual.pdf).
2. Invoke the `rics-module-analyst` sub-agent with "propose initial module breakdown" to get a refined module list, or with a specific module name (e.g., `products`) to produce a deep spec at `docs/modules/<name>.md`.
3. Work through the modules one at a time. Don't try to spec everything in parallel — the point of this structure is that each module can be picked up independently.
