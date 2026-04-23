# Inventory Testing Checklist

**Purpose:**  
This document defines how we verify that the inventory module matches RICS behavior and is safe for cutover.

This is a required validation step before migration.

## Testing

See: [inventory-testing-checklist.md](./inventory-testing-checklist.md)

All inventory functionality must pass this checklist before cutover.

## 4. Inventory (Ledger + Store + Size Accuracy)

### Core Principle

Inventory must be explainable.

For any SKU, store, and size:

> The system must answer:  
> "What is the on-hand quantity, and how did we get here?"

This must match RICS behavior.

---

### A. On-Hand Accuracy

- [ ] On-hand quantity matches RICS after migration (SKU × Store)
- [ ] On-hand matches at **size level** (Column × Row)
- [ ] Negative on-hand behaves consistently with RICS
- [ ] Quantity-only SKUs (no size grid) behave correctly

---

### B. Ledger Integrity (CRITICAL)

- [ ] Every inventory change creates a movement record
- [ ] Movement types match expected behavior:
  - Manual Receipt
  - Manual Return
  - PO Receipt
  - Transfer In
  - Transfer Out
  - Physical Adjustment
  - Sale
  - Sale Return
- [ ] Movement quantities are correct (+ / - direction)
- [ ] Movement timestamps are correct
- [ ] Movement history explains current on-hand exactly
- [ ] Reconstructing on-hand from movements produces the same result

---

### C. Receiving (Manual + PO)

- [ ] Manual Receipt increases on-hand correctly
- [ ] PO Receipt increases on-hand correctly
- [ ] Partial receiving behaves correctly
- [ ] Cost updates are applied correctly
- [ ] Last received date updates correctly
- [ ] Receiving works even for incomplete/enrichment SKUs
- [ ] Case-pack (X__) logic behaves correctly
- [ ] UPC scan receiving works correctly

---

### D. Returns

- [ ] Manual Returns decrease on-hand correctly
- [ ] Return does not allow invalid negative operations (or matches RICS behavior)
- [ ] On-hand preview before return is accurate
- [ ] Return journal/log matches expected output

---

### E. Transfers (Manual + Automatic)

#### Manual Transfers
- [ ] Transfer decreases source store correctly
- [ ] Transfer increases destination store correctly
- [ ] Size-level transfer accuracy verified
- [ ] "Transfer All" fills correctly
- [ ] Transfer journal is correct

#### Transfer Lifecycle
- [ ] IN_TRANSIT → RECEIVED works correctly (if enabled)
- [ ] Instant-complete mode matches RICS behavior
- [ ] Partial receipt works correctly

---

### F. Automatic Transfers (Replenishment)

- [ ] Transfers generated when on-hand < model
- [ ] Warehouse supply constraints respected
- [ ] Reorder quantity rounding works correctly
- [ ] Store processing order is deterministic
- [ ] Transfer preview matches actual execution
- [ ] Missing inventory is handled correctly

---

### G. Balancing Transfers

- [ ] Over/Under model balancing works correctly
- [ ] Non-model balancing works correctly
- [ ] Performance metrics (ROI / Turns / Sell-Thru) affect behavior correctly
- [ ] Tie-break logic behaves correctly
- [ ] Double-transfer logic behaves correctly
- [ ] "Strip stores below N sizes" behaves correctly
- [ ] Negative on-hand exceptions handled correctly
- [ ] Preview matches commit results exactly

---

### H. Replenishment Targets

- [ ] Model quantities stored correctly
- [ ] Max quantities affect shortfall correctly
- [ ] Reorder quantities apply correctly
- [ ] Multi-store propagation works (ranges like 2,5-8,11)
- [ ] Copy between Model/Max/Reorder works correctly

---

### I. Inventory Inquiry (CRITICAL SCREEN)

- [ ] On-hand grid matches RICS
- [ ] On-order data matches purchasing
- [ ] Model / Short / Max values are correct
- [ ] Sales data overlays correctly (MTD, YTD, etc.)
- [ ] Last received date is correct
- [ ] All display modes (F-key equivalents) behave correctly
- [ ] All-stores views behave correctly

---

### J. Inventory Change Detail (Audit View)

- [ ] Shows all movement types
- [ ] Shows correct store, date, type, quantity
- [ ] Comments/reference data match source (PO, transfer, etc.)
- [ ] Most recent first ordering is correct
- [ ] Size-detail toggle works correctly
- [ ] Show-all-stores toggle works correctly

---

### K. Find Inventory by Size

- [ ] Finds SKUs correctly by size
- [ ] Works across size types
- [ ] Restrict-to-size-type toggle behaves correctly
- [ ] Filters (category, vendor, store) work correctly
- [ ] Sorting options work correctly

---

### L. Reporting

#### Inventory Detail Report
- [ ] All report types produce correct output:
  - Size Detail
  - SKU Detail
  - SKU Summary
  - Category/Vendor Summary
  - Store Summary
- [ ] Movement type filters work correctly
- [ ] Date filtering is correct
- [ ] Costs included/excluded correctly

#### Transfer Reports
- [ ] Recommended Transfer report matches logic
- [ ] Transfer Summary matches totals
- [ ] Monthly aggregation matches RICS

---

### M. Performance / Scaling

- [ ] Inventory lookup is fast for full catalog
- [ ] SKU lookup index returns complete dataset
- [ ] Large store datasets perform correctly
- [ ] Movement queries are performant

---

### N. Edge Cases (VERY IMPORTANT)

- [ ] Negative inventory scenarios handled correctly
- [ ] Duplicate movements prevented (idempotency)
- [ ] Backdated movements behave correctly
- [ ] Concurrent updates do not corrupt stock
- [ ] Transfer conflicts handled correctly
- [ ] Discontinue rollup behaves correctly

---

### O. Migration Validation

- [ ] On-hand totals match RICS
- [ ] Movement reconstruction matches RICS behavior
- [ ] No orphan inventory records
- [ ] No missing SKUs in inventory
- [ ] No mismatched store quantities