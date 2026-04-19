-- Migration 014: Sales Ledger + OTB SKU Lines support
-- Adds index for date-first sales scans and OTB SKU plan lines table

-- Index for sales ledger date-first scans (per SALES_LEDGER_OTB_API_CONTRACT.md section 5.1)
CREATE INDEX IF NOT EXISTS idx_sales_transactions_sold_at_sku
  ON sales_transactions(sold_at DESC, sku_id);

-- OTB SKU plan lines allocation table (per SALES_LEDGER_OTB_API_CONTRACT.md section 5.2)
CREATE TABLE IF NOT EXISTS otb_sku_plan_lines (
  id TEXT PRIMARY KEY,
  otb_budget_id TEXT NOT NULL REFERENCES otb_budgets(id),
  sku_id TEXT NOT NULL REFERENCES skus(id),
  budget_units INTEGER NOT NULL CHECK(budget_units >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(otb_budget_id, sku_id)
);

CREATE INDEX IF NOT EXISTS idx_otb_sku_plan_lines_sku
  ON otb_sku_plan_lines(sku_id);

-- View: OTB SKU lines read model
-- Joins budget period + SKU plan + actual sold units + open PO units
CREATE VIEW IF NOT EXISTS v_otb_sku_lines AS
SELECT
  opl.otb_budget_id || ':' || opl.sku_id AS id,
  s.sku_code AS sku_code,
  s.style,
  s.department,
  s.category_id,
  ob.year,
  ob.month,
  opl.budget_units,
  COALESCE(sold.total_sold, 0) AS actual_units,
  COALESCE(ordered.total_on_order, 0) AS on_order_units,
  opl.budget_units - COALESCE(sold.total_sold, 0) - COALESCE(ordered.total_on_order, 0) AS open_to_buy_units
FROM otb_sku_plan_lines opl
JOIN otb_budgets ob ON ob.id = opl.otb_budget_id
JOIN skus s ON s.id = opl.sku_id
LEFT JOIN (
  -- Actual units sold in the budget period
  SELECT
    st.sku_id,
    strftime('%Y', st.sold_at) AS yr,
    CAST(strftime('%m', st.sold_at) AS INTEGER) AS mo,
    SUM(st.quantity) AS total_sold
  FROM sales_transactions st
  GROUP BY st.sku_id, strftime('%Y', st.sold_at), CAST(strftime('%m', st.sold_at) AS INTEGER)
) sold ON sold.sku_id = opl.sku_id
      AND CAST(sold.yr AS INTEGER) = ob.year
      AND sold.mo = ob.month
LEFT JOIN (
  -- On-order units from open POs in the budget period
  SELECT
    pol.sku_id,
    strftime('%Y', po.created_at) AS yr,
    CAST(strftime('%m', po.created_at) AS INTEGER) AS mo,
    SUM(pol.quantity_ordered - COALESCE(pol.quantity_received, 0)) AS total_on_order
  FROM purchase_order_lines pol
  JOIN purchase_orders po ON po.id = pol.po_id
  WHERE po.status IN ('SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED')
  GROUP BY pol.sku_id, strftime('%Y', po.created_at), CAST(strftime('%m', po.created_at) AS INTEGER)
) ordered ON ordered.sku_id = opl.sku_id
         AND CAST(ordered.yr AS INTEGER) = ob.year
         AND ordered.mo = ob.month;
