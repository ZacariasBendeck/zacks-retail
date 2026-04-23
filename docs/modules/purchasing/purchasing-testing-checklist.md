# Purchasing Workflow Testing Checklist

## Purpose

This checklist ensures that the purchasing module in Zack’s Retail fully replicates RICS behavior and is safe for cutover.

Each test must be validated against real RICS behavior and data.

---

## 1. Purchase Order Creation (Core Flow)

- [ ] Create PO with valid header (vendor, bill-to, ship-to)
- [ ] PO number generation matches expected format
- [ ] Manual PO number entry works (letters + numbers)
- [ ] Reserved prefixes (A, V) handled correctly
- [ ] Default values (terms, ship-via, etc.) populate correctly
- [ ] Header fields can be overridden correctly
- [ ] Comments persist correctly

---

## 2. SKU Line Entry (CRITICAL UX FLOW)

- [ ] Sequential SKU entry flow works correctly
- [ ] SKU counter increments correctly
- [ ] Each SKU is saved independently
- [ ] Editing a committed SKU works correctly
- [ ] Removing SKU renumbers correctly
- [ ] SKU description matches expected product data

---

## 3. Size Grid / Case Pack

- [ ] Size grid matches SKU size type
- [ ] 1D and 2D size grids render correctly
- [ ] Case pack auto-fill works correctly
- [ ] Multiplier (X__) works correctly
- [ ] Manual overrides of size cells work correctly
- [ ] Changing case pack recalculates quantities
- [ ] Warning appears when overwriting manual edits

---

## 4. Pricing & Cost

- [ ] Retail price captured correctly
- [ ] Cost captured correctly
- [ ] Price overrides do not corrupt SKU master
- [ ] Write-back-to-master behavior works as expected
- [ ] Price persists across save/load

---

## 5. Editing After Receiving (Important RICS Behavior)

- [ ] Editing PO after partial receive shows original quantities
- [ ] Editing sets absolute value (not delta)
- [ ] Remaining quantity recalculates correctly
- [ ] No accidental over-receive occurs

---

## 6. Duplicate / Replicate / Combine

### Duplicate
- [ ] PO duplication creates new PO correctly
- [ ] Header values copied correctly
- [ ] Lines copied correctly
- [ ] New PO is editable

### Replicate
- [ ] Replication creates correct PO numbers per store
- [ ] Skips duplicates correctly
- [ ] All replicated POs are valid
- [ ] Output list shows created vs skipped

### Combine
- [ ] Combining POs merges lines correctly
- [ ] Source PO is deleted
- [ ] Destination PO contains all lines
- [ ] No data loss

---

## 7. Receiving (CRITICAL)

### Manual Receiving
- [ ] Partial receiving works correctly
- [ ] Full receiving works correctly
- [ ] Remaining quantities handled correctly
- [ ] Discount % adjusts cost correctly
- [ ] Freight adjusts cost correctly
- [ ] Negative quantity corrects over-receipt
- [ ] Cannot receive SKU not on PO (unless allowed case)

### Scan Mode
- [ ] UPC scan increments correct size cell
- [ ] Scan session behaves correctly
- [ ] End session finalizes correctly

---

## 8. ASN Cartons

- [ ] ASN carton scan receives all items correctly
- [ ] Carton contents match expected SKUs
- [ ] Label generation works correctly
- [ ] Manual carton edits reflect correctly
- [ ] Carton receive is idempotent (no double receive)

---

## 9. PO Status Lifecycle

- [ ] DRAFT → SUBMITTED works
- [ ] SUBMITTED → CONFIRMED works
- [ ] Partial receive sets PARTIALLY_RECEIVED
- [ ] Full receive sets RECEIVED
- [ ] Cancel transitions correctly
- [ ] Status history logs correctly

---

## 10. Automatic Purchase Orders

- [ ] Auto PO detects shortages correctly
- [ ] Model quantity logic is correct
- [ ] On-hand + on-order calculation is correct
- [ ] Reorder rounding works correctly
- [ ] Vendor/category filters work correctly
- [ ] Combine-to-store logic works correctly
- [ ] Preview matches actual commit
- [ ] Generated POs are valid

---

## 11. Order Worksheet

- [ ] Worksheet totals match inputs
- [ ] Size distribution sums to 100%
- [ ] SKU lines persist correctly
- [ ] Materialize to PO works correctly
- [ ] Generated PO matches worksheet data

---

## 12. Reset Future Orders

- [ ] Threshold logic works correctly
- [ ] POs correctly classified as At-Once vs Future
- [ ] Manual reset works correctly
- [ ] Scheduled reset behaves correctly

---

## 13. On-Order Accuracy (CRITICAL)

- [ ] On-order matches expected PO lines
- [ ] On-order reflects partial receiving
- [ ] On-order disappears after full receive
- [ ] On-order matches RICS behavior
- [ ] Size-level on-order is correct

---

## 14. Reports

### Purchase Orders Report
- [ ] Sorting works (store, vendor, date)
- [ ] Filters work correctly
- [ ] Ordered vs Open views correct
- [ ] Totals match expected values

### Open PO by Month
- [ ] Month distribution is correct
- [ ] Cost and retail projections correct
- [ ] Vendor/category grouping works

### Cash Projection
- [ ] Payment date projection correct
- [ ] Totals match expected

---

## 15. Integration with Inventory

- [ ] Receiving creates inventory movements
- [ ] Inventory on-hand updates correctly
- [ ] Cost updates propagate correctly
- [ ] Movement ledger matches PO activity

---

## 16. Migration Validation

- [ ] All legacy POs imported correctly
- [ ] No missing POs
- [ ] No duplicate POs
- [ ] Statuses preserved correctly
- [ ] On-order values match RICS
- [ ] SKU linkage is correct

---

## 17. Edge Cases

- [ ] Over-receipt correction works correctly
- [ ] Partial cancellation handled correctly
- [ ] Duplicate PO numbers prevented
- [ ] Missing vendor handled correctly
- [ ] Invalid SKU prevented
- [ ] Large POs perform correctly

---

## 18. Performance

- [ ] PO load time acceptable
- [ ] Large PO edit performance acceptable
- [ ] Auto PO job performance acceptable
- [ ] Reports load quickly

---

## 19. Operator Validation

- [ ] Buyer can create PO easily
- [ ] Buyer can receive without confusion
- [ ] Warehouse flow matches expectations
- [ ] No usability blockers

---

## Final Readiness Check

Cutover allowed only if:

- [ ] All critical flows PASS
- [ ] No high-impact FAIL items remain
- [ ] On-order matches RICS consistently
- [ ] Receiving behaves identically to RICS
- [ ] Operators confirm usability