# RICS SKU Creation - Historical Write-Path Note

**Status:** reference only, not a live implementation plan
**Purpose:** preserve what the old Access write path required, in case the team needs lineage while reasoning about cutover mapping

## Re-alignment note

This file was originally written as discovery for a planned **Postgres -> RICS sync path**.

That is **not** the current repo strategy.

Per [CLAUDE.md](../../../CLAUDE.md):

- MDB files are read-only,
- Zack's Retail does not write back to RICS,
- development reads legacy data from `rics_mirror`,
- promotion into module-owned schemas happens at cutover instead.

So this document should be treated as:

- a record of what the old Access write code expected,
- a source of field lineage back to the legacy system,
- a possible aid when designing cutover-time field mapping,
- **not** a blueprint for a new sync agent or request-time write path.

## What this file is still useful for

It is still useful when answering questions like:

- what columns existed on the legacy `InventoryMaster` row,
- what the old repository believed was the minimum required payload,
- how the legacy code mapped `app.sku` fields to Access columns,
- what legacy validation assumptions were encoded in the old write path.

It is **not** authority for:

- building a warehouse sync agent,
- adding `Push to RICS`,
- restoring MDB write behavior,
- treating app-created SKUs as operational in RICS before cutover.

## Legacy write-path summary

The deleted/retired write path in the repo wrote to two Access tables in `RIINVMAS.MDB`:

- `InventoryMaster`
- `InvCatalog`

and did so through the PowerShell/OLE DB bridge in [apps/api/src/services/accessOleDb.ts](../../apps/api/src/services/accessOleDb.ts).

That old code path is relevant only as legacy lineage now.

## Implications for current work

If you are building SKU features now:

- read live legacy truth from `rics_mirror.inventory_master` and related mirror tables,
- write Zack's Retail-owned state to `app.*` / `public.*`,
- use the field knowledge below only to understand how legacy RICS stored SKU data,
- defer promotion/merge logic to cutover planning.

## Legacy field lineage

The old code believed a SKU create could touch:

- `InventoryMaster` always
- `InvCatalog` only when overlay/catalog fields were present

and it treated these fields as the core legacy payload:

| App field | Legacy column |
|---|---|
| `code` | `InventoryMaster.SKU` |
| `vendorSku` | `InventoryMaster.VendorSKU` |
| `categoryNumber` | `InventoryMaster.Category` |
| `vendorId` | `InventoryMaster.Vendor` |
| `sizeType` | `InventoryMaster.SizeType` |
| `descriptionRics` | `InventoryMaster.Desc` |
| `styleColor` | `InventoryMaster.StyleColor` |
| `season` | `InventoryMaster.Season` |
| `location` | `InventoryMaster.Location` |
| `listPrice` | `InventoryMaster.ListPrice` |
| `retailPrice` | `InventoryMaster.RetailPrice` |
| `markDownPrice1` | `InventoryMaster.MarkDownPrice1` |
| `markDownPrice2` | `InventoryMaster.MarkDownPrice2` |
| `currentPriceSlot` | `InventoryMaster.CurrentPrice` |
| `currentCost` | `InventoryMaster.CurrentCost` |
| `manufacturer` | `InventoryMaster.Manufacturer` |
| `labelCode` | `InventoryMaster.LabelCode` |
| `colorCode` | `InventoryMaster.ColorCode` |
| `comment` | `InventoryMaster.Comment` |
| `groupCode` | `InventoryMaster.GroupCode` |
| `keywords` | `InventoryMaster.KeyWords` |
| `pictureFileName` | `InventoryMaster.PictureFileName` |
| `coupon` | `InventoryMaster.Coupon` |
| `skuState` | `InventoryMaster.Status` |
| `orderMultiple` | `InventoryMaster.OrderMultiple` |
| `orderUom` | `InventoryMaster.OrderUOM` |

The old code also knew about `InvCatalog` fields such as:

- `LongColor`
- `BoldDesc`
- `ParaDesc`
- `BulletText_01..05`
- `PictureName_01`
- `PictureName_02`
- `WebFileName`

## Current recommendation

Use this note only when:

- designing cutover-time field mapping,
- tracing how old repository code behaved,
- comparing the current app model to the legacy RICS row shape.

Do not use it to justify new MDB write behavior.

## Related

- [CLAUDE.md](../../../CLAUDE.md)
- [docs/dev/specs/2026-04-22-postgres-first-rics-sync-cutover.md](2026-04-22-postgres-first-rics-sync-cutover.md)
- [docs/operations/rics-mirror-sync.md](../../operations/rics-mirror-sync.md)
