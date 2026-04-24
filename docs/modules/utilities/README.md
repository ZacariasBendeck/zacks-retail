# Utilities

Operator-facing batch-change surface. Criteria-based SKU picker feeding a shared applyBatchChange primitive.

**Phase:** Development Against RICS Mirror / Cutover Migration target

## Architecture rule

Batch operations MUST NOT modify RICS data. All batch changes apply only to Postgres-owned data or overlay tables. RICS data remains unchanged until cutover. This prevents accidental corruption of live operational data.
