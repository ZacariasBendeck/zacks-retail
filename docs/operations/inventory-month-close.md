# Inventory Month Close Runbook

**Status:** backend operation and web operator screen implemented.

## What It Does

The inventory month close freezes the completed month into the app-owned RICS-compatible reporting projections:

- `app.inventory_history_month`
- `app.inventory_history_snapshot`
- `app.inventory_sales_cell`

For the closed month, it writes the current month sales counters into the matching calendar-month slot, advances the last-month inventory boundary, resets month-to-date counters, and records a close audit row. ROI and Turns are not stored by this job; reports continue to calculate them from sales, profit, COGS, and inventory value.

For example, closing April 2026 writes `year_month = '2026-04'`, slot `4`, and `snapshot_as_of = 2026-05-01` using the company timezone `America/Guatemala`.

## When To Run

Run this once after the last store has posted all sales for the completed month and before users begin relying on the next month's MTD inventory history reports.

Recommended sequence:

1. Confirm all POS batches for the month are closed and posted.
2. Confirm completed POS tickets are promoted into `app.sales_history_ticket`.
3. Run the dry run.
4. Review validation output.
5. Run the real close.
6. Verify the audit row and key report totals.

## Where To Run

Primary web path: **Operations -> Inventory Close -> Month Close**.

Run **Dry Run** first. If validation passes, run **Run Close** for the same month and review the history row.

Backend fallback command, from `apps/api`:

```powershell
node --env-file-if-exists=.env -r tsx/cjs scripts/inventory/close-month.ts --month 2026-04 --closed-by zbendeck --dry-run
```

If the dry run passes, rerun without `--dry-run`:

```powershell
node --env-file-if-exists=.env -r tsx/cjs scripts/inventory/close-month.ts --month 2026-04 --closed-by zbendeck
```

The screen lives under **Operations**, not general **Utilities**, because month close is a controlled reporting/accounting boundary with duplicate-close protection.

## Built-In Validation

The close refuses to mutate history if:

- the month is already present in `app.inventory_closed_month`
- any completed POS ticket in the month is not promoted into `app.sales_history_ticket`
- `app.inventory_sales_cell.mtd_sales` does not match month ticket-line totals by store, SKU, row, and column

The close runs under a Postgres advisory lock so two operators cannot close the same period at the same time.

## Verification Queries

Confirm the month has exactly one successful close:

```sql
SELECT *
FROM app.inventory_closed_month
WHERE year_month = '2026-04';
```

Review the run audit:

```sql
SELECT
  id,
  year_month,
  status,
  validation_status,
  snapshots_scanned,
  months_upserted,
  snapshots_updated,
  sales_cells_reset,
  unpromoted_pos_tickets,
  sales_cell_mismatch_count,
  total_qty_sales,
  total_net_sales,
  total_profit,
  inventory_value_total,
  started_at,
  finished_at,
  error_text
FROM app.inventory_month_close_run
WHERE year_month = '2026-04'
ORDER BY started_at DESC;
```

Confirm snapshot MTD counters were reset:

```sql
SELECT
  COUNT(*) FILTER (WHERE month_qty_sales <> 0) AS nonzero_month_qty_rows,
  COUNT(*) FILTER (WHERE COALESCE(month_dol_sales, 0) <> 0) AS nonzero_month_sales_rows,
  COUNT(*) FILTER (WHERE COALESCE(month_profit, 0) <> 0) AS nonzero_month_profit_rows,
  COUNT(*) FILTER (WHERE COALESCE(month_markdown, 0) <> 0) AS nonzero_month_markdown_rows
FROM app.inventory_history_snapshot;
```

Confirm per-size MTD cells were reset:

```sql
SELECT COUNT(*) AS nonzero_mtd_cells
FROM app.inventory_sales_cell
WHERE mtd_sales <> 0;
```

Confirm the target month slot exists for the closed month:

```sql
SELECT
  COUNT(*) AS month_rows,
  SUM(qty_sales) AS qty_sales,
  ROUND(SUM(COALESCE(net_sales, 0)), 2) AS net_sales,
  ROUND(SUM(COALESCE(profit, 0)), 2) AS profit,
  ROUND(SUM(COALESCE(inventory_value, 0)), 2) AS inventory_value
FROM app.inventory_history_month
WHERE year_month = '2026-04'
  AND slot_number = 4;
```

The totals in the final query should match the corresponding `total_*` values recorded in `app.inventory_closed_month`.

## Related Weekly Close

8-week trending is maintained by a separate weekly close. See [Inventory Week Close Runbook](inventory-week-close.md). It should live beside Month Close under **Operations**, not under general Utilities.
