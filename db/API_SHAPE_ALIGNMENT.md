# API Shape Alignment Notes (Canonical Schema Follow-up)

This note captures frontend-facing API contracts validated for the canonical schema rollout from migration `011_canonical_rics_model`.

## 1) SKU List + Detail Payload Shape

Validated against:
- `GET /api/v1/skus`
- `GET /api/v1/skus/:skuId`
- `POST /api/v1/skus`
- `PATCH /api/v1/skus/:skuId`

Canonical frontend field naming is camelCase (`skuCode`, `categoryId`, `department`, `heelMaterialId`, etc.).

Category handling:
- SKU write paths use `categoryId` (internal FK id).
- Report filters use `category` (RICS code `556-599`).

## 2) Category + Department Filter Model

Canonical constraints:
- Departments: `FORMAL | CASUAL | FIESTA | SANDALIAS | BOOTS | COMFORT`
- Category code range: `556-599`

Frontend constants are aligned in:
- `apps/web/src/constants/domain.ts`

Backend validation is aligned in:
- `apps/api/src/constants/domain.ts`
- report query schemas in `apps/api/src/routes/reportRoutes.ts`

## 3) Transaction Read-Model Payloads In Use

Current UI-consuming contracts:
- Purchase orders: `/api/v1/purchase-orders`
- Inventory adjustments: `/api/v1/inventory/adjustments`
- OTB summary: `/api/v1/otb-budgets/summary`

OTB summary response shape (array rows):
- `department`, `year`, `month`
- `plannedBudget`, `committedAmount`, `receivedAmount`
- `remainingOtb`, `utilizationPercent`, `budgetExceeded`

## 4) Canonical Entity Exposure (Resolved)

Backend now exposes first-class read contracts for canonical entities introduced in migration `011`:
- `style_colors` and `sku_style_colors`
- `po_receipts` and `po_receipt_lines`
- `transfer_orders` and `transfer_order_lines`
- canonical heel dictionaries (`ref_heel_types`, `ref_heel_material_types`)

### 4.1 StyleColor link on SKU payloads

Endpoints:
- `GET /api/v1/skus`
- `GET /api/v1/skus/:skuId`

Additional response fields per SKU:
- `heelTypeCode`: canonical code (`STILETTO`, `CHUNKY`) or `null`
- `heelMaterialTypeCode`: canonical code (`LINED`, `PLASTIC`) or `null`
- `styleColor`: object or `null`

`styleColor` shape:
- `styleColorId`, `brandId`, `style`, `colorId`, `categoryId`, `department`
- `heelTypeCode`, `heelMaterialTypeCode`, `season`, `active`

### 4.2 Dedicated StyleColor endpoint

Endpoints:
- `GET /api/v1/skus/style-colors?brandId=&colorId=&department=&active=`
- `GET /api/v1/skus/:skuId/style-color`

### 4.3 Heel enum transport contract

Write model (SKU create/update):
- Canonical code fields: `heelTypeCode`, `heelMaterialTypeCode`
- Legacy display fields remain accepted for backward compatibility: `heelType`, `material`

Read model:
- Returns both display (`heelType`, `material`) and canonical (`heelTypeCode`, `heelMaterialTypeCode`) values.
- Canonical dictionaries exposed through:
  - `GET /api/v1/skus/reference/heel-types`
  - `GET /api/v1/skus/reference/heel-material-types`
  - included in `GET /api/v1/skus/reference/all`

### 4.4 Dedicated receipt and transfer read-model endpoints

Receipt endpoints:
- `GET /api/v1/purchase-orders/:poId/receipts`
- `POST /api/v1/purchase-orders/:poId/receive` now records a `po_receipts` header and `po_receipt_lines`.

Transfer endpoints:
- `GET /api/v1/transfer-orders`
- `GET /api/v1/transfer-orders/:transferOrderId`

### 4.5 Contract examples

SKU response excerpt:

```json
{
  "id": "1b2d...f9",
  "style": "Test Pump v2",
  "heelType": "Stiletto",
  "heelTypeCode": "STILETTO",
  "material": "Lined",
  "heelMaterialTypeCode": "LINED",
  "styleColor": {
    "styleColorId": "9b38...ab",
    "brandId": 1,
    "style": "Test Pump v2",
    "colorId": 2,
    "categoryId": 4,
    "department": "FORMAL",
    "heelTypeCode": "STILETTO",
    "heelMaterialTypeCode": "LINED",
    "season": null,
    "active": true
  }
}
```

PO receive request excerpt:

```json
{
  "locationId": "loc-01",
  "referenceNumber": "RCV-001",
  "receivedBy": "warehouse.user",
  "lines": [
    { "lineId": "a7f9...11", "quantityReceived": 4 }
  ]
}
```

PO receipts response excerpt:

```json
[
  {
    "id": "c3d1...44",
    "poId": "8f77...ee",
    "locationId": "loc-01",
    "locationName": "Almacen Principal",
    "receivedBy": "warehouse.user",
    "referenceNumber": "RCV-001",
    "lines": [
      {
        "id": "0b74...9d",
        "poLineId": "a7f9...11",
        "skuId": "1b2d...f9",
        "quantityReceived": 4
      }
    ]
  }
]
```

## 5) OTB Policy Audit Inputs (PO Submit)

Endpoint:
- `PATCH /api/v1/purchase-orders/:poId/submit`

Additional optional request fields aligned with policy-audit persistence:
- `overrideReasonCode: string`
- `approverIds: string[]`
- `ceoExceptionApprovalId: string`
- `policySource: 'default' | 'configured'`
- `warningThresholdPct: number`
- `hardStopThresholdPct: number`
- `traceId: string`

These fields are optional and backward-compatible with current submit payloads.

## 6) Sales Ledger + OTB SKU Lines Contract

Canonical endpoint/query/response contract for frontend server-table switch is documented in:

- `db/SALES_LEDGER_OTB_API_CONTRACT.md`

This includes:

- endpoint paths + query params
- pagination envelope + field names/types
- explicit sort/filter whitelists for OpenAPI
- required index/read-model notes for implementation
