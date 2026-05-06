# Inventory Week Close Runbook

**Status:** backend operation and web operator screen implemented.

## What It Does

The inventory week close rotates the app-owned RICS-compatible 8-week trend projection:

- `app.inventory_history_trend_week`
- weekly counters on `app.inventory_history_snapshot`

Stored trend slots `1..7` represent the prior seven closed weeks. The close moves old slots `2..7` into `1..6`, writes the just-finished week into slot `7`, then clears the current weekly sales/profit/markdown counters so the next week starts at zero.

The current week-ending date is operator-supplied. For example, closing week ending `2026-05-03` uses the company timezone `America/Guatemala` and covers `2026-04-27 00:00` through the end of `2026-05-03`.

## When To Run

Run this once after the final sales posting for the completed week. Use the same week-ending day consistently so the 8-week trend columns stay comparable.

Recommended sequence:

1. Confirm all POS batches for the week are closed and posted.
2. Confirm completed POS tickets are promoted into `app.sales_history_ticket`.
3. Run the dry run.
4. Review validation output.
5. Run the real close.
6. Verify the audit row and spot-check the Inventory Inquiry `[Trend]` tab.

## Where To Run

Primary web path: **Operations -> Inventory Close -> Week Close**.

Run **Dry Run** first. If validation passes, run **Run Close** for the same week-ending date and review the history row.

Backend fallback command, from `apps/api`:

```powershell
node --env-file-if-exists=.env -r tsx/cjs scripts/inventory/close-week.ts --week-ending 2026-05-03 --closed-by zbendeck --dry-run
```

If the dry run passes, rerun without `--dry-run`:

```powershell
node --env-file-if-exists=.env -r tsx/cjs scripts/inventory/close-week.ts --week-ending 2026-05-03 --closed-by zbendeck
```

The screen lives under **Operations**, next to month close, because the weekly trend close is a controlled reporting boundary.

## Built-In Validation

The close refuses to mutate trend history if:

- the week-ending date is already present in `app.inventory_closed_week`
- any completed POS ticket in the week is not promoted into `app.sales_history_ticket`
- `app.inventory_history_snapshot.week_qty_sales` does not match ticket-line totals for the close window

The close runs under a Postgres advisory lock so two operators cannot close the same week at the same time.

## Verification Queries

Confirm the week has exactly one successful close:

```sql
SELECT *
FROM app.inventory_closed_week
WHERE week_ending_date = DATE '2026-05-03';
```

Review the run audit:

```sql
SELECT
  id,
  week_start_date,
  week_ending_date,
  status,
  validation_status,
  snapshots_scanned,
  trend_rows_written,
  snapshots_updated,
  unpromoted_pos_tickets,
  week_sales_mismatch_count,
  total_week_qty_sales,
  total_week_net_sales,
  total_week_profit,
  started_at,
  finished_at,
  error_text
FROM app.inventory_week_close_run
WHERE week_ending_date = DATE '2026-05-03'
ORDER BY started_at DESC;
```

Confirm weekly counters were reset:

```sql
SELECT
  COUNT(*) FILTER (WHERE week_qty_sales <> 0) AS nonzero_week_qty_rows,
  COUNT(*) FILTER (WHERE COALESCE(week_dol_sales, 0) <> 0) AS nonzero_week_sales_rows,
  COUNT(*) FILTER (WHERE COALESCE(week_profit, 0) <> 0) AS nonzero_week_profit_rows,
  COUNT(*) FILTER (WHERE COALESCE(week_markdown, 0) <> 0) AS nonzero_week_markdown_rows
FROM app.inventory_history_snapshot;
```

Confirm slot 7 now contains the just-closed week:

```sql
SELECT
  COUNT(*) AS slot_7_rows,
  SUM(sales) AS slot_7_sales
FROM app.inventory_history_trend_week
WHERE slot_number = 7;
```

The `slot_7_sales` value should match `total_week_qty_sales` in `app.inventory_closed_week`.
