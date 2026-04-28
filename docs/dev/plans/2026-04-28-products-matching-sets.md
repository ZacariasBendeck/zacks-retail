# Product Matching Sets / Conjuntos Plan

Date: 2026-04-28
Status: implementation plan
Module: Products
Rollout stage: Development Against Direct CSV Imports; cutover-ready data model

## Why this rewrite exists

The older matching-set plan assumed a legacy mirror-style SKU reference and an Inventory URL. That no longer fits the current project state.

Current Product state:

- Canonical product rows live in `app.sku`.
- RICS SKUs are imported from CSV artifacts into `app.sku` with `source='rics'`.
- Operator-created SKUs also live in `app.sku` with `source='app'`.
- The RICS SKU import uses `ON CONFLICT (code) DO UPDATE`, so existing `app.sku.id` values are preserved across rehearsal imports.
- Vendor data lives in `app.vendor`.
- Family and category mapping live in `app.product_family` and `app.category_product_family`.
- Backend Product routes are mounted directly in `apps/api/src/app.ts`; there is no Product route index file today.
- Frontend Product enrichment screens live under `/products/*`.

Therefore matching sets must be an app-owned Product feature. It must not depend on `rics_mirror`, MDB reads, or an `/inventory/matching-sets` URL.

## Business goal

A matching set, or conjunto, links SKUs that are bought, presented, or analyzed together even when they are sold as separate SKUs.

Primary examples:

- Suit jacket, pant, and vest that were ordered as one style group.
- Bikini top and bottom.
- Pajama top and bottom.
- Coordinated outfit pieces from the same vendor/style/color.

The system should preserve the relationship so buyers can see missing pieces, inventory imbalance, sales imbalance, and all related pieces from any member SKU.

## Scope

In scope for the first implementation:

- Create and maintain matching-set records in Postgres `app.*` tables.
- Link one or more `app.sku` rows to a set.
- Assign a role to each member, such as jacket, pant, vest, top, bottom, or coverup.
- Show matching-set membership on the SKU edit/detail experience.
- Provide a standalone Product admin screen at `/products/matching-sets`.
- Provide backend routes under `/api/v1/products/matching-sets`.
- Surface basic gaps, such as a suit set missing a pant or a bikini set missing a bottom.
- Preserve matching-set data across repeated RICS CSV rehearsal imports.

Out of scope for the first implementation:

- Automatic PO line grouping. Keep the API ready for it, but do not wire it until the PO editor is the active workflow.
- POS bundle pricing or forced set selling. Members remain independently sellable SKUs.
- Importing matching sets from RICS. RICS does not currently provide a confirmed source table for this relationship.
- Storefront/public display rules. This is an internal Product admin feature first.

## Data model

All tables are in the `app` schema.

### `app.matching_set_type`

Catalog of set types. Seed the initial rows, then allow Product admins to manage labels and active state.

```sql
CREATE TABLE app.matching_set_type (
  code           TEXT PRIMARY KEY,
  label_es       TEXT NOT NULL,
  description_es TEXT,
  sort_order     SMALLINT NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Initial rows:

| code | label_es | Notes |
|---|---|---|
| `suit` | Traje / Conjunto formal | Jacket, pant, vest, tie, other. |
| `bikini` | Bikini | Top, bottom, coverup, other. |
| `pj_set` | Pijama | Top, bottom, robe, other. |
| `coordinate` | Coordinado | Outfit pieces that belong together. |
| `other` | Otro conjunto | Fallback with operator-defined roles. |

### `app.matching_set_role`

Role catalog per set type. Required roles drive gap detection.

```sql
CREATE TABLE app.matching_set_role (
  set_type_code    TEXT NOT NULL REFERENCES app.matching_set_type(code) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  label_es         TEXT NOT NULL,
  sort_order       SMALLINT NOT NULL DEFAULT 0,
  required_default BOOLEAN NOT NULL DEFAULT false,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (set_type_code, code)
);
```

Initial required defaults:

| set_type | required roles | optional roles |
|---|---|---|
| `suit` | `jacket`, `pant` | `vest`, `tie`, `other` |
| `bikini` | `top`, `bottom` | `coverup`, `other` |
| `pj_set` | `top`, `bottom` | `robe`, `other` |
| `coordinate` | none | `top`, `bottom`, `skirt`, `jacket`, `other` |
| `other` | none | `primary`, `secondary`, `other` |

### `app.matching_set`

Header record for the relationship.

```sql
CREATE TABLE app.matching_set (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT NOT NULL UNIQUE,
  set_type_code      TEXT NOT NULL REFERENCES app.matching_set_type(code) ON DELETE RESTRICT,
  description_es     TEXT,
  vendor_id          VARCHAR(4) REFERENCES app.vendor(code) ON UPDATE CASCADE ON DELETE SET NULL,
  vendor_style       TEXT,
  shared_color_code  TEXT,
  shared_color_label TEXT,
  season             VARCHAR(2),
  notes              TEXT,
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         TEXT NOT NULL DEFAULT 'system',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX matching_set_type_idx ON app.matching_set(set_type_code);
CREATE INDEX matching_set_vendor_idx ON app.matching_set(vendor_id);
CREATE INDEX matching_set_lookup_idx
  ON app.matching_set(vendor_id, vendor_style, shared_color_code, season);
```

Notes:

- `vendor_id` references the current app-owned `app.vendor(code)` table.
- `vendor_style` should be populated from `Sku.vendorSku` or another operator-entered vendor style when the data is available.
- `shared_color_code` can be populated from `Sku.colorCode`; `shared_color_label` is available for vendor-facing color names that do not map cleanly to the legacy code.
- `active=false` archives a set without deleting history.

### `app.matching_set_member`

Member rows link directly to `app.sku(id)`.

```sql
CREATE TABLE app.matching_set_member (
  set_id         UUID NOT NULL REFERENCES app.matching_set(id) ON DELETE CASCADE,
  sku_id         UUID NOT NULL REFERENCES app.sku(id) ON DELETE RESTRICT,
  role_code      TEXT NOT NULL,
  is_primary     BOOLEAN NOT NULL DEFAULT false,
  quantity_ratio NUMERIC(8,3) NOT NULL DEFAULT 1,
  added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by       TEXT NOT NULL DEFAULT 'system',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     TEXT NOT NULL DEFAULT 'system',
  PRIMARY KEY (set_id, sku_id)
);

CREATE INDEX matching_set_member_sku_idx ON app.matching_set_member(sku_id);
CREATE INDEX matching_set_member_role_idx ON app.matching_set_member(role_code);
CREATE UNIQUE INDEX matching_set_member_one_primary_idx
  ON app.matching_set_member(set_id)
  WHERE is_primary;
```

Rules enforced by the service:

- `sku_id` must exist in `app.sku`.
- DRAFT, ACTIVE, and DISCONTINUED SKUs may be linked in admin, but POS/storefront flows should only treat ACTIVE members as sellable.
- `role_code` must exist in `app.matching_set_role` for the parent set's `set_type_code`.
- A SKU can belong to more than one matching set only if the operator explicitly confirms it. The first implementation should warn rather than block, because real merchandise can be part of a suit and a broader coordinate story.
- Exactly one primary member is allowed per set when any member is marked primary.

## Backend routes

Base path: `/api/v1/products/matching-sets`

Route file: `apps/api/src/routes/products/matchingSetRoutes.ts`

Service file: `apps/api/src/services/products/matchingSetService.ts`

Mount in `apps/api/src/app.ts` with the other Product routes, before broad SKU routes:

```ts
app.use('/api/v1/products/matching-sets', productsMatchingSetRoutes);
app.use('/api/v1/products/sku-drafts', productsSkuDraftRoutes);
app.use('/api/v1/products/skus/lookup', productsSkuLookupRoutes);
app.use('/api/v1/products/skus', productsSkuRoutes);
```

Do not create an `/api/v1/inventory/matching-sets` backend route.

### Type and role admin

These routes must be declared before `/:id`.

| Method + path | Purpose |
|---|---|
| `GET /types` | List active and inactive set types with roles. |
| `POST /types` | Create a set type. |
| `PATCH /types/:code` | Update label, description, sort order, or active state. |
| `POST /types/:code/roles` | Create a role for a set type. |
| `PATCH /types/:code/roles/:roleCode` | Update role label, sort order, required default, or active state. |

### Matching-set records

| Method + path | Purpose |
|---|---|
| `GET /` | List sets. Filters: `q`, `setType`, `vendorId`, `sku`, `role`, `active`, `hasGap`, `page`, `pageSize`. |
| `POST /` | Create a set header and optional initial members in one transaction. |
| `GET /by-sku/:skuRef` | Reverse lookup by `app.sku.id`, final SKU code, or provisional code. |
| `GET /:id` | Detail view with header, members, gaps, and inventory/sales summaries. |
| `PATCH /:id` | Update header fields. |
| `POST /:id/archive` | Set `active=false`; keep members for history. |
| `POST /:id/restore` | Set `active=true`. |
| `GET /:id/gaps` | Return missing required roles and inventory imbalance warnings. |

### Members

These routes must be declared before any catch-all `/:id` mutation routes if the router grows.

| Method + path | Purpose |
|---|---|
| `POST /:id/members` | Add a member. Body accepts one of `skuId`, `skuCode`, or `provisionalCode`, plus `roleCode`, `isPrimary?`, `quantityRatio?`. |
| `PATCH /:id/members/:skuId` | Update member role, primary flag, or quantity ratio. |
| `DELETE /:id/members/:skuId` | Remove a member from the set. |

### Response shape

Set detail responses should include denormalized display fields so the frontend does not issue N+1 SKU calls:

```jsonc
{
  "id": "uuid",
  "code": "MS-2026-000123",
  "setTypeCode": "suit",
  "descriptionEs": "Traje azul vendor style 8821",
  "vendorId": "0123",
  "vendorName": "Vendor name",
  "vendorStyle": "8821",
  "sharedColorCode": "AZU",
  "season": "26",
  "active": true,
  "members": [
    {
      "skuId": "uuid",
      "skuCode": "123456789012345",
      "provisionalCode": "RICS-123456789012345",
      "skuState": "ACTIVE",
      "familyCode": "suits",
      "roleCode": "jacket",
      "roleLabelEs": "Saco",
      "isPrimary": true,
      "description": "Saco azul",
      "vendorSku": "8821",
      "colorCode": "AZU",
      "onHandTotal": 12,
      "salesLast90Days": 5
    }
  ],
  "gaps": [
    { "roleCode": "pant", "roleLabelEs": "Pantalon", "severity": "missing_required_role" }
  ]
}
```

## Frontend UX plan

Frontend route: `/products/matching-sets`

Menu placement: Products -> Product Enrichment -> Matching Sets.

### Standalone list

The list should be an operational table, not a marketing-style page.

Required controls:

- Search by matching-set code, SKU code, vendor style, vendor name, description, or color.
- Filters for set type, vendor, active/archived, gap status, and member role.
- Columns: set code, type, vendor, vendor style, color, season, member count, primary SKU, gaps, total on hand, last 90 day sales, updated date.
- Row actions: open detail, edit header, archive/restore.
- Primary action: New Matching Set.

### Create/edit drawer

The drawer should support both fast entry and careful correction.

Fields:

- Set type.
- Description.
- Vendor.
- Vendor style.
- Shared color code / label.
- Season.
- Notes.

Member entry:

- SKU search with code, provisional code, description, vendor SKU, family, and state.
- Role selector filtered to the selected set type.
- Primary toggle.
- Quantity ratio input, default `1`.
- Inline warnings for duplicate membership and inactive roles.

### Detail view

The detail view should answer the buyer's actual questions quickly:

- What pieces belong together?
- Which piece is missing?
- Which store has one piece but not the other?
- Are pants selling faster than jackets, or tops faster than bottoms?

Required sections:

- Header summary with set type, vendor, style, color, season, active state.
- Member table with SKU link, role, family, state badge, on-hand total, store spread, last 30/90 day sales.
- Gap panel using required roles from `app.matching_set_role`.
- Imbalance panel comparing on-hand and sales by role.
- Activity metadata: created/updated by and date.

### SKU form integration

Add a `Conjunto` section to the modern SKU form and detail experience.

If the SKU has no set:

- Show `Link to existing` and `Create new set`.
- Prefill new-set fields from `Sku.vendorId`, `Sku.vendorSku`, `Sku.colorCode`, `Sku.styleColor`, `Sku.season`, and `Sku.familyCode`.
- Suggest likely existing sets using vendor + vendor style + color + season.

If the SKU belongs to one or more sets:

- Show each set with type, role, other members, gaps, and total on hand.
- Allow changing this SKU's role.
- Allow removing the SKU from the set with confirmation.
- Link to the full matching-set detail view.

### Product Inquiry integration

On Inventory Inquiry and SKU lookup surfaces, show a compact `Conjunto` card when the SKU is in a set:

- Other member SKUs as clickable SKU links.
- Role labels.
- On-hand total per member.
- Missing-role warning if the set has gaps.

This should use the same popup/SKU link behavior as other Product pages so a buyer can inspect related pieces without losing context.

### Role/type settings

The admin screen needs a small settings drawer for set types and roles:

- Edit labels and sort order.
- Mark roles active/inactive.
- Mark roles required by default.
- Keep inactive roles visible on historical sets but hidden from new member dropdowns.

## Query and service behavior

SKU lookup:

- Resolve `skuRef` in this order: UUID `app.sku.id`, exact `app.sku.code`, exact `app.sku.provisional_code`.
- Return 404 when no SKU exists.

Gap detection:

- Load required roles for the set type from `app.matching_set_role.required_default=true`.
- Compare to active member rows by `role_code`.
- Return missing required roles.
- Flag inactive role usage as a warning, not a hard error.

Inventory summary:

- Join members to `app.stock_level` for on-hand totals.
- Prefer existing inventory service/read models if they already expose store-level totals.
- Do not read MDBs or offline CSV files at request time.

Sales summary:

- For first implementation, reuse existing imported inquiry-history or sales-history projections where available.
- If sales attribution is not yet available for a member, return `null` and let the UI show a muted empty state.

Audit:

- Write Product audit/activity entries for set create/update/archive and member add/update/remove.
- Include before/after role and primary changes.

## Migration and rehearsal requirements

This feature is app-owned data, so repeated RICS CSV imports must not delete it.

Implementation checks:

- `app.sku` import must continue preserving SKU UUIDs through `ON CONFLICT (code) DO UPDATE`.
- Matching-set members must reference `app.sku(id)`, not a retired mirror table.
- A rehearsal import must leave `app.matching_set` and `app.matching_set_member` row counts unchanged except for SKUs that are intentionally discontinued.
- Discontinued member SKUs remain linked and display with a DISCONTINUED badge.
- Archive matching sets instead of hard-deleting them in normal UI flows.

Suggested verification SQL:

```sql
SELECT COUNT(*) AS orphan_members
FROM app.matching_set_member m
LEFT JOIN app.sku s ON s.id = m.sku_id
WHERE s.id IS NULL;

SELECT set_id, COUNT(*) AS primary_count
FROM app.matching_set_member
WHERE is_primary
GROUP BY set_id
HAVING COUNT(*) > 1;

SELECT m.set_id, m.role_code
FROM app.matching_set_member m
JOIN app.matching_set ms ON ms.id = m.set_id
LEFT JOIN app.matching_set_role r
  ON r.set_type_code = ms.set_type_code
 AND r.code = m.role_code
WHERE r.code IS NULL;
```

## Implementation sequence

1. Add Prisma migration and Prisma models for the four app tables.
2. Seed default set types and roles.
3. Implement `matchingSetService` with transactional create/update/member operations.
4. Implement `matchingSetRoutes` and mount `/api/v1/products/matching-sets` in `apps/api/src/app.ts`.
5. Add backend tests for route ordering, SKU resolution, role validation, primary uniqueness, archive/restore, and rehearsal-preservation assumptions.
6. Add frontend API client/types/query hooks.
7. Add `/products/matching-sets` list and detail/create drawer.
8. Add `Conjunto` section to the modern SKU form/detail flow.
9. Add compact matching-set card to Inventory Inquiry/SKU popup surfaces.
10. Add gap and imbalance panels once inventory/sales summaries are wired.
11. Revisit PO integration after the PO editor is the active Product/Purchasing workflow.

## Acceptance criteria

- Matching sets can be created, edited, archived, restored, and searched from `/products/matching-sets`.
- A buyer can link jacket/pant/vest SKUs to one suit set and immediately see the relationship from any member SKU.
- The backend rejects invalid roles for a set type.
- The backend prevents more than one primary member per set.
- Gaps show when a required role is missing.
- Re-running the RICS SKU CSV import preserves matching-set links.
- No new request path reads an MDB or `rics_mirror`.
- No backend or frontend route uses `/inventory/matching-sets`.
