# Customer KPI Module

## Full Implementation Plan

- Target stack: Node.js + TypeScript + PostgreSQL
- Scope: Backend + Database + API
- Frontend: Out of scope

---

## 1. Purpose

Implement a **Customer KPI system** for a retail chain with physical stores and a webstore that:

- Aggregates customer transaction behavior
- Computes KPIs for value, frequency, recency, behavior, and risk
- Stores results in a fast-access table
- Powers future segmentation and promotion modules

---

## 2. Core Principles

1. KPIs are derived strictly from **transactions**.
2. KPIs must be **cached** for fast access.
3. The system must support **incremental updates** and **full recompute**.
4. All KPIs must be **time-window aware**.
5. No CRM-style pipeline logic is included. This is retail-only.

---

## 3. Database Design

### 3.1 Required Source Tables (Assumed Existing)

```sql
transactions (
  id UUID PRIMARY KEY,
  customer_id UUID,
  store_id UUID,
  channel TEXT, -- 'store' | 'online'
  total_amount NUMERIC,
  net_amount NUMERIC,
  cost_amount NUMERIC,
  discount_amount NUMERIC,
  created_at TIMESTAMP
);

transaction_items (
  id UUID PRIMARY KEY,
  transaction_id UUID,
  sku_id UUID,
  category_id UUID,
  quantity INT,
  net_amount NUMERIC
);
```

### 3.2 Main KPI Table

```sql
CREATE TABLE customer_metrics (
  customer_id UUID PRIMARY KEY,

  -- VALUE
  lifetime_value NUMERIC DEFAULT 0,
  total_orders INT DEFAULT 0,
  avg_order_value NUMERIC DEFAULT 0,
  margin_value NUMERIC DEFAULT 0,

  -- FREQUENCY
  orders_30d INT DEFAULT 0,
  orders_90d INT DEFAULT 0,
  orders_365d INT DEFAULT 0,
  avg_days_between_orders NUMERIC,

  -- RECENCY
  last_purchase_date TIMESTAMP,
  recency_days INT,
  is_active BOOLEAN,

  -- BEHAVIOR
  discount_ratio NUMERIC,
  primary_store_id UUID,
  store_loyalty_ratio NUMERIC,
  online_ratio NUMERIC,

  -- RISK
  churn_risk TEXT,
  is_dormant BOOLEAN,

  -- RFM
  r_score INT,
  f_score INT,
  m_score INT,

  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3.3 Optional Daily Snapshot Table

```sql
CREATE TABLE customer_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID,
  snapshot_date DATE,

  lifetime_value NUMERIC,
  total_orders INT,
  recency_days INT,
  orders_90d INT,

  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 4. KPI Computation Logic

### 4.1 Value

```text
lifetime_value = SUM(net_amount)
total_orders = COUNT(transactions)
avg_order_value = lifetime_value / total_orders
margin_value = SUM(net_amount - cost_amount)
```

### 4.2 Frequency

```text
orders_30d = COUNT where created_at >= NOW() - INTERVAL '30 days'
orders_90d = COUNT where created_at >= NOW() - INTERVAL '90 days'
orders_365d = COUNT where created_at >= NOW() - INTERVAL '365 days'
```

`avg_days_between_orders`:

1. Order transactions by `created_at`.
2. Compute the difference between consecutive rows.
3. Take the average.

### 4.3 Recency

```text
last_purchase_date = MAX(created_at)
recency_days = DATE_PART('day', NOW() - last_purchase_date)
is_active = recency_days <= 60
```

### 4.4 Behavior

#### Discount Sensitivity

```text
discount_ratio = SUM(discount_amount) / NULLIF(SUM(total_amount), 0)
```

#### Store Loyalty

```text
primary_store_id = store with MAX(order count)
store_loyalty_ratio = orders_in_primary_store / total_orders
```

#### Channel Split

```text
online_ratio = online_orders / total_orders
```

### 4.5 Risk

```sql
expected_cycle = avg_days_between_orders

CASE
  WHEN recency_days > expected_cycle * 2 THEN 'HIGH'
  WHEN recency_days > expected_cycle * 1.2 THEN 'MEDIUM'
  ELSE 'LOW'
END AS churn_risk
```

```text
is_dormant = recency_days > 120
```

### 4.6 RFM Scoring

Score each dimension from `1` to `5`:

- Recency: lower `recency_days` yields a higher score
- Frequency: higher `orders_90d` yields a higher score
- Monetary: higher `lifetime_value` yields a higher score

Store results in:

- `r_score`
- `f_score`
- `m_score`

---

## 5. Backend Services

### 5.1 Folder Structure

```text
services/
  customer-kpi/
    computeFullMetrics.ts
    computeIncremental.ts
    computeRFM.ts
    computeBehavior.ts
    computeRisk.ts
```

### 5.2 Full Recompute Service

Function: `computeFullMetrics(customerId: string)`

Steps:

1. Fetch all transactions for the customer.
2. Aggregate totals for value, orders, and margin.
3. Compute rolling windows for 30, 90, and 365 days.
4. Compute recency.
5. Compute behavior metrics.
6. Compute risk.
7. Compute RFM scores.
8. `UPSERT` into `customer_metrics`.

### 5.3 Incremental Update Service

Function: `computeIncremental(customerId: string, transaction)`

Steps:

1. Update totals:
   - `lifetime_value += net_amount`
   - `total_orders += 1`
2. Update `last_purchase_date`.
3. Recalculate:
   - `avg_order_value`
   - `recency_days`
4. Update rolling counters if the transaction falls within the relevant window.
5. Recompute:
   - `churn_risk`
   - `RFM` scores
6. Update the row in `customer_metrics`.

---

## 6. API Routes

### 6.1 Get Customer KPIs

`GET /customers/:id/metrics`

Response:

```json
{
  "customer_id": "uuid",
  "lifetime_value": 12500,
  "total_orders": 22,
  "avg_order_value": 568,
  "recency_days": 14,
  "orders_90d": 5,
  "churn_risk": "LOW",
  "r_score": 5,
  "f_score": 4,
  "m_score": 5
}
```

### 6.2 Recompute KPIs for a Single Customer

`POST /customers/:id/recompute-metrics`

### 6.3 Bulk Recompute

`POST /customers/recompute-metrics`

Request body:

```json
{
  "batch_size": 1000
}
```

### 6.4 KPI Summary Dashboard

`GET /customers/metrics/summary`

Returns aggregated statistics:

- Total customers
- Active customers
- Dormant customers
- Average lifetime value
- Churn distribution

---

## 7. Jobs and Workers

### 7.1 Nightly Job

Function:

```text
recomputeAllCustomerMetrics()
```

Responsibilities:

- Recalculate all KPIs from scratch
- Ensure consistency across the cache table

### 7.2 Transaction Hook

Trigger on new transaction:

```text
onTransactionCreated(customerId) -> computeIncremental(customerId)
```

---

## 8. Performance Strategy

Create indexes:

```sql
CREATE INDEX idx_transactions_customer ON transactions(customer_id);
CREATE INDEX idx_transactions_date ON transactions(created_at);
```

Guidelines:

- Use batching for recomputes
- Avoid heavy joins in API routes
- Cache results in `customer_metrics`

---

## 9. Validation Rules

- Ignore transactions with `NULL customer_id`
- Exclude cancelled or refunded transactions
- Use `NULLIF` to prevent division by zero
- Clamp ratios between `0` and `1`

---

## 10. Deliverables

The implementation must include:

- SQL migrations for tables and indexes
- KPI computation services
- API endpoints
- Worker jobs
- Unit tests covering:
  - KPI accuracy
  - Edge cases such as `0` orders and `1` order
- Logging for:
  - Recompute duration
  - Errors

---

## 11. Completion Criteria

The system is complete when:

- KPIs exist for all customers
- Incremental updates trigger on new transactions
- Nightly recompute works without failure
- API responses are correct and fast
- The system supports `100k+` customers
