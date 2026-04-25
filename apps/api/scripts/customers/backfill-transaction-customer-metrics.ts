import { prisma } from '../../src/db/prisma';

const METRICS_SQL = `
WITH completed_tx AS (
  SELECT *
  FROM app.customer_transaction_fact
  WHERE status = 'completed'
),
purchase_tx AS (
  SELECT *
  FROM completed_tx
  WHERE transaction_kind = 'purchase'
),
transaction_customer_ids AS (
  SELECT DISTINCT customer_id
  FROM completed_tx
),
summary AS (
  SELECT
    customer_id,
    ROUND(COALESCE(SUM(net_amount), 0)::numeric, 2) AS lifetime_value,
    COUNT(*) FILTER (WHERE transaction_kind = 'purchase')::int AS total_orders,
    ROUND(COALESCE(SUM(net_amount - cost_amount), 0)::numeric, 2) AS margin_value
  FROM completed_tx
  GROUP BY customer_id
),
purchase_window_summary AS (
  SELECT
    customer_id,
    COUNT(*) FILTER (WHERE purchased_at >= NOW() - INTERVAL '30 days')::int AS orders_30d,
    COUNT(*) FILTER (WHERE purchased_at >= NOW() - INTERVAL '90 days')::int AS orders_90d,
    COUNT(*) FILTER (WHERE purchased_at >= NOW() - INTERVAL '365 days')::int AS orders_365d,
    MAX(purchased_at) AS last_purchase_date,
    ROUND(COALESCE(SUM(discount_amount), 0)::numeric, 2) AS discount_amount_sum,
    ROUND(COALESCE(SUM(total_amount), 0)::numeric, 2) AS total_amount_sum,
    COUNT(*) FILTER (
      WHERE channel = 'online'
        AND purchased_at >= NOW() - INTERVAL '365 days'
    )::int AS web_order_count_365d,
    COUNT(*) FILTER (
      WHERE channel = 'store'
        AND purchased_at >= NOW() - INTERVAL '365 days'
    )::int AS store_order_count_365d
  FROM purchase_tx
  GROUP BY customer_id
),
purchase_gaps AS (
  SELECT
    customer_id,
    GREATEST(
      EXTRACT(
        EPOCH FROM (
          purchased_at - LAG(purchased_at) OVER (
            PARTITION BY customer_id
            ORDER BY purchased_at
          )
        )
      ),
      0
    ) / 86400.0 AS gap_days
  FROM purchase_tx
),
avg_gap AS (
  SELECT
    customer_id,
    ROUND(AVG(gap_days)::numeric, 2) AS avg_days_between_orders
  FROM purchase_gaps
  WHERE gap_days IS NOT NULL
  GROUP BY customer_id
),
purchase_store_counts_365 AS (
  SELECT
    customer_id,
    store_id,
    COUNT(*)::int AS purchase_count_365d,
    ROUND(COALESCE(SUM(net_amount), 0)::numeric, 2) AS net_revenue_365d,
    MAX(purchased_at) AS last_purchase_at
  FROM purchase_tx
  WHERE purchased_at >= NOW() - INTERVAL '365 days'
    AND store_id IS NOT NULL
  GROUP BY customer_id, store_id
),
primary_store AS (
  SELECT DISTINCT ON (customer_id)
    customer_id,
    store_id AS primary_store_id,
    purchase_count_365d AS primary_store_purchase_count_365d
  FROM purchase_store_counts_365
  ORDER BY
    customer_id,
    purchase_count_365d DESC,
    net_revenue_365d DESC,
    last_purchase_at DESC,
    store_id ASC
),
assembled AS (
  SELECT
    t.customer_id,
    COALESCE(s.lifetime_value, 0)::numeric(14, 2) AS lifetime_value,
    COALESCE(s.total_orders, 0) AS total_orders,
    CASE
      WHEN COALESCE(s.total_orders, 0) > 0
        THEN ROUND((COALESCE(s.lifetime_value, 0) / s.total_orders)::numeric, 2)
      ELSE 0::numeric
    END AS avg_order_value,
    COALESCE(s.margin_value, 0)::numeric(14, 2) AS margin_value,
    COALESCE(p.orders_30d, 0) AS orders_30d,
    COALESCE(p.orders_90d, 0) AS orders_90d,
    COALESCE(p.orders_365d, 0) AS orders_365d,
    a.avg_days_between_orders::numeric(10, 2) AS avg_days_between_orders,
    p.last_purchase_date,
    CASE
      WHEN p.last_purchase_date IS NULL THEN NULL
      ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - p.last_purchase_date)) / 86400))::int
    END AS recency_days,
    CASE
      WHEN p.last_purchase_date IS NULL THEN FALSE
      ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - p.last_purchase_date)) / 86400))::int <= 60
    END AS is_active,
    CASE
      WHEN COALESCE(p.total_amount_sum, 0) > 0 THEN LEAST(
        1::numeric,
        GREATEST(0::numeric, ROUND((p.discount_amount_sum / p.total_amount_sum)::numeric, 4))
      )
      ELSE NULL
    END AS discount_ratio,
    ps.primary_store_id,
    CASE
      WHEN COALESCE(s.total_orders, 0) > 0
        AND ps.primary_store_purchase_count_365d IS NOT NULL
        THEN LEAST(
          1::numeric,
          GREATEST(
            0::numeric,
            ROUND((ps.primary_store_purchase_count_365d::numeric / s.total_orders)::numeric, 4)
          )
        )
      ELSE NULL
    END AS store_loyalty_ratio,
    CASE
      WHEN COALESCE(s.total_orders, 0) > 0
        THEN LEAST(
          1::numeric,
          GREATEST(
            0::numeric,
            ROUND((COALESCE(p.web_order_count_365d, 0)::numeric / s.total_orders)::numeric, 4)
          )
        )
      ELSE NULL
    END AS online_ratio
  FROM transaction_customer_ids t
  LEFT JOIN summary s
    ON s.customer_id = t.customer_id
  LEFT JOIN purchase_window_summary p
    ON p.customer_id = t.customer_id
  LEFT JOIN avg_gap a
    ON a.customer_id = t.customer_id
  LEFT JOIN primary_store ps
    ON ps.customer_id = t.customer_id
)
INSERT INTO app.customer_metrics (
  customer_id,
  lifetime_value,
  total_orders,
  avg_order_value,
  margin_value,
  orders_30d,
  orders_90d,
  orders_365d,
  avg_days_between_orders,
  last_purchase_date,
  recency_days,
  is_active,
  discount_ratio,
  primary_store_id,
  store_loyalty_ratio,
  online_ratio,
  churn_risk,
  is_dormant,
  r_score,
  f_score,
  m_score,
  updated_at
)
SELECT
  customer_id,
  lifetime_value,
  total_orders,
  avg_order_value,
  margin_value,
  orders_30d,
  orders_90d,
  orders_365d,
  avg_days_between_orders,
  last_purchase_date,
  recency_days,
  is_active,
  discount_ratio,
  primary_store_id,
  store_loyalty_ratio,
  online_ratio,
  CASE
    WHEN recency_days IS NULL THEN NULL
    WHEN recency_days > (COALESCE(NULLIF(avg_days_between_orders, 0), 60) * 2) THEN 'HIGH'
    WHEN recency_days > (COALESCE(NULLIF(avg_days_between_orders, 0), 60) * 1.2) THEN 'MEDIUM'
    ELSE 'LOW'
  END AS churn_risk,
  COALESCE(recency_days > 120, FALSE) AS is_dormant,
  CASE
    WHEN recency_days IS NULL THEN NULL
    WHEN recency_days <= 30 THEN 5
    WHEN recency_days <= 60 THEN 4
    WHEN recency_days <= 90 THEN 3
    WHEN recency_days <= 180 THEN 2
    ELSE 1
  END AS r_score,
  CASE
    WHEN recency_days IS NULL THEN 1
    WHEN orders_90d >= 12 THEN 5
    WHEN orders_90d >= 6 THEN 4
    WHEN orders_90d >= 3 THEN 3
    WHEN orders_90d >= 1 THEN 2
    ELSE 1
  END AS f_score,
  CASE
    WHEN recency_days IS NULL THEN 1
    WHEN lifetime_value >= 10000 THEN 5
    WHEN lifetime_value >= 5000 THEN 4
    WHEN lifetime_value >= 2000 THEN 3
    WHEN lifetime_value >= 500 THEN 2
    ELSE 1
  END AS m_score,
  NOW()
FROM assembled
ON CONFLICT (customer_id) DO UPDATE SET
  lifetime_value = EXCLUDED.lifetime_value,
  total_orders = EXCLUDED.total_orders,
  avg_order_value = EXCLUDED.avg_order_value,
  margin_value = EXCLUDED.margin_value,
  orders_30d = EXCLUDED.orders_30d,
  orders_90d = EXCLUDED.orders_90d,
  orders_365d = EXCLUDED.orders_365d,
  avg_days_between_orders = EXCLUDED.avg_days_between_orders,
  last_purchase_date = EXCLUDED.last_purchase_date,
  recency_days = EXCLUDED.recency_days,
  is_active = EXCLUDED.is_active,
  discount_ratio = EXCLUDED.discount_ratio,
  primary_store_id = EXCLUDED.primary_store_id,
  store_loyalty_ratio = EXCLUDED.store_loyalty_ratio,
  online_ratio = EXCLUDED.online_ratio,
  churn_risk = EXCLUDED.churn_risk,
  is_dormant = EXCLUDED.is_dormant,
  r_score = EXCLUDED.r_score,
  f_score = EXCLUDED.f_score,
  m_score = EXCLUDED.m_score,
  updated_at = EXCLUDED.updated_at
`;

const FEATURES_SQL = `
WITH completed_tx AS (
  SELECT *
  FROM app.customer_transaction_fact
  WHERE status = 'completed'
),
completed_summary AS (
  SELECT
    customer_id,
    ROUND(COALESCE(SUM(net_amount), 0)::numeric, 2) AS net_revenue_lifetime,
    ROUND(COALESCE(SUM(total_amount), 0)::numeric, 2) AS gross_revenue_lifetime
  FROM completed_tx
  GROUP BY customer_id
),
purchase_tx AS (
  SELECT *
  FROM completed_tx
  WHERE transaction_kind = 'purchase'
),
return_tx AS (
  SELECT *
  FROM completed_tx
  WHERE transaction_kind = 'return'
),
transaction_customer_ids AS (
  SELECT DISTINCT customer_id
  FROM completed_tx
),
item_flags AS (
  SELECT
    transaction_id,
    BOOL_OR(is_markdown) AS has_markdown
  FROM app.customer_transaction_item
  GROUP BY transaction_id
),
purchase_tx_with_flags AS (
  SELECT
    pt.*,
    COALESCE(f.has_markdown, FALSE) AS has_markdown
  FROM purchase_tx pt
  LEFT JOIN item_flags f
    ON f.transaction_id = pt.id
),
purchase_summary AS (
  SELECT
    customer_id,
    MIN(purchased_at) AS first_purchase_at,
    MAX(purchased_at) AS last_purchase_at,
    COUNT(*)::int AS order_count_lifetime,
    COUNT(*) FILTER (WHERE purchased_at >= NOW() - INTERVAL '7 days')::int AS order_count_7d,
    COUNT(*) FILTER (WHERE purchased_at >= NOW() - INTERVAL '30 days')::int AS order_count_30d,
    COUNT(*) FILTER (WHERE purchased_at >= NOW() - INTERVAL '90 days')::int AS order_count_90d,
    COUNT(*) FILTER (WHERE purchased_at >= NOW() - INTERVAL '180 days')::int AS order_count_180d,
    COUNT(*) FILTER (WHERE purchased_at >= NOW() - INTERVAL '365 days')::int AS order_count_365d,
    ROUND(COALESCE(SUM(net_amount), 0)::numeric, 2) AS purchase_net_revenue_lifetime,
    ROUND(COALESCE(SUM(net_amount) FILTER (WHERE purchased_at >= NOW() - INTERVAL '30 days'), 0)::numeric, 2) AS net_revenue_30d,
    ROUND(COALESCE(SUM(net_amount) FILTER (WHERE purchased_at >= NOW() - INTERVAL '90 days'), 0)::numeric, 2) AS net_revenue_90d,
    ROUND(COALESCE(SUM(net_amount) FILTER (WHERE purchased_at >= NOW() - INTERVAL '180 days'), 0)::numeric, 2) AS net_revenue_180d,
    ROUND(COALESCE(SUM(net_amount) FILTER (WHERE purchased_at >= NOW() - INTERVAL '365 days'), 0)::numeric, 2) AS net_revenue_365d,
    ROUND(COALESCE(SUM(total_amount) FILTER (WHERE purchased_at >= NOW() - INTERVAL '365 days'), 0)::numeric, 2) AS gross_revenue_365d,
    ROUND(COALESCE(SUM(discount_amount) FILTER (WHERE purchased_at >= NOW() - INTERVAL '365 days'), 0)::numeric, 2) AS discount_amount_365d,
    ROUND(COALESCE(SUM(net_amount - cost_amount), 0)::numeric, 2) AS gross_margin_lifetime,
    ROUND(COALESCE(SUM(net_amount - cost_amount) FILTER (WHERE purchased_at >= NOW() - INTERVAL '90 days'), 0)::numeric, 2) AS gross_margin_90d,
    ROUND(COALESCE(SUM(net_amount - cost_amount) FILTER (WHERE purchased_at >= NOW() - INTERVAL '365 days'), 0)::numeric, 2) AS gross_margin_365d,
    COUNT(*) FILTER (
      WHERE purchased_at >= NOW() - INTERVAL '365 days'
        AND (coupon_code IS NOT NULL OR promotion_code IS NOT NULL)
    )::int AS coupon_redemption_count_365d,
    COUNT(*) FILTER (
      WHERE purchased_at >= NOW() - INTERVAL '365 days'
        AND (
          discount_amount > 0
          OR coupon_code IS NOT NULL
          OR promotion_code IS NOT NULL
          OR has_markdown
        )
    )::int AS promo_purchase_count_365d,
    COUNT(*) FILTER (
      WHERE purchased_at >= NOW() - INTERVAL '365 days'
        AND discount_amount <= 0
        AND coupon_code IS NULL
        AND promotion_code IS NULL
        AND NOT has_markdown
    )::int AS full_price_purchase_count_365d,
    COUNT(*) FILTER (
      WHERE channel = 'online'
        AND purchased_at >= NOW() - INTERVAL '365 days'
    )::int AS web_order_count_365d,
    COUNT(*) FILTER (
      WHERE channel = 'store'
        AND purchased_at >= NOW() - INTERVAL '365 days'
    )::int AS store_order_count_365d
  FROM purchase_tx_with_flags
  GROUP BY customer_id
),
purchase_gaps AS (
  SELECT
    customer_id,
    GREATEST(
      EXTRACT(
        EPOCH FROM (
          purchased_at - LAG(purchased_at) OVER (
            PARTITION BY customer_id
            ORDER BY purchased_at
          )
        )
      ),
      0
    ) / 86400.0 AS gap_days
  FROM purchase_tx
),
purchase_store_counts_365 AS (
  SELECT
    customer_id,
    store_id,
    COUNT(*)::int AS purchase_count_365d,
    ROUND(COALESCE(SUM(net_amount), 0)::numeric, 2) AS net_revenue_365d,
    MAX(purchased_at) AS last_purchase_at
  FROM purchase_tx
  WHERE purchased_at >= NOW() - INTERVAL '365 days'
    AND store_id IS NOT NULL
  GROUP BY customer_id, store_id
),
primary_store AS (
  SELECT DISTINCT ON (customer_id)
    customer_id,
    store_id AS preferred_store_id,
    purchase_count_365d AS primary_store_purchase_count_365d
  FROM purchase_store_counts_365
  ORDER BY
    customer_id,
    purchase_count_365d DESC,
    net_revenue_365d DESC,
    last_purchase_at DESC,
    store_id ASC
),
purchase_item_rows AS (
  SELECT
    pt.customer_id,
    pt.purchased_at,
    i.quantity,
    i.net_amount,
    i.is_markdown,
    i.is_return,
    i.size_type,
    i.size_value
  FROM purchase_tx pt
  JOIN app.customer_transaction_item i
    ON i.transaction_id = pt.id
  WHERE COALESCE(i.is_return, FALSE) = FALSE
),
purchase_item_summary AS (
  SELECT
    customer_id,
    COALESCE(SUM(GREATEST(quantity, 0)), 0)::int AS item_count_lifetime,
    COALESCE(SUM(GREATEST(quantity, 0)) FILTER (WHERE purchased_at >= NOW() - INTERVAL '365 days'), 0)::int AS item_count_365d,
    ROUND(
      COALESCE(SUM(net_amount) FILTER (WHERE purchased_at >= NOW() - INTERVAL '365 days' AND is_markdown), 0)::numeric,
      2
    ) AS markdown_revenue_365d
  FROM purchase_item_rows
  GROUP BY customer_id
),
return_item_rows AS (
  SELECT
    rt.customer_id,
    rt.purchased_at,
    i.quantity
  FROM return_tx rt
  JOIN app.customer_transaction_item i
    ON i.transaction_id = rt.id
  WHERE COALESCE(i.is_return, FALSE) = TRUE
     OR i.quantity < 0
),
return_item_summary AS (
  SELECT
    customer_id,
    COALESCE(SUM(ABS(quantity)) FILTER (WHERE purchased_at >= NOW() - INTERVAL '365 days'), 0)::int AS returned_item_count_365d
  FROM return_item_rows
  GROUP BY customer_id
),
return_summary AS (
  SELECT
    customer_id,
    COUNT(*)::int AS return_count_lifetime,
    COUNT(*) FILTER (WHERE purchased_at >= NOW() - INTERVAL '365 days')::int AS return_count_365d
  FROM return_tx
  GROUP BY customer_id
),
email_opt_in AS (
  SELECT
    customer_id,
    BOOL_OR(accepts_marketing) AS email_opt_in
  FROM app.customer_contact
  WHERE contact_type = 'email'
  GROUP BY customer_id
)
INSERT INTO app.customer_features_current (
  customer_id,
  first_purchase_at,
  last_purchase_at,
  days_since_first_purchase,
  days_since_last_purchase,
  order_count_lifetime,
  order_count_7d,
  order_count_30d,
  order_count_90d,
  order_count_180d,
  order_count_365d,
  item_count_lifetime,
  item_count_365d,
  net_revenue_lifetime,
  net_revenue_30d,
  net_revenue_90d,
  net_revenue_180d,
  net_revenue_365d,
  gross_revenue_lifetime,
  gross_revenue_365d,
  gross_margin_lifetime,
  gross_margin_90d,
  gross_margin_365d,
  avg_order_value_lifetime,
  avg_order_value_365d,
  avg_items_per_order_365d,
  return_count_lifetime,
  return_count_365d,
  returned_item_count_365d,
  return_rate_365d,
  markdown_revenue_share_365d,
  average_discount_percent_365d,
  coupon_redemption_count_365d,
  coupon_redemption_rate_365d,
  full_price_purchase_count_365d,
  promo_purchase_count_365d,
  preferred_store_id,
  preferred_channel,
  primary_store_purchase_count_365d,
  web_order_count_365d,
  store_order_count_365d,
  email_opt_in,
  sms_opt_in,
  push_opt_in,
  loyalty_tier,
  loyalty_points_balance,
  employee_flag,
  fraud_risk_flag,
  abuse_risk_flag,
  updated_at
)
SELECT
  t.customer_id,
  p.first_purchase_at,
  p.last_purchase_at,
  CASE
    WHEN p.first_purchase_at IS NULL THEN NULL
    ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - p.first_purchase_at)) / 86400))::int
  END AS days_since_first_purchase,
  CASE
    WHEN p.last_purchase_at IS NULL THEN NULL
    ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - p.last_purchase_at)) / 86400))::int
  END AS days_since_last_purchase,
  COALESCE(p.order_count_lifetime, 0),
  COALESCE(p.order_count_7d, 0),
  COALESCE(p.order_count_30d, 0),
  COALESCE(p.order_count_90d, 0),
  COALESCE(p.order_count_180d, 0),
  COALESCE(p.order_count_365d, 0),
  COALESCE(i.item_count_lifetime, 0),
  COALESCE(i.item_count_365d, 0),
  COALESCE(c.net_revenue_lifetime, 0)::numeric(14, 2) AS net_revenue_lifetime,
  COALESCE(p.net_revenue_30d, 0)::numeric(14, 2),
  COALESCE(p.net_revenue_90d, 0)::numeric(14, 2),
  COALESCE(p.net_revenue_180d, 0)::numeric(14, 2),
  COALESCE(p.net_revenue_365d, 0)::numeric(14, 2),
  COALESCE(c.gross_revenue_lifetime, 0)::numeric(14, 2) AS gross_revenue_lifetime,
  COALESCE(p.gross_revenue_365d, 0)::numeric(14, 2),
  COALESCE(p.gross_margin_lifetime, 0)::numeric(14, 2),
  COALESCE(p.gross_margin_90d, 0)::numeric(14, 2),
  COALESCE(p.gross_margin_365d, 0)::numeric(14, 2),
  CASE
    WHEN COALESCE(p.order_count_lifetime, 0) > 0
      THEN ROUND((COALESCE(c.net_revenue_lifetime, 0) / p.order_count_lifetime)::numeric, 2)
    ELSE NULL
  END AS avg_order_value_lifetime,
  CASE
    WHEN COALESCE(p.order_count_365d, 0) > 0
      THEN ROUND((COALESCE(p.net_revenue_365d, 0) / p.order_count_365d)::numeric, 2)
    ELSE NULL
  END AS avg_order_value_365d,
  CASE
    WHEN COALESCE(p.order_count_365d, 0) > 0
      THEN ROUND((COALESCE(i.item_count_365d, 0)::numeric / p.order_count_365d)::numeric, 2)
    ELSE NULL
  END AS avg_items_per_order_365d,
  COALESCE(r.return_count_lifetime, 0),
  COALESCE(r.return_count_365d, 0),
  COALESCE(ri.returned_item_count_365d, 0),
  CASE
    WHEN COALESCE(i.item_count_365d, 0) > 0 THEN LEAST(
      1::numeric,
      GREATEST(
        0::numeric,
        ROUND((COALESCE(ri.returned_item_count_365d, 0)::numeric / i.item_count_365d)::numeric, 4)
      )
    )
    WHEN COALESCE(p.order_count_365d, 0) > 0 THEN LEAST(
      1::numeric,
      GREATEST(
        0::numeric,
        ROUND((COALESCE(r.return_count_365d, 0)::numeric / p.order_count_365d)::numeric, 4)
      )
    )
    ELSE 0::numeric
  END AS return_rate_365d,
  CASE
    WHEN COALESCE(p.net_revenue_365d, 0) > 0 THEN LEAST(
      1::numeric,
      GREATEST(
        0::numeric,
        ROUND((COALESCE(i.markdown_revenue_365d, 0) / p.net_revenue_365d)::numeric, 4)
      )
    )
    ELSE 0::numeric
  END AS markdown_revenue_share_365d,
  CASE
    WHEN COALESCE(p.gross_revenue_365d, 0) > 0 THEN LEAST(
      1::numeric,
      GREATEST(
        0::numeric,
        ROUND((COALESCE(p.discount_amount_365d, 0) / p.gross_revenue_365d)::numeric, 4)
      )
    )
    ELSE 0::numeric
  END AS average_discount_percent_365d,
  COALESCE(p.coupon_redemption_count_365d, 0),
  CASE
    WHEN COALESCE(p.order_count_365d, 0) > 0 THEN LEAST(
      1::numeric,
      GREATEST(
        0::numeric,
        ROUND((COALESCE(p.coupon_redemption_count_365d, 0)::numeric / p.order_count_365d)::numeric, 4)
      )
    )
    ELSE 0::numeric
  END AS coupon_redemption_rate_365d,
  COALESCE(p.full_price_purchase_count_365d, 0),
  COALESCE(p.promo_purchase_count_365d, 0),
  ps.preferred_store_id,
  CASE
    WHEN COALESCE(p.web_order_count_365d, 0) > 0
      AND COALESCE(p.store_order_count_365d, 0) > 0
      THEN 'omnichannel'
    WHEN COALESCE(p.web_order_count_365d, 0) > 0
      THEN 'web'
    WHEN COALESCE(p.store_order_count_365d, 0) > 0
      THEN 'store'
    ELSE NULL
  END AS preferred_channel,
  COALESCE(ps.primary_store_purchase_count_365d, 0),
  COALESCE(p.web_order_count_365d, 0),
  COALESCE(p.store_order_count_365d, 0),
  COALESCE(e.email_opt_in, FALSE),
  FALSE,
  FALSE,
  NULL,
  NULL,
  FALSE,
  FALSE,
  FALSE,
  NOW()
FROM transaction_customer_ids t
LEFT JOIN completed_summary c
  ON c.customer_id = t.customer_id
LEFT JOIN purchase_summary p
  ON p.customer_id = t.customer_id
LEFT JOIN purchase_item_summary i
  ON i.customer_id = t.customer_id
LEFT JOIN return_summary r
  ON r.customer_id = t.customer_id
LEFT JOIN return_item_summary ri
  ON ri.customer_id = t.customer_id
LEFT JOIN primary_store ps
  ON ps.customer_id = t.customer_id
LEFT JOIN email_opt_in e
  ON e.customer_id = t.customer_id
ON CONFLICT (customer_id) DO UPDATE SET
  first_purchase_at = EXCLUDED.first_purchase_at,
  last_purchase_at = EXCLUDED.last_purchase_at,
  days_since_first_purchase = EXCLUDED.days_since_first_purchase,
  days_since_last_purchase = EXCLUDED.days_since_last_purchase,
  order_count_lifetime = EXCLUDED.order_count_lifetime,
  order_count_7d = EXCLUDED.order_count_7d,
  order_count_30d = EXCLUDED.order_count_30d,
  order_count_90d = EXCLUDED.order_count_90d,
  order_count_180d = EXCLUDED.order_count_180d,
  order_count_365d = EXCLUDED.order_count_365d,
  item_count_lifetime = EXCLUDED.item_count_lifetime,
  item_count_365d = EXCLUDED.item_count_365d,
  net_revenue_lifetime = EXCLUDED.net_revenue_lifetime,
  net_revenue_30d = EXCLUDED.net_revenue_30d,
  net_revenue_90d = EXCLUDED.net_revenue_90d,
  net_revenue_180d = EXCLUDED.net_revenue_180d,
  net_revenue_365d = EXCLUDED.net_revenue_365d,
  gross_revenue_lifetime = EXCLUDED.gross_revenue_lifetime,
  gross_revenue_365d = EXCLUDED.gross_revenue_365d,
  gross_margin_lifetime = EXCLUDED.gross_margin_lifetime,
  gross_margin_90d = EXCLUDED.gross_margin_90d,
  gross_margin_365d = EXCLUDED.gross_margin_365d,
  avg_order_value_lifetime = EXCLUDED.avg_order_value_lifetime,
  avg_order_value_365d = EXCLUDED.avg_order_value_365d,
  avg_items_per_order_365d = EXCLUDED.avg_items_per_order_365d,
  return_count_lifetime = EXCLUDED.return_count_lifetime,
  return_count_365d = EXCLUDED.return_count_365d,
  returned_item_count_365d = EXCLUDED.returned_item_count_365d,
  return_rate_365d = EXCLUDED.return_rate_365d,
  markdown_revenue_share_365d = EXCLUDED.markdown_revenue_share_365d,
  average_discount_percent_365d = EXCLUDED.average_discount_percent_365d,
  coupon_redemption_count_365d = EXCLUDED.coupon_redemption_count_365d,
  coupon_redemption_rate_365d = EXCLUDED.coupon_redemption_rate_365d,
  full_price_purchase_count_365d = EXCLUDED.full_price_purchase_count_365d,
  promo_purchase_count_365d = EXCLUDED.promo_purchase_count_365d,
  preferred_store_id = EXCLUDED.preferred_store_id,
  preferred_channel = EXCLUDED.preferred_channel,
  primary_store_purchase_count_365d = EXCLUDED.primary_store_purchase_count_365d,
  web_order_count_365d = EXCLUDED.web_order_count_365d,
  store_order_count_365d = EXCLUDED.store_order_count_365d,
  email_opt_in = EXCLUDED.email_opt_in,
  sms_opt_in = EXCLUDED.sms_opt_in,
  push_opt_in = EXCLUDED.push_opt_in,
  loyalty_tier = EXCLUDED.loyalty_tier,
  loyalty_points_balance = EXCLUDED.loyalty_points_balance,
  employee_flag = EXCLUDED.employee_flag,
  fraud_risk_flag = EXCLUDED.fraud_risk_flag,
  abuse_risk_flag = EXCLUDED.abuse_risk_flag,
  updated_at = EXCLUDED.updated_at
`;

const DELETE_CATEGORY_FEATURES_SQL = `
DELETE FROM app.customer_category_features
WHERE customer_id IN (
  SELECT DISTINCT customer_id
  FROM app.customer_transaction_fact
);
`;

const DELETE_BRAND_FEATURES_SQL = `
DELETE FROM app.customer_brand_features
WHERE customer_id IN (
  SELECT DISTINCT customer_id
  FROM app.customer_transaction_fact
);
`;

const DELETE_SIZE_PROFILES_SQL = `
DELETE FROM app.customer_size_profiles
WHERE customer_id IN (
  SELECT DISTINCT customer_id
  FROM app.customer_transaction_fact
);
`;

const INSERT_SIZE_PROFILES_SQL = `
WITH purchase_tx AS (
  SELECT id, customer_id, purchased_at
  FROM app.customer_transaction_fact
  WHERE status = 'completed'
    AND transaction_kind = 'purchase'
),
size_rows AS (
  SELECT
    pt.customer_id,
    i.size_type,
    i.size_value,
    pt.purchased_at,
    GREATEST(i.quantity, 0) AS quantity
  FROM purchase_tx pt
  JOIN app.customer_transaction_item i
    ON i.transaction_id = pt.id
  WHERE COALESCE(i.is_return, FALSE) = FALSE
    AND i.size_type IS NOT NULL
    AND i.size_value IS NOT NULL
),
size_grouped AS (
  SELECT
    customer_id,
    size_type,
    size_value,
    COALESCE(SUM(quantity), 0)::int AS purchase_count,
    MAX(purchased_at) AS last_seen_at
  FROM size_rows
  GROUP BY customer_id, size_type, size_value
),
size_type_totals AS (
  SELECT
    customer_id,
    size_type,
    COALESCE(SUM(purchase_count), 0)::int AS total_for_type
  FROM size_grouped
  GROUP BY customer_id, size_type
)
INSERT INTO app.customer_size_profiles (
  customer_id,
  size_type,
  size_value,
  confidence_score,
  purchase_count,
  last_seen_at,
  updated_at
)
SELECT
  g.customer_id,
  g.size_type,
  g.size_value,
  CASE
    WHEN COALESCE(t.total_for_type, 0) <= 0 THEN 0::numeric
    ELSE LEAST(
      1::numeric,
      ROUND((g.purchase_count::numeric / t.total_for_type)::numeric, 4)
      + CASE
          WHEN g.last_seen_at >= NOW() - INTERVAL '180 days' THEN 0.1::numeric
          ELSE 0::numeric
        END
    )
  END AS confidence_score,
  g.purchase_count,
  g.last_seen_at,
  NOW()
FROM size_grouped g
JOIN size_type_totals t
  ON t.customer_id = g.customer_id
 AND t.size_type = g.size_type
WHERE g.purchase_count > 0
`;

type BackfillSummaryRow = {
  transactioncustomers: bigint | number;
  facts: bigint | number;
  items: bigint | number;
  metrics: bigint | number;
  features: bigint | number;
  sizeprofiles: bigint | number;
};

export async function backfillTransactionCustomerMetrics(): Promise<{
  transactionCustomers: number;
  facts: number;
  items: number;
  metrics: number;
  features: number;
  sizeProfiles: number;
}> {
  console.info('[customer-kpi] Backfilling metrics/features from transaction facts');

  console.info('[customer-kpi] Analyzing transaction fact tables');
  await prisma.$executeRawUnsafe('ANALYZE app.customer_transaction_fact');
  await prisma.$executeRawUnsafe('ANALYZE app.customer_transaction_item');

  console.info('[customer-kpi] Refreshing customer_metrics from transaction facts');
  await prisma.$executeRawUnsafe(METRICS_SQL);
  console.info('[customer-kpi] Refreshing customer_features_current from transaction facts');
  await prisma.$executeRawUnsafe(FEATURES_SQL);
  console.info('[customer-kpi] Clearing derived category/brand/size slices for transaction-backed customers');
  await prisma.$executeRawUnsafe(DELETE_CATEGORY_FEATURES_SQL);
  await prisma.$executeRawUnsafe(DELETE_BRAND_FEATURES_SQL);
  await prisma.$executeRawUnsafe(DELETE_SIZE_PROFILES_SQL);
  console.info('[customer-kpi] Rebuilding customer_size_profiles from transaction facts');
  await prisma.$executeRawUnsafe(INSERT_SIZE_PROFILES_SQL);

  const [summary] = await prisma.$queryRawUnsafe<BackfillSummaryRow[]>(`
    WITH transaction_customers AS (
      SELECT DISTINCT customer_id
      FROM app.customer_transaction_fact
    )
    SELECT
      (SELECT COUNT(*) FROM transaction_customers) AS transactionCustomers,
      (SELECT COUNT(*) FROM app.customer_transaction_fact) AS facts,
      (SELECT COUNT(*) FROM app.customer_transaction_item) AS items,
      (SELECT COUNT(*) FROM app.customer_metrics cm JOIN transaction_customers tc ON tc.customer_id = cm.customer_id) AS metrics,
      (SELECT COUNT(*) FROM app.customer_features_current cf JOIN transaction_customers tc ON tc.customer_id = cf.customer_id) AS features,
      (SELECT COUNT(*) FROM app.customer_size_profiles sp JOIN transaction_customers tc ON tc.customer_id = sp.customer_id) AS sizeProfiles
  `);

  return {
    transactionCustomers: Number(summary?.transactioncustomers ?? 0),
    facts: Number(summary?.facts ?? 0),
    items: Number(summary?.items ?? 0),
    metrics: Number(summary?.metrics ?? 0),
    features: Number(summary?.features ?? 0),
    sizeProfiles: Number(summary?.sizeprofiles ?? 0),
  };
}

async function main(): Promise<void> {
  const summary = await backfillTransactionCustomerMetrics();
  console.info('[customer-kpi] Transaction backfill complete', summary);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('[customer-kpi] Transaction backfill failed', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
