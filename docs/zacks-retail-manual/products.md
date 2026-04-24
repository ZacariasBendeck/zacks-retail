# 1. Products

> **Status:** Draft
> **Module spec:** [../modules/products.md](../modules/products.md)
> **RICS ancestry:** Ch. 4 (Price Changes, Discontinue SKUs, Change Average Cost), Ch. 5 (Labels + UPC), Ch. 11 (File Setup — SKUs, Vendors, Categories, Departments, Groups, Size Types, Keywords, Return Codes, Promotion Codes)
> **Last updated:** 2026-04-21

## What this module does

Products is the catalog. It holds every item Zack's Retail can sell, buy, or count — together with the data that describes, classifies, and prices each one. Merchandisers create and retire SKUs; buyers record vendor agreements; pricing staff schedule price changes and bulk discounts; designers manage product imagery and stock-label templates. Every other module — inventory, purchasing, sales, reporting, CRM — reads from this one.

## Audience

- **Merchandisers** — add, edit, and retire items; manage taxonomy (departments, categories, groups, keywords, seasons); maintain size types and NRF codes.
- **Buyers** — record vendor agreements, vendor SKUs, GMAIC vendor UPC imports.
- **Pricing staff** — schedule price changes (current/future/revert), run bulk price discounts, adjust average cost.
- **Marketing / web content** — maintain the web-facing content overlay (enriched descriptions, images, facets).
- **Cashiers** — read-only view via the SKU Lookup modal at the POS and on the Inventory Inquiry screen.

## Prerequisites

- At least one **vendor** exists ([Store Operations](store-ops.md) governs vendor master until a dedicated screen is built here).
- At least one **department** + **category** exists (same — seed via Store Ops until products taxonomy screens ship).

## Screens

_TODO: enumerate as UI ships. Intended screens per module spec:_
- _SKU list + search + filter_
- _SKU detail (edit mode)_
- _SKU Lookup modal (cross-module; used by POS + Inquiry)_
- _Taxonomy admin — departments, categories, groups, keywords, seasons, size types_
- _Vendors list + detail_
- _Price changes (enter + review + approve pending)_
- _Bulk price discounts_
- _Stock labels (generate + print)_
- _UPC cross-reference + generation_
- _GMAIC vendor UPC import_
- _Pictures_

## Common tasks

_TODO: fill in as UI ships. Expected flows:_
- _Add a new SKU_
- _Reprice a single SKU_
- _Run a category-wide markdown_
- _Schedule a future price change with auto-revert_
- _Generate stock labels for a received PO_
- _Import a GMAIC vendor UPC file_
- _Discontinue a SKU (merging activity into a replacement)_

## Reports

_TODO: list as built._

| Report | Where | Filters | Exports |
|---|---|---|---|
| UPC Cross-Reference | — | Vendor, filter "no vendor UPC" | PDF / CSV |
| Stock Labels | — | SKU, PO, category, label type | Print |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources (Phase A)

- **Primary read:** `app.sku` for live SKU identity / lifecycle / pricing fields; `rics_mirror.vendor_master`, `rics_mirror.categories`, `rics_mirror.departments`, `rics_mirror.group_codes`, `rics_mirror.keywords`, `rics_mirror.size_types`, `rics_mirror.nrma_codes`, `rics_mirror.marketing_code`, `rics_mirror.return_codes`, `rics_mirror.sectors` for reference surfaces that do not yet have an app-owned authoritative table.
- **Primary write:** `public.ProductContent` (web-facing content overlay), `public.SeasonOverlay`, `public.ProductsAuditLog`.
- **Future (Phase B+):** `products.*` schema will own SKU master, taxonomy, vendor master, and pricing once RICS retires as the authoring surface.

## Related modules

- [Inventory](inventory.md) — reads SKU master for on-hand and movements.
- [Purchasing](purchasing.md) — reads vendor master and SKU for PO entry.
- [Sales / POS](sales-pos.md) — reads SKU, price, size type for ticket entry.
- [Sales Reporting](sales-reporting.md) — joins taxonomy for rollups.
- [Store Operations](store-ops.md) — governs per-store overrides (tax category, label type).

## What's different from RICS

_TODO — draft from module spec's Modernization decisions. Key user-visible changes will include:_
- _Future-dated price changes apply automatically at store-open, not via on-next-login prompt._
- _Pictures move from local `RICSPICS` directory to web-served images._
- _Label printing moves to the browser; no printer-driver setup._
- _GMAIC import accepts `.txt` / `.zip` via HTTP upload; no diskette path._
- _Sectors resurface in Phase A (discovered to be in active business use)._
