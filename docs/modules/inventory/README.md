# Inventory

On-hand, on-order, movements ledger, multi-location, transfers (manual / auto / balancing), models + max + reorder, inventory inquiry, find-by-size, change detail, inventory detail report, recommended transfer report, transfer summary.

**Phase:** Development Against RICS Mirror / Cutover Migration target

## Architecture rule

No writes into RICS. Reads from rics_mirror only. Postgres owns all new logic until cutover.
