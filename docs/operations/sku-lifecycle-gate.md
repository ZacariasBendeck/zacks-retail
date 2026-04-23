# SKU Lifecycle Gate

**Status:** operational invariant — every consumer that reads or acts on SKUs from the `app.sku` table (the post-Phase-5 lifecycle table) MUST route its lookup through one of the helpers in [`apps/api/src/services/products/skuLifecycleGate.ts`](../../apps/api/src/services/products/skuLifecycleGate.ts), not through direct Prisma queries.

## What it is

Four gatekeeper helpers, one per downstream use-case. Each resolves a SKU identifier (code string or UUID) against `app.sku` and applies the state rule for that specific operation. If the identifier matches nothing in `app.sku`, the helper returns `Ok(null)` so the caller can fall through to the legacy RICS lookup path. If it matches but the state is wrong, it returns `Err({ kind: 'ConstraintViolation' | 'NotFound', message })` with a Spanish message suitable for surfacing to the operator.

| Helper | Allowed states | Use for |
|---|---|---|
| `findActiveSku` | ACTIVE | Default read — POS product lookup, storefront GETs, search-by-code, anywhere a DRAFT should be invisible. |
| `gateForSell` | ACTIVE | POS add-to-ticket, ecommerce add-to-cart, voucher redemption. |
| `gateForAllocate` | ACTIVE | Transfer creation, store allocation, distribution. |
| `gateForPrintBarcode` | ACTIVE + non-null `code` | Barcode label generation, price-tag print. |
| `gateForReceive` | DRAFT + ACTIVE (blocks DISCONTINUED) | PO receipt, inbound inventory mutations. Warehouse can receive DRAFTs because merchandise often arrives before the final code is set. |

## Why it matters

The lifecycle model (DRAFT → ACTIVE → DISCONTINUED) protects the operator from shipping a half-finished SKU to customers:

- A DRAFT has no final code, possibly no category, maybe no price. Selling one would corrupt reporting and confuse cashiers.
- A DISCONTINUED SKU was merged into another or retired. Any operation beyond read-only is a mistake.
- A DRAFT is receivable because the physical goods arrive on the buyer's lead time, which usually predates the merchandiser's code-assignment workflow.

Enforcing these rules only in the UI leaves the API open: a script, a direct `curl`, or a future consumer that bypasses the form can receive an order line pointing at a discontinued SKU, or ring up a DRAFT as a POS sale. The gate exists to make those paths fail with a meaningful error, not silently succeed.

## Where it's called

**Currently wired (Phase 5g.1, 2026-04-22):**

| Route | File | Helper | Effect |
|---|---|---|---|
| `GET /api/v1/pos/skus/:skuCode` | [`apps/api/src/routes/posSkuRoutes.ts`](../../apps/api/src/routes/posSkuRoutes.ts) | `findActiveSku` | Blocks DRAFT / DISCONTINUED provisional codes from returning price data at the register. |
| `GET /api/v1/pos/skus/:skuCode/price-slots` | same | `findActiveSku` | Same — price-slot lookup can't surface a non-ACTIVE SKU. |
| `GET /api/public/products/:productId` | [`apps/api/src/routes/publicProductRoutes.ts`](../../apps/api/src/routes/publicProductRoutes.ts) | `findActiveSku` | Storefront product detail returns 404 for DRAFT codes so customers can't hit leaked URLs. |

Every hit matches against `app.sku` first. A non-ACTIVE match short-circuits with a `NotFound` (404) + Spanish message. A miss falls through to the existing RICS adapter so legacy SKUs keep working.

**Post 2026-04-23, the fall-through path is vestigial but kept.** After the first `pnpm sync:rics-skus` run, every legacy RICS SKU also exists in `app.sku` as ACTIVE (`source='rics'`) — see [docs/operations/sku-lifecycle-backfill.md](sku-lifecycle-backfill.md). The gate now answers every code from `app.sku`; the RICS-adapter arm only matters during the brief window between a mirror swap and the post-swap backfill completing. Leave it in place for resilience until Phase C drops `rics_mirror`.

**Legacy route deprecation (Phase 5g.1):**

Every response from `/api/v1/skus/*` now carries `Deprecation: true` + `Link: </api/v1/products/sku-drafts>; rel="successor-version"` (RFC 8594). Non-GET hits log a `[deprecation]` warning to the server console so operators can track which clients still write via the old surface.

**Still pending wire-up (Phase 5g.2+):**

| Consumer | File(s) | Helper | Notes |
|---|---|---|---|
| POS add-to-ticket | `apps/api/src/routes/ticketRoutes.ts`, `apps/api/src/services/ticketService.ts` | `gateForSell` | Called during cashier's line-add; needs to intercept before the SKU hits the ticket. |
| Cart line add | `apps/api/src/routes/cartRoutes.ts` | `gateForSell` | Storefront add-to-cart. |
| PO line create/edit | `apps/api/src/services/purchaseOrderService.ts` | `gateForReceive` | PO work is inherently receipt-bound — DRAFT SKUs are valid on a PO line. |
| PO receipt | same as above, receive handler | `gateForReceive` | |
| Inventory adjustment (receive kind) | `apps/api/src/services/adjustmentService.ts` | `gateForReceive` | |
| Inventory adjustment (non-receive) | same | `gateForAllocate` | |
| Transfer order line | `apps/api/src/routes/transferOrderRoutes.ts` | `gateForAllocate` | |
| Barcode print endpoint | TBD (route doesn't exist yet) | `gateForPrintBarcode` | Phase 5e / future. |

These paths still read exclusively from SQLite or `rics_mirror`, so they can't see `app.sku` rows today and a gate there would be a no-op. The wire-up lands as each service is refactored to read from the union of `rics_mirror.inventory_master + app.sku`.

### Wiring checklist for Phase 5g

| Consumer | File(s) | Helper |
|---|---|---|
| POS add-to-ticket | `apps/api/src/routes/ticketRoutes.ts`, `apps/api/src/services/ticketService.ts` | `gateForSell` |
| POS SKU lookup (register + inquiry) | `apps/api/src/routes/posSkuRoutes.ts` | `findActiveSku` |
| Storefront product detail | `apps/api/src/routes/publicProductRoutes.ts` | `findActiveSku` |
| Cart line add | `apps/api/src/routes/cartRoutes.ts` | `gateForSell` |
| PO line create/edit | `apps/api/src/services/purchaseOrderService.ts` (SKU validation in line items) | `gateForReceive` — the PO workflow is inherently receipt-bound, and a DRAFT SKU should be valid on a PO line. |
| PO receipt | same as above, receive handler | `gateForReceive` |
| Inventory adjustment (receive kind) | `apps/api/src/services/adjustmentService.ts` | `gateForReceive` |
| Inventory adjustment (non-receive kind) | same | `gateForAllocate` (conservative — adjustments against DRAFTs are operator error) |
| Transfer order line | `apps/api/src/routes/transferOrderRoutes.ts` | `gateForAllocate` |
| Barcode print endpoint | TBD (route doesn't exist yet) | `gateForPrintBarcode` |

## Usage pattern

Every call follows the same three-step shape:

```ts
import { skuGate } from '../services/products/skuLifecycleGate';

// 1. Gate the SKU by code or id
const gated = await skuGate.gateForSell({ code: skuCode });

// 2. Handle the gate result
if (!gated.ok) {
  // Typed error — forward to the HTTP layer
  res.status(repoHttpStatus(gated.error))
     .json({ error: { code: repoHttpCode(gated.error), message: gated.error.message } });
  return;
}

// 3. Branch on "found in app.sku" vs "fall through to legacy"
if (gated.value == null) {
  // Not in app.sku — do the legacy RICS lookup here
  // (Once Phase 5g completes and all SKUs are in app.sku, this branch goes away.)
} else {
  // ACTIVE SKU from app.sku — proceed with the operation
  const skuId = gated.value.id;
  // …
}
```

## How to verify

Integration tests live at [`apps/api/tests/services/products/skuLifecycleGate.test.ts`](../../apps/api/tests/services/products/skuLifecycleGate.test.ts). They cover every helper × every state (DRAFT / ACTIVE / DISCONTINUED / not-in-app.sku), plus the fall-through semantics.

```
pnpm --filter api test -- skuLifecycleGate
```

Expected: all 15 tests green. If a test fails, the gate's state matrix has regressed — check both `skuLifecycleGate.ts` and the underlying `assertCan*` helpers in [`skuLifecycleService.ts`](../../apps/api/src/services/products/skuLifecycleService.ts).

## Things that will break this invariant

- **Reading `app.sku` directly via Prisma in a consumer.** If a new route does `prisma.sku.findUnique(...)` and acts on the result without checking `skuState`, that's a bypass. Every read must go through `skuGate.*`.
- **Not distinguishing receive from sell.** Using `gateForSell` on a receipt path incorrectly blocks DRAFTs. Warehouse workflow breaks silently (the operator sees "SKU en estado DRAFT" when the SKU should be receivable).
- **Swallowing the error branch.** If a caller does `const { value } = (await skuGate.gateForSell(...)) as any`, they lose the typed error handling and the backend silently accepts bad operations.
- **Caching the gate result across requests.** State flips (finalize, discontinue) happen at any time — don't cache gate responses for longer than the current HTTP request.
