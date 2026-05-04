# Proforma Landed-Cost Design

Date: 2026-05-01
Status: implemented baseline

Implementation note: this is an additive extension to Import Management, Purchasing, and Inventory. It is not a separate proforma module. The first implementation is in migration `20260501120000_proforma_landed_cost_builds` and the import-management service/UI changes that classify invoice lines, roll component costs into receiptable outputs, and post landed-cost receipt valuation events.

## Goal

Turn foreign-currency proformas, meter-based fabric purchases, and added labor/conversion costs into a landed-cost workflow that feeds the existing Purchasing and Inventory modules.

The current foundation is already in place:

- Purchasing owns normal POs, PO status, and PO receipt mechanics in `app.purchase_order`, `app.purchase_order_line`, `app.po_receipt`, and `app.po_receipt_line`.
- Import Management owns shipments, supplier invoices, charges, landed-cost allocation, goods in transit, AP handoff, estimated/final receiving, and true-ups.
- Inventory owns `app.stock_level` and `app.stock_movement`; receipts already write quantity movements with a `unit_cost_snapshot`.

The missing piece is cost structure: fabric meters, CMT labor, and other conversion components need to roll into receiptable finished SKUs before freight, duty, insurance, and other landed charges are allocated.

## Current Gaps

1. `ImportInvoiceLine` can store `material_meters`, `quantity`, `unit_of_measure`, source currency, FX, HNL amount, and landed unit cost, but it does not distinguish receiptable finished goods from non-receipt component costs.
2. The suit workbook parser splits fabric, CMT, accessories, and finished goods into separate supplier invoice groups, but it does not persist a build relationship that says "these fabric/CMT lines belong to this finished SKU/output."
3. `allocateImportLandedCost()` allocates shipment charges across all invoice/shipment target rows by product-cost share. For proformas with fabric and CMT component lines, that allocates freight/duty to component rows that should not be received to stock.
4. `createImportPurchaseOrderDraft()` creates native POs from import invoice lines, but currently inserts only `purchase_order.unit_cost` defaults and does not populate PO source-currency, FX, commercial HNL, or estimated landed-cost fields.
5. Inventory receipts capture a cost snapshot, but there is no inventory valuation balance/event table yet. Reports and POS still lean on `sku.current_cost`, so final landed costs need a controlled path into current cost and valuation reporting.

## Costing Model

Use HNL as the system valuation currency. Every foreign source document keeps:

- `source_amount`
- `source_currency`
- `fx_rate`
- `fx_date`
- computed `hnl_amount`

Do not treat fabric meters or CMT labor as sellable inventory unless the buyer explicitly creates raw-material SKUs. For the retail ERP v1 flow, they are capitalized cost components that roll into finished goods.

Cost layers:

1. Source commercial cost: invoice/proforma line amount converted to HNL.
2. Component rollup: fabric, CMT, accessory components allocated into receiptable output lines.
3. Shipment landed charges: freight, insurance, duty, tax, customs agency, local freight, etc. allocated to receiptable output lines.
4. Receipt cost: estimated or final landed unit cost posted to PO receipt/direct import receipt and stock movement.
5. True-up: zero-quantity inventory cost adjustment when final liquidation differs from estimated receipt.

Formula for a receiptable output line:

```text
output_commercial_hnl =
  output_source_hnl
  + allocated_material_hnl
  + allocated_conversion_hnl
  + allocated_accessory_component_hnl

landed_line_hnl =
  output_commercial_hnl
  + allocated_freight_hnl
  + allocated_insurance_hnl
  + allocated_duty_tax_hnl
  + allocated_local_landed_charges_hnl

landed_unit_cost_hnl = landed_line_hnl / output_quantity
```

Only output lines with `receipt_policy = 'RECEIVE_TO_STOCK'` can create PO receipt lines, direct import inventory receipts, stock movements, and suggested retail prices.

## Schema Changes

### 1. Classify import invoice lines

Add explicit line behavior to `app.import_invoice_line`.

```sql
ALTER TABLE app.import_invoice_line
  ADD COLUMN cost_role VARCHAR(32) NOT NULL DEFAULT 'FINISHED_GOOD',
  ADD COLUMN receipt_policy VARCHAR(32) NOT NULL DEFAULT 'RECEIVE_TO_STOCK',
  ADD COLUMN allocation_group_key TEXT,
  ADD COLUMN component_allocated_cost_hnl DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN commercial_unit_cost_hnl DECIMAL(14,4);

ALTER TABLE app.import_invoice_line
  ADD CONSTRAINT import_invoice_line_cost_role_check
  CHECK (cost_role IN (
    'FINISHED_GOOD',
    'MATERIAL',
    'CONVERSION',
    'ACCESSORY_COMPONENT',
    'RECEIPT_ACCESSORY',
    'EXPENSE'
  ));

ALTER TABLE app.import_invoice_line
  ADD CONSTRAINT import_invoice_line_receipt_policy_check
  CHECK (receipt_policy IN (
    'RECEIVE_TO_STOCK',
    'ROLL_TO_OUTPUT',
    'EXPENSE_ONLY',
    'IGNORE'
  ));

CREATE INDEX import_invoice_line_cost_role_idx
  ON app.import_invoice_line (cost_role, receipt_policy);

CREATE INDEX import_invoice_line_group_key_idx
  ON app.import_invoice_line (allocation_group_key);
```

Backfill rule:

- Existing invoice lines stay `FINISHED_GOOD` and `RECEIVE_TO_STOCK`.
- Workbook parser should write fabric lines as `MATERIAL` / `ROLL_TO_OUTPUT`.
- CMT lines should write `CONVERSION` / `ROLL_TO_OUTPUT`.
- Accessory lines that are sold/stocked use `RECEIPT_ACCESSORY` / `RECEIVE_TO_STOCK`; accessory trims used inside a garment use `ACCESSORY_COMPONENT` / `ROLL_TO_OUTPUT`.

### 2. Persist proforma build groups

Add a build header and component allocation table. V1 supports one receiptable output per build. Multiple-output allocation can be added later without changing receipt semantics.

```sql
CREATE TABLE app.import_cost_build (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  build_code VARCHAR(96) NOT NULL,
  description TEXT,
  output_invoice_line_id UUID REFERENCES app.import_invoice_line(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  output_shipment_line_id UUID REFERENCES app.import_shipment_line(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  output_sku_id UUID REFERENCES app.sku(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  output_quantity DECIMAL(12,3) NOT NULL,
  allocation_basis VARCHAR(32) NOT NULL DEFAULT 'OUTPUT_QUANTITY',
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_cost_build_key UNIQUE (shipment_id, build_code),
  CONSTRAINT import_cost_build_output_check CHECK (
    output_invoice_line_id IS NOT NULL OR output_shipment_line_id IS NOT NULL
  ),
  CONSTRAINT import_cost_build_quantity_check CHECK (output_quantity > 0),
  CONSTRAINT import_cost_build_basis_check CHECK (
    allocation_basis IN ('OUTPUT_QUANTITY', 'MANUAL_SHARE', 'METER_USAGE')
  )
);

CREATE TABLE app.import_cost_component_allocation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  build_id UUID NOT NULL REFERENCES app.import_cost_build(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  component_invoice_line_id UUID NOT NULL REFERENCES app.import_invoice_line(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  output_invoice_line_id UUID REFERENCES app.import_invoice_line(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  output_shipment_line_id UUID REFERENCES app.import_shipment_line(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  allocation_basis VARCHAR(32) NOT NULL,
  allocated_hnl_amount DECIMAL(14,2) NOT NULL,
  allocated_quantity DECIMAL(12,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_component_allocation_target_check CHECK (
    (output_invoice_line_id IS NOT NULL AND output_shipment_line_id IS NULL)
    OR (output_invoice_line_id IS NULL AND output_shipment_line_id IS NOT NULL)
  ),
  CONSTRAINT import_component_allocation_amount_check CHECK (allocated_hnl_amount >= 0)
);

CREATE INDEX import_cost_build_shipment_idx
  ON app.import_cost_build (shipment_id);

CREATE INDEX import_component_allocation_build_idx
  ON app.import_cost_component_allocation (build_id);
```

### 3. Make PO/import receipt lineage explicit

Keep `audit_reference`, but add real foreign-key columns for import receipts.

```sql
ALTER TABLE app.po_receipt_line
  ADD COLUMN import_shipment_id UUID REFERENCES app.import_shipment(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN import_invoice_line_id UUID REFERENCES app.import_invoice_line(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN import_shipment_line_id UUID REFERENCES app.import_shipment_line(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN landed_cost_basis VARCHAR(16),
  ADD COLUMN commercial_unit_cost_hnl DECIMAL(14,4),
  ADD COLUMN allocated_landed_cost_hnl DECIMAL(14,2),
  ADD COLUMN landed_unit_cost_hnl DECIMAL(14,4);

CREATE INDEX po_receipt_line_import_ref_idx
  ON app.po_receipt_line (import_shipment_id, import_invoice_line_id);
```

### 4. Add inventory cost events

This is the bridge between landed-cost receipts and current item cost.

```sql
CREATE TABLE app.stock_cost_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_movement_id UUID REFERENCES app.stock_movement(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  store_id INTEGER NOT NULL,
  sku_id UUID NOT NULL REFERENCES app.sku(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  quantity_delta DECIMAL(12,3) NOT NULL,
  value_delta_hnl DECIMAL(14,2) NOT NULL,
  unit_cost_hnl DECIMAL(14,4),
  valuation_basis VARCHAR(24) NOT NULL,
  source_document_type VARCHAR(64) NOT NULL,
  source_document_id TEXT NOT NULL,
  posted_by TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idempotency_key TEXT UNIQUE,

  CONSTRAINT stock_cost_event_basis_check CHECK (
    valuation_basis IN ('DOMESTIC_RECEIPT', 'IMPORT_ESTIMATED', 'IMPORT_FINAL', 'IMPORT_TRUE_UP', 'MANUAL')
  )
);

CREATE TABLE app.stock_cost_balance (
  store_id INTEGER NOT NULL,
  sku_id UUID NOT NULL REFERENCES app.sku(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  quantity_on_hand DECIMAL(12,3) NOT NULL DEFAULT 0,
  inventory_value_hnl DECIMAL(14,2) NOT NULL DEFAULT 0,
  average_unit_cost_hnl DECIMAL(14,4),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, sku_id)
);
```

Receipt posting updates `stock_cost_balance`; final true-up posts `quantity_delta = 0` and changes only value/average cost. After each balance update, update `app.sku.current_cost` to the chain-weighted average for that SKU so current reports and POS cost snapshots continue to work.

## Service Changes

### Import workbook parsing

Update `importWorkbookService.ts` so the suit parser writes role metadata:

- Fabric rows: `costRole = 'MATERIAL'`, `receiptPolicy = 'ROLL_TO_OUTPUT'`, `unitOfMeasure = 'METER'`, `materialMeters = meters`.
- CMT rows: `costRole = 'CONVERSION'`, `receiptPolicy = 'ROLL_TO_OUTPUT'`.
- Finished suit rows: `costRole = 'FINISHED_GOOD'`, `receiptPolicy = 'RECEIVE_TO_STOCK'`.
- Accessory rows: default to `RECEIPT_ACCESSORY` unless the workbook identifies them as trim/component.

Add a build suggestion step:

```ts
build_code = `${itemCode}:${styleCode ?? ''}:${color ?? ''}`
component lines match output by item code/style/color/fabric reference
```

The preview should show warnings when a component line has no output, or an output has no component lines but the workbook implies fabric/CMT.

### Landed-cost calculation

Replace the current single `allocateImportLandedCost()` calculation with this pipeline:

1. Validate source money and FX.
2. Build component allocations from `import_cost_build`.
3. Update output lines:
   - `component_allocated_cost_hnl`
   - `commercial_unit_cost_hnl`
4. Allocate shipment charges only across receiptable output targets using `commercial_unit_cost_hnl * quantity`.
5. Update output `allocated_landed_cost_hnl` and `landed_unit_cost_hnl`.
6. Leave component lines non-receipt with `landed_unit_cost_hnl = NULL`.
7. Write verification checks:
   - `COMPONENT_ROLLUP_RECONCILES`
   - `RECEIPT_TARGET_COST_RECONCILES`
   - `ALLOCATION_RECONCILES`

Critical rule: component invoice lines are included in AP and shipment liquidation totals, but not in receiving handoff and not in suggested retail prices.

### Purchase-order integration

Update `createImportPurchaseOrderDraft()`:

- Create PO lines only from `receipt_policy = 'RECEIVE_TO_STOCK'` lines.
- Set `purchase_order.source_currency`, `fx_rate`, `fx_date`, `incoterm_code`, `incoterm_place`, and `cost_basis = 'VENDOR_CURRENCY_ESTIMATED_LANDED'` when source is foreign.
- Populate `purchase_order_line.source_unit_cost`, `commercial_unit_cost_hnl`, and `estimated_landed_unit_cost_hnl`.
- Use `purchase_order_line.unit_cost = round2(estimated_landed_unit_cost_hnl)` so existing PO reports continue to work.
- Link component builds to output PO lines through `import_cost_build.output_shipment_line_id` or `output_invoice_line_id`.

Normal `purchaseOrderService.receivePurchaseOrder()` remains the domestic/manual receiving path. Import receiving stays in Import Management because it handles estimate/final status, goods in transit, and true-up.

### Receiving and inventory valuation

Update `getImportReceivingHandoff()`:

- Include only lines where `receipt_policy = 'RECEIVE_TO_STOCK'`.
- Show component cost breakdown on each output line for review.
- Block receiving if a receiptable line has component warnings or stale allocation checks.

Update `receiveImportShipmentEstimated()` and `receiveImportShipmentFinal()`:

- Post PO receipt/direct import receipt using the output line landed unit cost.
- Add import FKs and landed-cost basis columns on `po_receipt_line`.
- Insert `stock_cost_event` rows in the same transaction.
- Update `stock_cost_balance`.
- Update `sku.current_cost` from chain-weighted average.

Update `postImportInventoryTrueUps()`:

- Keep the zero-quantity `stock_movement` with `movement_type = 'IMPORT_COST_TRUE_UP'`.
- Also insert a zero-quantity `stock_cost_event` where `value_delta_hnl = delta_hnl_amount`.
- Recalculate `stock_cost_balance.average_unit_cost_hnl` and `sku.current_cost`.

Sales history should not be rewritten by a later final liquidation. A sale keeps the cost snapshot that was true when the ticket posted. The final true-up affects remaining inventory value and future sales snapshots.

## Workflow

1. Upload foreign proforma workbook.
2. Preview parses supplier invoices and lines, with roles: fabric meters, CMT/conversion, finished goods, accessories.
3. Buyer reviews suggested cost builds and fixes any component/output mismatches.
4. Buyer links receiptable output lines to app SKUs and creates or links native POs.
5. Estimate freight, insurance, duty/tax, agency, local charges, and FX.
6. Run landed-cost allocation.
7. Approve estimate. OTB consumes estimated landed commitments.
8. Receive estimated if goods arrive before final liquidation. This posts stock at estimated landed unit cost and records the audit reason.
9. Enter final supplier/customs/freight documents.
10. Rerun landed-cost allocation and finalize liquidation.
11. Receive final, or post final true-up if estimated receiving already happened.
12. Reports show estimated vs final landed cost, component rollup, shipment charges, receipt postings, AP handoff, and inventory valuation impact.

## Reporting Changes

### Import Management

Add columns to shipment liquidation and landed-cost allocation reports:

- line role
- receipt policy
- material meters
- component allocated HNL
- commercial unit cost HNL
- allocated shipment charges HNL
- landed unit cost HNL
- estimated/final basis
- PO receipt/direct receipt/true-up references

### Purchasing

Open PO and cash projection reports keep using `purchase_order_line.unit_cost` as HNL estimated landed cost. Add optional detail columns for:

- source currency
- source unit cost
- FX rate/date
- commercial unit cost HNL
- estimated landed unit cost HNL
- import shipment number

### Inventory and Sales Reporting

Inventory valuation should read `stock_cost_balance.average_unit_cost_hnl` where available. Keep `sku.current_cost` synchronized for current screens and existing reports that already use it.

Sales margin remains based on ticket-line cost snapshot. Final import true-ups are inventory valuation events, not retroactive ticket rewrites.

## Implementation Sequence

1. Migration: add import line role fields, build/allocation tables, receipt import lineage, and stock cost event/balance tables.
2. Prisma/models/routes: expose `costRole`, `receiptPolicy`, build records, component allocations, and receipt lineage.
3. Workbook parser: tag suit proforma lines and create build suggestions.
4. New service: `importCostBuildService.ts` to validate builds and allocate component costs to outputs.
5. Refactor `allocateImportLandedCost()` to run component rollup first, then charge allocation across receiptable outputs only.
6. Update `createImportPurchaseOrderDraft()` to skip components and populate foreign-currency PO cost fields.
7. Update receiving and true-up services to write stock cost events and balances.
8. Update Import Management UI: Cost Builds tab, role badges, component warnings, and output cost breakdown.
9. Update reports and tests:
   - proforma parser fixture
   - component rollup math
   - charge allocation excludes non-receipt components
   - import PO draft cost fields
   - estimated receipt and final true-up valuation events

## Acceptance Tests

- A CNY proforma can be imported only when FX rate/date are present and computed HNL amounts reconcile.
- Fabric line with `10.5 METER` and CMT line do not appear in receiving handoff.
- Finished SKU output receives the fabric and CMT cost in `commercial_unit_cost_hnl`.
- Freight/duty allocation is calculated only over receiptable output commercial cost.
- Import-created PO has source currency/FX on the header and source/commercial/estimated landed unit costs on lines.
- Estimated receiving posts stock movement, PO receipt line, stock cost event, stock cost balance, and SKU current cost.
- Final liquidation posts a true-up cost event without changing quantity when final landed cost differs.
- Shipment liquidation report reconciles supplier invoice HNL + landed charges to receiptable output landed cost.
