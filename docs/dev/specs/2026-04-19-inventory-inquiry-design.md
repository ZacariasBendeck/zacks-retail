# Design: Inventory Inquiry (Product Inquiry page) + shared SKU primitives

**Date:** 2026-04-19
**Module:** `products` (page owned here; data contracts from `inventory`, `purchasing`, `sales-reporting`)
**Phase:** 1 (reads through the RICS adapter; no schema changes to the legacy DB)
**Owning agent:** `products-dev`

## Purpose

Deliver a functional v1 of the **Inventory Inquiry** screen — RICS's single-SKU, all-context view — as the canonical **Product Inquiry** page at `/products/inquiry/:skuCode`, plus two shared SKU primitives (`<SkuLookup />` modal picker, `<SkuLink />` inline link) that every other screen in the app uses to either select or navigate to a SKU.

The RICS v7.7 source is **Ch. 4 p. 70 Inventory Inquiry** and **Ch. 2 p. 53** (same screen, sales-path entry). The module-level spec section is [`docs/modules/products.md` § Product Inquiry](../../modules/products.md).

## Goals

1. Replace the minimal Phase-1 `InventoryInquiryPage` with a page that visually and functionally matches the RICS screen: header + pricing panel + sales-rollup strip + size grid (with view-mode selector) + action bar + right-side picture.
2. Ship **two shared SKU primitives** — a modal `<SkuLookup />` and a `<SkuLink />` link — usable from anywhere a SKU is searched, picked, or displayed.
3. Make the inquiry the natural click-destination for every SKU reference in the app (Phase-1 sweep covers the ~6 biggest sites; the rest get picked up as touched).
4. Keep every data read on the RICS adapter for Phase 1. No schema changes, no Postgres writes.
5. Leave explicit, discoverable markers for every deferred feature and the cross-module contract it's waiting on.

## Non-goals (v1)

- **Drawer flavor of the inquiry.** v1 ships route-only. A drawer can wrap the same React tree later.
- **All 15 RICS view modes.** v1 ships 7 modes live + 6 stubbed + 2 deferred to v2 (see §5).
- **All 6 action tabs wired.** v1 wires UPCs / Info / Detail; POs / Trend / Print remain stubbed.
- **Postgres-native inquiry path.** Phase-2 work, tracked separately.
- **New-SKU creation flow from `<SkuLookup />` "Add" button.** v1 links out to `/products/skus/new`; inline creation comes later.

## Current state (what we're replacing)

- `apps/web/src/pages/inventory/InventoryInquiryPage.tsx` — basic Phase-1 page at `/inventory/inquiry`. Renders header + per-store size-grid cards. No pricing panel, no sales rollup, no tabs, no picture, no Prev/Next, no view-mode selector.
- `apps/api/src/routes/ricsInventoryRoutes.ts` — `GET /api/v1/inventory/inquiry/:sku` serves a partial payload via `apps/api/src/services/ricsInventoryFacade.ts` → `apps/api/src/services/ricsProductAdapter.ts`.
- `apps/api/src/routes/skuRoutes.ts` — `GET /api/v1/skus/autocomplete` and `/skus/lookup` exist but are used ad-hoc; no shared picker component wraps them.
- No shared `SizeGrid` component. No `SkuLookup` modal. No `SkuLink`.

## Architecture

```
apps/web/src/
  components/
    sku-lookup/
      SkuLookup.tsx               # modal picker matching RICS SKU Lookup
      SkuLookup.test.tsx
    sku-link/
      SkuLink.tsx                 # <a> to /products/inquiry/:skuCode
      SkuLink.test.tsx
    size-grid/
      SizeGrid.tsx                # shared primitive (reused by Find by Size, etc.)
      SizeGrid.test.tsx
      types.ts
  pages/
    products/
      inquiry/
        InquiryPage.tsx           # orchestrates URL state, data fetch, layout
        HeaderCard.tsx
        PricingPanel.tsx
        SalesRollupStrip.tsx
        PicturePanel.tsx
        ViewModeSelector.tsx
        ActionBar.tsx
        tabs/
          UpcsTab.tsx
          InfoTab.tsx
          DetailTab.tsx            # inventory movement history
          PosTab.tsx               # v1 placeholder
          TrendTab.tsx             # v1 placeholder
        useInquiryData.ts          # TanStack Query wrapper

apps/api/src/
  routes/
    ricsInventoryRoutes.ts         # expanded payload
    ricsPicturesRoutes.ts          # NEW: static-serve /rics-images/:filename
    skuRoutes.ts                   # add /search endpoint for SkuLookup
  services/
    ricsInventoryFacade.ts         # expanded getInventoryInquiry shape
    ricsProductAdapter.ts          # surface extra InventoryMaster fields + picture filename
```

## Shared primitives

### `<SkuLookup />` — modal picker

The *primary* SKU-selection primitive across the app. Matches the RICS "SKU Lookup" screen one-to-one.

**Visual / behavior (from the RICS screenshot):**

- Column grid: **SKU | Description | Vendor | Categ. | Style/Color | Price** (Price shows the current slot's amount).
- Sort-by radio: **SKU** (default) / **Description** / **Vendor** / **Style/Color**.
- Quick Search **SKU** input — prefix match on SKU code.
- **Restrict search to descriptions containing** `<text>` + **Whole word only** checkbox.
- Record / Page navigation (50 rows per page, PgUp / PgDn arrows).
- Actions:
  - **Save** — selects the highlighted row and closes (invokes `onSelect`).
  - **Cancel** — closes without selecting.
  - **Add** — when `allowCreate` prop is true, navigates to `/products/skus/new` (v1); inline creation is Phase 2.
- Keyboard: ↑/↓ to select a row, **Enter** confirms, **Esc** cancels.

**Props:**

```ts
interface SkuLookupProps {
  open: boolean;
  onClose: () => void;
  onSelect: (picked: { skuCode: string; skuId: string }) => void;
  initialQuery?: string;
  allowCreate?: boolean;
}
```

**Backend:** new `GET /api/v1/skus/search` endpoint:

```
GET /api/v1/skus/search
  ?q=<skuPrefix>
  &descContains=<text>
  &wholeWord=<bool>
  &sort=SKU|DESCRIPTION|VENDOR|STYLE_COLOR
  &limit=<n>
  &offset=<n>
→ { rows: [{ skuId, skuCode, description, vendor, category, styleColor, currentPrice }], total }
```

The existing `/skus/autocomplete` endpoint stays as-is (used by a lighter type-ahead UX elsewhere); `/skus/search` is the modal's backing.

**Consumers (Phase 1):** Inquiry page header, PO line entry, POS register lookup, report SKU filters, transfer line entry, receipt line entry. Any future screen that has a SKU-valued form field uses this.

### `<SkuLink />` — clickable SKU code

```tsx
<SkuLink skuCode="ZN02-NDPT" storeId={1}>ZN02-NDPT</SkuLink>
```

Renders children (default: `skuCode`) as an `<a>` to `/products/inquiry/:skuCode?storeId=…`. Middle-click / cmd-click / ctrl-click opens in a new tab (native anchor behavior). Keyboard-accessible by default.

**Consumers:** every place that displays a SKU code to the user (see §8 for the v1 sweep).

## Inquiry page

### Route

- **Canonical:** `/products/inquiry/:skuCode`
- **Query params:**
  - `storeId` — numeric; scopes per-store view modes.
  - `mode` — one of `ON_HAND | ON_ORDER_CURRENT | ON_ORDER_FUTURE | MODEL | SHORT | MTD_SALES | STD_SALES | YTD_SALES | LY_SALES | SINGLE_COLUMN | ALL_STORES_ON_HAND | ALL_STORES_ONE_ROW | ALL_STORES_SUMMARY | MAX | REORDER`.
  - `row` — required for 2-D size types when the mode needs a row selection.
- **Redirects:** `/inventory/inquiry` and `/inventory/inquiry/:skuCode` → the canonical route, preserving `storeId`.

### Layout (matches the RICS Inventory Inquiry screenshot)

```
+-------------------------------------------------------+
|  Options ▾ | Order By ▾ | Help ▾                      |
+-------------------------------------------------------+
| Header            | Pricing panel       | Picture     |
|  SKU / Desc       |  Retail / MD1 / MD2 |  panel      |
|  Category / Vendor|  Avg Cost / Curr    |  (hidden if |
|  Vendor SKU       |  List Price         |  no image)  |
|  Style / Color    +---------------------+             |
|  Size Type        | Sales rollup strip  |             |
|  Last Received    |  Qty/Net/MD/Profit  |             |
|  Store            |  × Wk/Mo/Sn/Yr      |             |
+-------------------------------------------------------+
| View-mode selector (15 tabs + keyboard shortcut hints)|
+-------------------------------------------------------+
| Size grid (renders for the selected view mode)        |
+-------------------------------------------------------+
|  Clear | Prev | Next | UPCs | POs | Trend | Info |    |
|                   Detail | Print | Exit              |
+-------------------------------------------------------+
|  Active tab panel (shown when a tab button is on)     |
+-------------------------------------------------------+
```

### Component tree

- `InquiryPage.tsx` — reads URL params, calls `useInquiryData`, threads state to children.
- `HeaderCard.tsx` — left-column identity block.
- `PricingPanel.tsx` — top-right pricing grid with the current-slot highlight.
- `SalesRollupStrip.tsx` — the Qty/Net/Markdown/Profit × Wk/Mo/Sn/Yr grid.
- `PicturePanel.tsx` — right-column image; renders nothing if `pictureFilename` is null.
- `ViewModeSelector.tsx` — renders all 15 modes; disabled modes show a tooltip naming the awaited contract.
- `SizeGrid.tsx` — **shared primitive** that will also back Find-by-Size, Replenishment Targets, Manual Receipts, etc.
- `ActionBar.tsx` — Clear / Prev / Next / UPCs / POs / Trend / Info / Detail / Print / Exit.
- `tabs/*` — each action tab is a separate component; tab state is URL-driven so deep-linking works.

## View modes — what v1 ships

All 15 modes from the Options menu are rendered in the selector. The 7 unshipped ones show as disabled with a tooltip naming the cross-module contract they're waiting on.

| # | Mode                    | Shortcut | v1     | Waiting on                              |
|---|-------------------------|----------|--------|-----------------------------------------|
| 1 | On Hand                 | F2       | ✅     | —                                       |
| 2 | On Order (At-Once)      | F3       | ⚠ stub | `purchasing.getOnOrder`                 |
| 3 | On Order (Future)       | F4       | ⚠ stub | `purchasing.getOnOrder`                 |
| 4 | Model Quantities        | F5       | ✅     | — (from RICS replenishment tables)      |
| 5 | Short Quantities        | F6       | ✅     | — (model − on-hand, derived)            |
| 6 | Month-to-Date Sales     | F7       | ⚠ stub | `sales-reporting.getSizeGridSales`      |
| 7 | Season-to-Date Sales    | F8       | ⚠ stub | `sales-reporting.getSizeGridSales`      |
| 8 | Year-To-Date Sales      | F9       | ⚠ stub | `sales-reporting.getSizeGridSales`      |
| 9 | Column Only             | F11      | ❌ v2  | UX + view shape                         |
|10 | All Stores - On Hand    | Shift+F1 | ✅     | —                                       |
|11 | All Stores - 1 Row      | Shift+F2 | ❌ v2  | UX                                      |
|12 | **All Stores Summary** (default) | Shift+F3 | ✅ | —                                  |
|13 | Max Quantities          | Shift+F4 | ✅     | — (RICS replenishment)                  |
|14 | Reorder Quantities      | Shift+F5 | ✅     | — (RICS replenishment)                  |
|15 | Last Year Sales         | Shift+F6 | ⚠ stub | `sales-reporting.getSizeGridSales`      |

## Action bar / tabs — what v1 ships

| Button          | v1     | Waiting on                               |
|-----------------|--------|------------------------------------------|
| Clear           | ✅     | —                                        |
| Prev / Next     | ✅     | — (cursor over the current filter set)   |
| **UPCs**        | ✅     | — (`products.listSkuUpcs`)               |
| **POs**         | ⚠ stub | `purchasing.getOpenPoLines(skuId)`       |
| **Trend**       | ⚠ stub | `sales-reporting.getEightWeekTrend`      |
| **Info**        | ✅     | — (SKU metadata already in payload)      |
| **Detail**      | ✅     | — (inventory movements via RICS adapter) |
| Print           | ❌ v2  | label-print pipeline                     |
| Exit            | ✅     | — (browser back)                         |

Stubbed tabs render a visible placeholder: **"Coming in Phase 2 — waiting on `{module}.{contract}`"**. This surfaces the gap to both engineers (who can see which contract to add next) and operators (who know the feature is acknowledged, not missed).

## Picture panel

- Renders `<img src="/rics-images/{pictureFilename}">` in the right column of the header row.
- New backend route `GET /rics-images/:filename` serves static files from `RICS_PICTURES_DIR` (env var, defaults to `C:\RICSWIN\ricspics` per the modernization decision in `docs/modules/products.md`).
- Safe-path validation on the filename (reject `..`, absolute paths, etc.).
- Renders a placeholder element when `pictureFilename` is null or the file 404s.

## Data contract — extended `getInventoryInquiry`

```
GET /api/v1/inventory/inquiry/:sku?storeId=
→ {
  sku: string,
  description: string,
  category: { id: number, name: string },
  vendor: { code: string, name: string },
  vendorSku: string | null,
  styleColor: string | null,
  sizeType: { id: number, name: string, columns: string[], rows?: string[] },
  lastReceivedAt: string | null,
  pricing: {
    retail: number,
    markdown1: number,
    markdown2: number,
    avgCost: number,
    currentCost: number,
    listPrice: number,
    currentSlot: 'LIST' | 'RETAIL' | 'MARKDOWN1' | 'MARKDOWN2',
  },
  rollup: {
    week:   { qty: number, net: number, markdown: number, profit: number },
    month:  { qty, net, markdown, profit },
    season: { qty, net, markdown, profit },
    year:   { qty, net, markdown, profit },
  },
  // Only the v1-live modes are populated. Stubbed / deferred modes
  // are absent from this object — the view-mode selector disables
  // them based on the Deferred table in §9, not on the payload.
  grids: {
    onHand?:             Grid,
    model?:              Grid,
    max?:                Grid,
    reorder?:            Grid,
    short?:              Grid,
    allStoresOnHand?:    Grid,
    allStoresSummary?:   Grid,
  },
  pictureFilename: string | null,
}

type Grid = {
  columns: string[];
  rows: Array<{ label: string; cells: Array<{ value: number | null }> }>;
  total?: number;
};
```

`Grid`, `Row`, `Cell` shapes are shared with the `SizeGrid` primitive's prop types.

## Routes

- Add `/products/inquiry/:skuCode` (canonical).
- `/inventory/inquiry` and `/inventory/inquiry/:skuCode` → redirect, preserve `storeId`.
- Update `apps/web/src/App.tsx` router.

## `<SkuLink />` sweep for v1

Replace plain SKU text with `<SkuLink>` in:

- `apps/web/src/pages/inventory/SkuListPage.tsx` — SKU column (split out "edit" as a separate icon; the SKU text itself becomes a link to inquiry).
- `apps/web/src/pages/purchasing/PurchaseOrderDetailPage.tsx` — PO line SKU column.
- `apps/web/src/pages/inventory/ReplenishmentTargetsPage.tsx` — SKU column.
- `apps/web/src/pages/inventory/FindBySizePage.tsx` — SKU column.
- `apps/web/src/pages/inventory/ManualTransferEntryPage.tsx` — SKU references.
- `apps/web/src/pages/inventory/ManualReceiptEntryPage.tsx` — SKU references.
- POS mock pages (`PoEntryMockPage`, `PoReceiveMockPage`) — SKU references.

Other SKU display sites get picked up as touched.

## `<SkuLookup />` wiring for v1

The modal is available everywhere via its component import. v1 explicitly wires it into:

- Inquiry page header — search-by-SKU field opens the lookup.
- Any form currently using an ad-hoc SKU input — replace with `<SkuLookup />` trigger button next to the text input.

Identifying all the ad-hoc inputs is part of the plan's inventory-and-replace step.

## Deferred / waiting on — canonical list

This section is the single source of truth for what's stubbed and why. Anything added to the UI as "Phase 2" links back to the row below.

| Feature                                  | Blocker / waiting on                        |
|------------------------------------------|---------------------------------------------|
| On Order (At-Once / Future) view modes   | `purchasing.getOnOrder(skuId, storeId, …)`  |
| MTD / STD / YTD / LY sales view modes    | `sales-reporting.getSizeGridSales`          |
| Column Only view mode (F11)              | UX design + payload shape                   |
| All Stores - 1 Row view mode (Shift+F2)  | UX design                                   |
| `[POs]` tab                              | `purchasing.getOpenPoLines(skuId)`          |
| `[Trend]` tab                            | `sales-reporting.getEightWeekTrend`         |
| `[Print]` action                         | Label-print pipeline                        |
| `<SkuLookup />` "Add" → inline creation  | New-SKU form needs Phase-2 inline variant   |
| Drawer flavor of the inquiry             | Deferred intentionally; revisit after v1    |
| Phase-2 native data path (Postgres)      | Migration of `inventory` module to Postgres |

A short pointer appended to [`docs/modules/products.md` § Product Inquiry](../../modules/products.md) will link readers back here so module readers see the deferred list without having to know this spec exists.

## Testing

**Frontend (Vitest + Testing Library):**

- `SkuLookup.test.tsx` — open/close, search, sort radio, desc-contains filter, whole-word toggle, pagination, keyboard (↑/↓, Enter, Esc), Add button behavior per `allowCreate`.
- `SkuLink.test.tsx` — URL construction with/without `storeId`, href stability, cmd/middle-click preserves native behavior.
- `SizeGrid.test.tsx` — column/row rendering, empty state, totals row.
- `InquiryPage.test.tsx` — loading / success / unknown-SKU / mode switch / tab switch / picture-present vs. null / redirect from `/inventory/inquiry`.

**Backend (Jest):**

- `ricsInventoryFacade.test.ts` — expand for the new payload fields (pricing slots, rollup strip, grids by mode, picture filename).
- `skuRoutes.test.ts` — new `/search` endpoint: q, descContains, wholeWord, sort, limit/offset.
- `ricsPicturesRoutes.test.ts` — static serve happy path, 404, path-traversal rejection.

## Open questions

None that block Phase-1 implementation. The deferred-list table above captures every known gap.

## Implementation ordering (for the plan)

1. Shared primitives — `SizeGrid`, `SkuLookup` (incl. backend `/skus/search`), `SkuLink`.
2. Backend — extend `getInventoryInquiry` payload; add `/rics-images/:filename` route.
3. New `InquiryPage` at `/products/inquiry/:skuCode` (parallel to the old page).
4. Wire the `<SkuLink>` sweep across existing screens.
5. Add `/inventory/inquiry` redirect + remove the old page.
6. Tabs: UPCs, Info, Detail wired; POs, Trend, Print rendered as stubs.

Turn this into numbered, bite-sized steps with TDD checkpoints during plan-mode.
