import { prisma } from '../../src/db/prisma';

const METRICS_SQL = `
WITH legacy_source AS (
  SELECT
    c.id AS customer_id,
    cssl.date_last_purchase,
    GREATEST(COALESCE(cssl.qty_sales_03, cssl.qty_sales_02, cssl.qty_sales_01, 0), 0) AS total_orders,
    GREATEST(COALESCE(cssl.qty_sales_02, 0), 0) AS orders_365d,
    GREATEST(COALESCE(cssl.dollar_sales_03, cssl.dollar_sales_02, cssl.dollar_sales_01, 0), 0)::numeric(14,2) AS lifetime_value,
    CASE
      WHEN cssl.date_last_purchase IS NULL THEN NULL
      ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - cssl.date_last_purchase)) / 86400))::int
    END AS recency_days
  FROM app.customer c
  JOIN app.customer_sales_summary_legacy cssl
    ON cssl.customer_id = c.id
  WHERE NOT EXISTS (
    SELECT 1
      FROM app.customer_transaction_fact ctf
     WHERE ctf.customer_id = c.id
  )
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
  CASE WHEN total_orders > 0 THEN ROUND(lifetime_value / total_orders, 2) ELSE 0 END,
  0,
  0,
  orders_365d,
  orders_365d,
  NULL,
  date_last_purchase,
  recency_days,
  COALESCE(recency_days <= 60, FALSE),
  NULL,
  NULL,
  NULL,
  NULL,
  CASE
    WHEN recency_days IS NULL THEN NULL
    WHEN recency_days > 120 THEN 'HIGH'
    WHEN recency_days > 72 THEN 'MEDIUM'
    ELSE 'LOW'
  END,
  COALESCE(recency_days > 120, FALSE),
  CASE
    WHEN recency_days IS NULL THEN NULL
    WHEN recency_days <= 30 THEN 5
    WHEN recency_days <= 60 THEN 4
    WHEN recency_days <= 90 THEN 3
    WHEN recency_days <= 180 THEN 2
    ELSE 1
  END,
  CASE
    WHEN orders_365d >= 12 THEN 5
    WHEN orders_365d >= 6 THEN 4
    WHEN orders_365d >= 3 THEN 3
    WHEN orders_365d >= 1 THEN 2
    ELSE 1
  END,
  CASE
    WHEN lifetime_value >= 10000 THEN 5
    WHEN lifetime_value >= 5000 THEN 4
    WHEN lifetime_value >= 2000 THEN 3
    WHEN lifetime_value >= 500 THEN 2
    ELSE 1
  END,
  NOW()
FROM legacy_source
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
  updated_at = NOW()
`;

const FEATURES_SQL = `
WITH legacy_source AS (
  SELECT
    c.id AS customer_id,
    cssl.date_last_purchase,
    GREATEST(COALESCE(cssl.qty_sales_03, cssl.qty_sales_02, cssl.qty_sales_01, 0), 0) AS total_orders,
    GREATEST(COALESCE(cssl.qty_sales_02, 0), 0) AS orders_365d,
    GREATEST(COALESCE(cssl.dollar_sales_03, cssl.dollar_sales_02, cssl.dollar_sales_01, 0), 0)::numeric(14,2) AS lifetime_value,
    GREATEST(COALESCE(cssl.dollar_sales_02, 0), 0)::numeric(14,2) AS revenue_365d,
    CASE
      WHEN cssl.date_last_purchase IS NULL THEN NULL
      ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - cssl.date_last_purchase)) / 86400))::int
    END AS recency_days,
    EXISTS (
      SELECT 1
        FROM app.customer_contact cc
       WHERE cc.customer_id = c.id
         AND cc.contact_type = 'email'
         AND cc.accepts_marketing = TRUE
    ) AS email_opt_in
  FROM app.customer c
  JOIN app.customer_sales_summary_legacy cssl
    ON cssl.customer_id = c.id
  WHERE NOT EXISTS (
    SELECT 1
      FROM app.customer_transaction_fact ctf
     WHERE ctf.customer_id = c.id
  )
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
  customer_id,
  NULL,
  date_last_purchase,
  NULL,
  recency_days,
  total_orders,
  0,
  0,
  orders_365d,
  orders_365d,
  orders_365d,
  0,
  0,
  lifetime_value,
  0,
  0,
  0,
  revenue_365d,
  lifetime_value,
  revenue_365d,
  0,
  0,
  0,
  CASE WHEN total_orders > 0 THEN ROUND(lifetime_value / total_orders, 2) ELSE NULL END,
  CASE WHEN orders_365d > 0 THEN ROUND(revenue_365d / orders_365d, 2) ELSE NULL END,
  NULL,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  NULL,
  NULL,
  0,
  0,
  0,
  email_opt_in,
  FALSE,
  FALSE,
  NULL,
  NULL,
  FALSE,
  FALSE,
  FALSE,
  NOW()
FROM legacy_source
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
  updated_at = NOW()
`;

async function main(): Promise<void> {
  console.info('[customer-kpi] Backfilling metrics/features from legacy sales summary');

  const before = await prisma.$transaction(async (tx) => {
    const [metrics, features] = await Promise.all([
      tx.customerMetrics.count({
        where: {
          OR: [{ totalOrders: { gt: 0 } }, { lifetimeValue: { gt: 0 } }],
        },
      }),
      tx.customerFeatureCurrent.count({
        where: {
          OR: [{ orderCountLifetime: { gt: 0 } }, { netRevenueLifetime: { gt: 0 } }],
        },
      }),
    ]);
    return { metrics, features };
  });

  await prisma.$executeRawUnsafe(METRICS_SQL);
  await prisma.$executeRawUnsafe(FEATURES_SQL);

  const after = await prisma.$transaction(async (tx) => {
    const [metrics, features] = await Promise.all([
      tx.customerMetrics.count({
        where: {
          OR: [{ totalOrders: { gt: 0 } }, { lifetimeValue: { gt: 0 } }],
        },
      }),
      tx.customerFeatureCurrent.count({
        where: {
          OR: [{ orderCountLifetime: { gt: 0 } }, { netRevenueLifetime: { gt: 0 } }],
        },
      }),
    ]);
    return { metrics, features };
  });

  console.info('[customer-kpi] Legacy backfill complete', {
    metricsBefore: before.metrics,
    metricsAfter: after.metrics,
    featuresBefore: before.features,
    featuresAfter: after.features,
  });
}

main()
  .catch((error) => {
    console.error('[customer-kpi] Legacy backfill failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
