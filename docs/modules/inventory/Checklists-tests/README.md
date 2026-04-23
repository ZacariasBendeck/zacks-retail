# Inventory Checklist Tests

Runnable scripts that exercise the inventory API and score each item in
[inventory-testing-checklist.md](../inventory-testing-checklist.md) as **PASS**,
**FAIL**, or **SKIP**.

These are not Jest tests — they are standalone `tsx` scripts that hit a running
dev API (default `http://localhost:4000`) and print a mapped checklist summary.
Run them for a quick accuracy pass after a change or before a rehearsal.

## How to run

Start the API in another terminal:

```sh
pnpm --filter @benlow-rics/api dev
```

Then, from the repo root:

```sh
# run everything
pnpm --filter @benlow-rics/api exec tsx ../../docs/modules/inventory/Checklists-tests/run-all.ts

# or run a single section
pnpm --filter @benlow-rics/api exec tsx ../../docs/modules/inventory/Checklists-tests/section-b-ledger.ts
```

Override the API base URL with `API_BASE=http://...`.

## What is covered

Each script maps 1:1 to a section of the checklist. The ID in brackets is the
checklist item it validates.

| Script | Checklist sections | Status |
|---|---|---|
| [`section-a-onhand.ts`](./section-a-onhand.ts) | A. On-Hand Accuracy | Partial — self-consistency only; RICS compare is TODO |
| [`section-b-ledger.ts`](./section-b-ledger.ts) | B. Ledger Integrity | Automated |
| [`section-c-receiving.ts`](./section-c-receiving.ts) | C. Receiving (Manual + PO) | Partial — mutation path; case-pack / UPC scan are UI-only |
| [`section-d-returns.ts`](./section-d-returns.ts) | D. Returns | Automated |
| [`section-j-change-detail.ts`](./section-j-change-detail.ts) | J. Inventory Change Detail | Automated against audit log |
| [`section-n-edge-cases.ts`](./section-n-edge-cases.ts) | N. Edge Cases | Automated — idempotency + optimistic concurrency |

## What is NOT covered (yet)

These sections are not wired to scripts because the feature is not implemented
in the API yet, or the verification is UI-only / depends on the RICS MDBs:

- **E. Transfers** — `transferOrderRoutes.ts` is scaffolded; lifecycle states
  aren't real. Add scripts once `DRAFT → IN_TRANSIT → RECEIVED` commits land.
- **F. Automatic Transfers** — not implemented.
- **G. Balancing Transfers** — not implemented.
- **H. Replenishment Targets** — Model / Max / Reorder storage not implemented.
- **I. Inventory Inquiry** — served by `ricsInventoryAdapter` (reads MDBs).
  Automated comparison belongs with `/verify-rics-mirror`, not here.
- **K. Find Inventory by Size** — route exists but relies on RICS adapter.
- **L. Reporting** — Inventory Detail Report / Transfer Summary not implemented.
- **M. Performance / Scaling** — [`docs/operations/sku-lookup-index-warmup.md`](../../../operations/sku-lookup-index-warmup.md)
  is the dedicated check for the SKU Lookup index; keep performance work there.
- **O. Migration Validation** — belongs with the `/verify-rics-mirror` command
  (compare `rics_mirror.*` row counts vs RICS MDBs).

Add new scripts here when a feature becomes real. Each script should print
`[<section>-<n>] <description> … PASS|FAIL|SKIP`.

## Harness

[`harness.ts`](./harness.ts) has the shared plumbing — HTTP helpers, SKU seeder,
and the PASS/FAIL/SKIP reporter. Every section file imports it.
