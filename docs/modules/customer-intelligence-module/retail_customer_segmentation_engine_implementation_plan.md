# Retail Customer Segmentation Engine — Complete Implementation Plan

## Agent Build Instructions

You are implementing a **retail customer intelligence segmentation engine** for a physical retail chain with approximately 30 shoe/clothing stores, a central warehouse, POS, webstore, inventory, PIM, purchasing, promotions, and reporting.

The technology stack is:

- **Backend:** Node.js + TypeScript
- **Database:** PostgreSQL
- **Domain:** Shoes and clothing retail
- **Goal:** Build a retail customer intelligence module, not a traditional B2B CRM

This document is the complete build specification. Implement the system as described here. Do not reduce it to a generic CRM. The segmentation engine must connect customer behavior, POS/webstore transactions, promotions, and inventory-aware activation.

The most important principle is:

> Segments describe durable customer intelligence. Activation decides what to do with that intelligence in a specific commercial context.

---

# 1. System Objective

Build a segmentation engine that can:

1. Define customer segments using safe, versioned rules.
2. Evaluate customers into and out of segments.
3. Store current segment membership.
4. Store historical segment membership changes.
5. Explain why a customer belongs to a segment.
6. Score customers inside a segment for prioritization.
7. Preview segment size and sample customers before activation.
8. Support daily batch evaluation.
9. Support single-customer realtime evaluation after customer events.
10. Support hybrid inventory-aware activation through activation filters.
11. Provide APIs for admin UI, POS, webstore, promotions, and reporting.
12. Provide default retail segments for lifecycle, value, RFM, category affinity, promo behavior, channel behavior, and churn risk.

This engine should become the customer intelligence layer between:

```text
POS / Webstore / Returns / Promotions / Inventory / PIM
                    |
                    v
            Customer Event Stream
                    |
                    v
        Customer KPI + Feature Builder
                    |
                    v
        Segmentation Engine
                    |
                    v
        Promotion / Activation Engine
```

---

# 2. Non-Goals

Do not implement this as:

- A generic B2B CRM.
- A free-form SQL audience builder.
- A marketing email sender.
- A loyalty-points engine.
- A coupon engine.
- A campaign attribution system only.
- A static saved-filter system with no history.

The segmentation engine may expose audiences to a promotion/activation engine, but it should not directly send promotions.

---

# 3. Required Capabilities

## 3.1 Segment Definition

A segment is a named, versioned definition of a customer group.

Examples:

- Lapsed VIP Customers
- Running Shoe Buyers
- Discount-Sensitive Apparel Customers
- New Customers Needing Second Purchase
- High-Return-Rate Customers
- Omnichannel Loyalists
- Kids Back-to-School Buyers
- Store 014 Local Sneaker Customers

Each segment must have:

- Stable segment key
- Human-readable name
- Description
- Segment family
- Status
- Evaluation mode
- Priority
- One or more versioned rule definitions

## 3.2 Segment Versioning

Segment definitions must be versioned.

If a user changes the logic for “Lapsed VIP Customers,” create a new segment version. Do not silently overwrite the active version.

Campaigns and activation audiences must store the exact segment version used.

## 3.3 Segment Membership

Store customer membership as facts.

The system must know:

- Which customer belongs to which segment
- Which segment version evaluated the customer
- When the customer entered the segment
- When the customer exited the segment
- Current score
- Reason codes
- Last evaluation time
- Evaluation run that caused the change

## 3.4 Rule Engine

Use a JSON rule AST.

Do not store or accept arbitrary SQL from users.

The rule compiler must:

- Validate metrics against the metric registry
- Validate operators against allowed operators for the metric
- Validate value types
- Validate dimensions
- Compile safe parameterized SQL
- Generate reason codes
- Support preview and evaluation

## 3.5 Evaluation Modes

Support three evaluation modes:

```text
batch
realtime
hybrid
```

### Batch

Used for stable segments such as VIP, lapsed, RFM, discount-sensitive, category affinity, brand affinity, high return rate.

### Realtime

Used after customer events such as purchase, return, customer creation, promotion redemption, opt-in change, or profile update.

### Hybrid

Used when base customer intelligence is stable, but activation eligibility depends on realtime context such as inventory, store, margin, available size, campaign budget, or contact frequency.

## 3.6 Activation Separation

Segment membership is not the same as activation eligibility.

A customer can be in a segment but not eligible for a campaign because:

- No email opt-in
- No SMS opt-in
- Recently contacted
- Active coupon already exists
- No relevant inventory nearby
- Suppression policy excludes them
- Campaign holdout assignment

The segmentation engine should expose membership and audience-building APIs. The activation engine applies channel, inventory, suppression, and offer logic.

---

# 4. Recommended Module Structure

Implement the segmentation engine as a backend module.

Use the existing Node/TypeScript framework if the codebase already has one. If no framework exists, use:

- Fastify for HTTP API
- Zod for request validation
- `pg` or Kysely for PostgreSQL access
- Vitest for tests
- pino for logging

Recommended folder structure:

```text
src/
  modules/
    segmentation/
      api/
        segment.routes.ts
        segment-version.routes.ts
        segment-membership.routes.ts
        audience.routes.ts
      domain/
        segment.types.ts
        rule-ast.types.ts
        metric-registry.types.ts
        membership.types.ts
        evaluation.types.ts
      services/
        segment.service.ts
        segment-version.service.ts
        metric-registry.service.ts
        rule-validator.service.ts
        rule-compiler.service.ts
        segment-preview.service.ts
        segment-evaluation.service.ts
        single-customer-evaluation.service.ts
        segment-membership.service.ts
        audience-builder.service.ts
        default-segment-seed.service.ts
      repositories/
        segment.repository.ts
        segment-version.repository.ts
        metric-registry.repository.ts
        membership.repository.ts
        evaluation-run.repository.ts
        customer-feature.repository.ts
        audience.repository.ts
      jobs/
        evaluate-active-segments.job.ts
        evaluate-segment.job.ts
        evaluate-customer-after-event.job.ts
      migrations/
        001_segmentation_core.sql
        002_metric_registry_seed.sql
        003_default_segments_seed.sql
      tests/
        rule-validator.test.ts
        rule-compiler.test.ts
        segment-preview.test.ts
        segment-evaluation.test.ts
        membership-history.test.ts
        audience-builder.test.ts
```

---

# 5. Database Implementation

Use PostgreSQL. Use `gen_random_uuid()` from `pgcrypto`.

Enable the extension:

```sql
create extension if not exists pgcrypto;
```

---

# 6. Core Database Schema

## 6.1 Customer Features Current

This table contains the most commonly used customer-level metrics for segmentation.

It should be maintained by the KPI/feature builder. If the feature builder does not exist yet, create the table and populate/update it from transaction aggregates where possible.

```sql
create table if not exists customer_features_current (
    customer_id uuid primary key,

    first_purchase_at timestamptz,
    last_purchase_at timestamptz,
    days_since_first_purchase int,
    days_since_last_purchase int,

    order_count_lifetime int not null default 0,
    order_count_7d int not null default 0,
    order_count_30d int not null default 0,
    order_count_90d int not null default 0,
    order_count_180d int not null default 0,
    order_count_365d int not null default 0,

    item_count_lifetime int not null default 0,
    item_count_365d int not null default 0,

    net_revenue_lifetime numeric(14,2) not null default 0,
    net_revenue_30d numeric(14,2) not null default 0,
    net_revenue_90d numeric(14,2) not null default 0,
    net_revenue_180d numeric(14,2) not null default 0,
    net_revenue_365d numeric(14,2) not null default 0,

    gross_revenue_lifetime numeric(14,2) not null default 0,
    gross_revenue_365d numeric(14,2) not null default 0,

    gross_margin_lifetime numeric(14,2) not null default 0,
    gross_margin_90d numeric(14,2) not null default 0,
    gross_margin_365d numeric(14,2) not null default 0,

    avg_order_value_lifetime numeric(14,2),
    avg_order_value_365d numeric(14,2),
    avg_items_per_order_365d numeric(10,2),

    return_count_lifetime int not null default 0,
    return_count_365d int not null default 0,
    returned_item_count_365d int not null default 0,
    return_rate_365d numeric(8,4) not null default 0,

    markdown_revenue_share_365d numeric(8,4) not null default 0,
    average_discount_percent_365d numeric(8,4) not null default 0,
    coupon_redemption_count_365d int not null default 0,
    coupon_redemption_rate_365d numeric(8,4) not null default 0,
    full_price_purchase_count_365d int not null default 0,
    promo_purchase_count_365d int not null default 0,

    preferred_store_id uuid,
    preferred_channel text,
    primary_store_purchase_count_365d int not null default 0,
    web_order_count_365d int not null default 0,
    store_order_count_365d int not null default 0,

    email_opt_in boolean not null default false,
    sms_opt_in boolean not null default false,
    push_opt_in boolean not null default false,

    loyalty_tier text,
    loyalty_points_balance int,

    employee_flag boolean not null default false,
    fraud_risk_flag boolean not null default false,
    abuse_risk_flag boolean not null default false,

    updated_at timestamptz not null default now()
);
```

Indexes:

```sql
create index if not exists idx_customer_features_last_purchase
on customer_features_current (last_purchase_at);

create index if not exists idx_customer_features_days_since_purchase
on customer_features_current (days_since_last_purchase);

create index if not exists idx_customer_features_net_revenue_365d
on customer_features_current (net_revenue_365d);

create index if not exists idx_customer_features_gross_margin_365d
on customer_features_current (gross_margin_365d);

create index if not exists idx_customer_features_preferred_store
on customer_features_current (preferred_store_id);

create index if not exists idx_customer_features_channel
on customer_features_current (preferred_channel);
```

---

## 6.2 Customer Category Features

Tracks category affinity.

```sql
create table if not exists customer_category_features (
    customer_id uuid not null,
    category_id uuid not null,
    category_key text,

    purchase_count_lifetime int not null default 0,
    purchase_count_365d int not null default 0,
    net_revenue_lifetime numeric(14,2) not null default 0,
    net_revenue_365d numeric(14,2) not null default 0,
    gross_margin_365d numeric(14,2) not null default 0,

    last_purchase_at timestamptz,
    affinity_score numeric(8,4) not null default 0,

    updated_at timestamptz not null default now(),

    primary key (customer_id, category_id)
);
```

Indexes:

```sql
create index if not exists idx_customer_category_features_category_score
on customer_category_features (category_id, affinity_score desc);

create index if not exists idx_customer_category_features_category_key_score
on customer_category_features (category_key, affinity_score desc);

create index if not exists idx_customer_category_features_customer
on customer_category_features (customer_id);
```

---

## 6.3 Customer Brand Features

Tracks brand affinity.

```sql
create table if not exists customer_brand_features (
    customer_id uuid not null,
    brand_id uuid not null,
    brand_key text,

    purchase_count_lifetime int not null default 0,
    purchase_count_365d int not null default 0,
    net_revenue_lifetime numeric(14,2) not null default 0,
    net_revenue_365d numeric(14,2) not null default 0,
    gross_margin_365d numeric(14,2) not null default 0,

    last_purchase_at timestamptz,
    affinity_score numeric(8,4) not null default 0,

    updated_at timestamptz not null default now(),

    primary key (customer_id, brand_id)
);
```

Indexes:

```sql
create index if not exists idx_customer_brand_features_brand_score
on customer_brand_features (brand_id, affinity_score desc);

create index if not exists idx_customer_brand_features_brand_key_score
on customer_brand_features (brand_key, affinity_score desc);

create index if not exists idx_customer_brand_features_customer
on customer_brand_features (customer_id);
```

---

## 6.4 Customer Size Profiles

For shoes and clothing, size profile is very valuable. A customer may have multiple sizes because they buy for themselves and family members.

```sql
create table if not exists customer_size_profiles (
    customer_id uuid not null,

    size_type text not null,
    -- examples:
    -- shoe_us_men
    -- shoe_us_women
    -- shoe_us_kids
    -- apparel_top
    -- apparel_bottom

    size_value text not null,
    confidence_score numeric(8,4) not null default 0,
    purchase_count int not null default 0,
    last_seen_at timestamptz,

    updated_at timestamptz not null default now(),

    primary key (customer_id, size_type, size_value)
);
```

Indexes:

```sql
create index if not exists idx_customer_size_profiles_type_value
on customer_size_profiles (size_type, size_value, confidence_score desc);

create index if not exists idx_customer_size_profiles_customer
on customer_size_profiles (customer_id);
```

---

## 6.5 Segment Metric Registry

The rule engine may only use metrics in this registry.

```sql
create table if not exists segment_metric_registry (
    metric_key text primary key,

    display_name text not null,
    description text,

    value_type text not null check (value_type in (
        'integer',
        'numeric',
        'boolean',
        'text',
        'date',
        'timestamp'
    )),

    source_type text not null check (source_type in (
        'customer_feature',
        'category_feature',
        'brand_feature',
        'size_profile',
        'custom_sql_view'
    )),

    source_table text not null,
    source_column text,

    allowed_operators text[] not null,

    supports_window boolean not null default false,
    supports_dimension boolean not null default false,

    dimension_config jsonb,
    sql_template text,

    is_active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

Important implementation rule:

- For simple customer features, `source_table = 'customer_features_current'` and `source_column` points to the column.
- For dimensioned metrics such as category affinity, use `source_type = 'category_feature'` and require dimension values such as `category_id` or `category_key`.
- Do not allow unvalidated SQL. If `sql_template` is used, only internal developers can create it, and the compiler must still parameterize user values.

---

## 6.6 Customer Segments

```sql
create table if not exists customer_segments (
    id uuid primary key default gen_random_uuid(),

    segment_key text not null unique,
    name text not null,
    description text,

    segment_family text not null check (segment_family in (
        'lifecycle',
        'value',
        'rfm',
        'category_affinity',
        'brand_affinity',
        'promo_behavior',
        'channel_behavior',
        'churn_risk',
        'inventory_activation',
        'custom'
    )),

    status text not null check (status in (
        'draft',
        'active',
        'paused',
        'archived'
    )),

    evaluation_mode text not null check (evaluation_mode in (
        'batch',
        'realtime',
        'hybrid'
    )),

    priority int not null default 100,

    created_by uuid,
    updated_by uuid,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

Indexes:

```sql
create index if not exists idx_customer_segments_status
on customer_segments (status);

create index if not exists idx_customer_segments_family
on customer_segments (segment_family);

create index if not exists idx_customer_segments_priority
on customer_segments (priority);
```

---

## 6.7 Customer Segment Versions

```sql
create table if not exists customer_segment_versions (
    id uuid primary key default gen_random_uuid(),

    segment_id uuid not null references customer_segments(id),

    version_number int not null,

    rule_ast jsonb not null,
    scoring_config jsonb,
    activation_policy jsonb,
    suppression_policy jsonb,

    status text not null check (status in (
        'draft',
        'active',
        'retired'
    )),

    validation_status text not null default 'pending' check (validation_status in (
        'pending',
        'valid',
        'invalid'
    )),
    validation_errors jsonb,

    created_by uuid,
    created_at timestamptz not null default now(),
    activated_at timestamptz,
    retired_at timestamptz,

    unique (segment_id, version_number)
);
```

Indexes:

```sql
create unique index if not exists idx_one_active_version_per_segment
on customer_segment_versions (segment_id)
where status = 'active';

create index if not exists idx_customer_segment_versions_segment
on customer_segment_versions (segment_id);
```

---

## 6.8 Segment Version Metric Dependencies

This table is used for realtime reevaluation.

```sql
create table if not exists segment_version_metric_dependencies (
    segment_version_id uuid not null references customer_segment_versions(id) on delete cascade,
    metric_key text not null references segment_metric_registry(metric_key),

    primary key (segment_version_id, metric_key)
);
```

Index:

```sql
create index if not exists idx_segment_metric_dependencies_metric
on segment_version_metric_dependencies (metric_key);
```

---

## 6.9 Customer Segment Current

Stores current membership.

```sql
create table if not exists customer_segment_current (
    customer_id uuid not null,
    segment_id uuid not null references customer_segments(id),
    segment_version_id uuid not null references customer_segment_versions(id),

    score numeric(10,4),
    reason_codes jsonb,

    entered_at timestamptz not null,
    last_matched_at timestamptz not null,
    expires_at timestamptz,

    evaluation_run_id uuid,

    primary key (customer_id, segment_id)
);
```

Indexes:

```sql
create index if not exists idx_segment_current_segment_score
on customer_segment_current (segment_id, score desc);

create index if not exists idx_segment_current_customer
on customer_segment_current (customer_id);

create index if not exists idx_segment_current_version
on customer_segment_current (segment_version_id);
```

---

## 6.10 Customer Segment History

Stores segment entry, exit, refresh, and score-change events.

```sql
create table if not exists customer_segment_history (
    id uuid primary key default gen_random_uuid(),

    customer_id uuid not null,
    segment_id uuid not null references customer_segments(id),
    segment_version_id uuid not null references customer_segment_versions(id),

    event_type text not null check (event_type in (
        'entered',
        'exited',
        'refreshed',
        'score_changed',
        'version_changed'
    )),

    previous_score numeric(10,4),
    score numeric(10,4),
    reason_codes jsonb,

    occurred_at timestamptz not null default now(),
    evaluation_run_id uuid
);
```

Indexes:

```sql
create index if not exists idx_segment_history_customer_time
on customer_segment_history (customer_id, occurred_at desc);

create index if not exists idx_segment_history_segment_time
on customer_segment_history (segment_id, occurred_at desc);

create index if not exists idx_segment_history_run
on customer_segment_history (evaluation_run_id);
```

---

## 6.11 Segment Evaluation Runs

```sql
create table if not exists customer_segment_evaluation_runs (
    id uuid primary key default gen_random_uuid(),

    segment_id uuid references customer_segments(id),
    segment_version_id uuid references customer_segment_versions(id),

    evaluation_mode text not null check (evaluation_mode in (
        'batch',
        'realtime',
        'hybrid',
        'preview',
        'manual'
    )),

    status text not null check (status in (
        'running',
        'completed',
        'failed',
        'cancelled'
    )),

    started_at timestamptz not null default now(),
    finished_at timestamptz,

    customers_evaluated int,
    customers_matched int,
    customers_entered int,
    customers_exited int,
    customers_refreshed int,
    customers_score_changed int,

    error_message text,
    metadata jsonb
);
```

Indexes:

```sql
create index if not exists idx_segment_evaluation_runs_segment_time
on customer_segment_evaluation_runs (segment_id, started_at desc);

create index if not exists idx_segment_evaluation_runs_status
on customer_segment_evaluation_runs (status);
```

---

## 6.12 Activation Audiences

This stores audience snapshots generated from segment membership plus activation filters.

```sql
create table if not exists activation_audiences (
    id uuid primary key default gen_random_uuid(),

    audience_key text unique,
    name text not null,
    description text,

    requested_by uuid,

    request jsonb not null,

    total_candidates int not null default 0,
    eligible_customers int not null default 0,
    holdout_customers int not null default 0,
    activation_customers int not null default 0,

    status text not null check (status in (
        'building',
        'ready',
        'failed',
        'expired'
    )),

    created_at timestamptz not null default now(),
    expires_at timestamptz,
    error_message text
);
```

---

## 6.13 Activation Audience Members

```sql
create table if not exists activation_audience_members (
    audience_id uuid not null references activation_audiences(id) on delete cascade,
    customer_id uuid not null,

    treatment_group text not null check (treatment_group in (
        'activation',
        'holdout',
        'suppressed'
    )),

    suppression_reasons jsonb,
    segment_ids uuid[] not null,
    segment_version_ids uuid[] not null,
    score numeric(10,4),

    created_at timestamptz not null default now(),

    primary key (audience_id, customer_id)
);
```

Indexes:

```sql
create index if not exists idx_activation_audience_members_customer
on activation_audience_members (customer_id);

create index if not exists idx_activation_audience_members_group
on activation_audience_members (audience_id, treatment_group);
```

---

# 7. Rule AST Specification

Rules must be stored as JSON.

A rule is either:

- A group rule: `all`, `any`, or `not`
- A condition rule: metric/operator/value/dimension/window

## 7.1 TypeScript Types

```ts
export type SegmentEvaluationMode = 'batch' | 'realtime' | 'hybrid';

export type SegmentStatus = 'draft' | 'active' | 'paused' | 'archived';

export type SegmentFamily =
  | 'lifecycle'
  | 'value'
  | 'rfm'
  | 'category_affinity'
  | 'brand_affinity'
  | 'promo_behavior'
  | 'channel_behavior'
  | 'churn_risk'
  | 'inventory_activation'
  | 'custom';

export type SegmentRule = RuleGroup | RuleCondition;

export type RuleGroup = {
  all?: SegmentRule[];
  any?: SegmentRule[];
  not?: SegmentRule[];
};

export type RuleOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'between'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists'
  | 'contains'
  | 'percentile_gte'
  | 'percentile_lte';

export type RuleCondition = {
  metric: string;
  op: RuleOperator;
  value?: unknown;
  dimension?: Record<string, string | number | boolean>;
  window?: '7d' | '30d' | '90d' | '180d' | '365d' | 'lifetime';
};
```

## 7.2 Rule Examples

### Lapsed VIP Customers

```json
{
  "all": [
    {
      "metric": "net_revenue_365d",
      "op": ">=",
      "value": 500
    },
    {
      "metric": "order_count_lifetime",
      "op": ">=",
      "value": 3
    },
    {
      "metric": "days_since_last_purchase",
      "op": "between",
      "value": [120, 365]
    },
    {
      "metric": "return_rate_365d",
      "op": "<",
      "value": 0.35
    }
  ]
}
```

### One-Time Buyer Needing Second Purchase

```json
{
  "all": [
    {
      "metric": "order_count_lifetime",
      "op": "=",
      "value": 1
    },
    {
      "metric": "days_since_first_purchase",
      "op": "between",
      "value": [7, 45]
    },
    {
      "metric": "return_count_365d",
      "op": "=",
      "value": 0
    }
  ]
}
```

### Running Shoe Affinity Customers

```json
{
  "all": [
    {
      "metric": "category_affinity_score",
      "dimension": {
        "category_key": "running-shoes"
      },
      "op": ">=",
      "value": 0.7
    }
  ]
}
```

### Discount-Sensitive Customers

```json
{
  "all": [
    {
      "metric": "order_count_365d",
      "op": ">=",
      "value": 2
    },
    {
      "metric": "markdown_revenue_share_365d",
      "op": ">=",
      "value": 0.6
    },
    {
      "metric": "coupon_redemption_rate_365d",
      "op": ">=",
      "value": 0.5
    }
  ]
}
```

### Store-Only Customers

```json
{
  "all": [
    {
      "metric": "store_order_count_365d",
      "op": ">=",
      "value": 2
    },
    {
      "metric": "web_order_count_365d",
      "op": "=",
      "value": 0
    }
  ]
}
```

---

# 8. Rule Validation

Implement `RuleValidatorService`.

It must validate:

1. The rule has exactly one of `all`, `any`, `not`, or a valid condition.
2. `all`, `any`, and `not` arrays are non-empty.
3. Nesting depth is limited to 5.
4. Each metric exists in `segment_metric_registry`.
5. Each metric is active.
6. The operator is allowed for that metric.
7. The value type matches the metric type.
8. `between` has exactly two values.
9. `in` and `not_in` have arrays.
10. `exists` and `not_exists` do not require values.
11. Dimensioned metrics include required dimensions.
12. Non-dimensioned metrics do not include dimensions.
13. Windowed metrics only use supported windows.
14. Unknown fields are rejected.

Return validation errors in this format:

```ts
export type RuleValidationError = {
  path: string;
  code: string;
  message: string;
};
```

Example:

```json
[
  {
    "path": "all[2].value",
    "code": "INVALID_BETWEEN_VALUE",
    "message": "Operator between requires an array with exactly two values."
  }
]
```

---

# 9. Rule Compiler

Implement `RuleCompilerService`.

The compiler converts validated rule AST into safe SQL.

## 9.1 Compiled Rule Output

```ts
export type CompiledRule = {
  sql: string;
  params: unknown[];
  joins: CompiledJoin[];
  reasonTemplates: ReasonTemplate[];
  metricDependencies: string[];
};

export type CompiledJoin = {
  alias: string;
  sql: string;
};

export type ReasonTemplate = {
  metric: string;
  op: string;
  value?: unknown;
  labelTemplate: string;
};
```

## 9.2 Base Query

Every segment evaluation should be based on `customer_features_current cfc`.

Example compiled SQL shape:

```sql
select
    cfc.customer_id,
    null::numeric as score,
    jsonb_build_object('reasons', jsonb_build_array()) as reason_codes
from customer_features_current cfc
where {compiled_where_clause}
```

## 9.3 Customer Feature Metrics

For simple customer feature metrics, compile to parameterized comparisons.

Example condition:

```json
{
  "metric": "net_revenue_365d",
  "op": ">=",
  "value": 500
}
```

Compiles to:

```sql
cfc.net_revenue_365d >= $1
```

Params:

```json
[500]
```

## 9.4 Category Feature Metrics

For category affinity score, use an `exists` subquery or join.

Example condition:

```json
{
  "metric": "category_affinity_score",
  "dimension": {
    "category_key": "running-shoes"
  },
  "op": ">=",
  "value": 0.7
}
```

Compiles to:

```sql
exists (
    select 1
    from customer_category_features ccf
    where ccf.customer_id = cfc.customer_id
      and ccf.category_key = $1
      and ccf.affinity_score >= $2
)
```

Params:

```json
["running-shoes", 0.7]
```

## 9.5 Brand Feature Metrics

Example:

```json
{
  "metric": "brand_affinity_score",
  "dimension": {
    "brand_key": "nike"
  },
  "op": ">=",
  "value": 0.7
}
```

Compiles to:

```sql
exists (
    select 1
    from customer_brand_features cbf
    where cbf.customer_id = cfc.customer_id
      and cbf.brand_key = $1
      and cbf.affinity_score >= $2
)
```

## 9.6 Size Profile Metrics

Example:

```json
{
  "metric": "size_confidence_score",
  "dimension": {
    "size_type": "shoe_us_men",
    "size_value": "9"
  },
  "op": ">=",
  "value": 0.8
}
```

Compiles to:

```sql
exists (
    select 1
    from customer_size_profiles csp
    where csp.customer_id = cfc.customer_id
      and csp.size_type = $1
      and csp.size_value = $2
      and csp.confidence_score >= $3
)
```

Params:

```json
["shoe_us_men", "9", 0.8]
```

## 9.7 Group Rules

`all` compiles to `AND`.

`any` compiles to `OR`.

`not` compiles to `NOT (...)`.

Example:

```json
{
  "all": [
    { "metric": "order_count_lifetime", "op": ">=", "value": 2 },
    {
      "any": [
        { "metric": "email_opt_in", "op": "=", "value": true },
        { "metric": "sms_opt_in", "op": "=", "value": true }
      ]
    }
  ]
}
```

Compiles to:

```sql
(
  cfc.order_count_lifetime >= $1
  and
  (
    cfc.email_opt_in = $2
    or cfc.sms_opt_in = $3
  )
)
```

## 9.8 SQL Safety Requirements

The compiler must:

- Never concatenate raw user values into SQL.
- Always use query parameters.
- Only use table and column names from the metric registry.
- Reject unknown metrics.
- Reject unknown operators.
- Reject unknown dimensions.
- Limit nesting depth.
- Log compiled SQL only with parameters redacted in production.

---

# 10. Reason Codes

Every segment membership should explain why the customer matched.

Reason codes are stored as JSONB in `customer_segment_current.reason_codes` and `customer_segment_history.reason_codes`.

Recommended format:

```json
{
  "reasons": [
    {
      "code": "HIGH_VALUE",
      "metric": "net_revenue_365d",
      "label": "Customer spent 820.00 in the last 365 days",
      "actualValue": 820.0,
      "operator": ">=",
      "threshold": 500
    },
    {
      "code": "LAPSED",
      "metric": "days_since_last_purchase",
      "label": "Last purchase was 154 days ago",
      "actualValue": 154,
      "operator": "between",
      "threshold": [120, 365]
    }
  ]
}
```

Implement reason generation in a practical way:

1. For each matched segment, fetch the relevant metric values for the customer.
2. Generate labels using metric display names and actual values.
3. Include thresholds from the rule.
4. Store reason codes with membership.

Do not make reason generation block segment evaluation for very large jobs. For batch evaluation, generate reasons for matched customers either:

- Inline if segment size is manageable, or
- In chunks after membership changes are computed.

For MVP, inline generation is acceptable if performance is acceptable.

---

# 11. Segment Scoring

Membership is binary, but score is used for prioritization.

Store score as `numeric(10,4)` in membership tables.

## 11.1 Scoring Config

Example:

```json
{
  "score": {
    "base": 0,
    "scale": 100,
    "components": [
      {
        "metric": "net_revenue_365d",
        "weight": 0.35,
        "normalization": "percentile"
      },
      {
        "metric": "gross_margin_365d",
        "weight": 0.25,
        "normalization": "percentile"
      },
      {
        "metric": "days_since_last_purchase",
        "weight": 0.25,
        "normalization": "inverse_decay",
        "params": {
          "min": 90,
          "max": 365
        }
      },
      {
        "metric": "return_rate_365d",
        "weight": -0.15,
        "normalization": "bounded",
        "params": {
          "min": 0,
          "max": 1
        }
      }
    ]
  }
}
```

## 11.2 MVP Scoring

Implement these normalizations first:

```text
bounded
inverse_bounded
percentile
inverse_percentile
boolean
```

If no scoring config exists, default score should be `100` for matched customers.

## 11.3 Score Calculation

Implement `SegmentScoringService`.

Expected behavior:

1. Load scoring config for the segment version.
2. Fetch required metric values for matched customers.
3. Normalize each metric to 0–1.
4. Apply weights.
5. Multiply by scale, default 100.
6. Clamp result to 0–100 unless config explicitly allows another range.

---

# 12. Segment Evaluation

Implement `SegmentEvaluationService`.

## 12.1 Batch Evaluation Flow

For each active segment version:

```text
1. Create evaluation run with status = running.
2. Validate segment version rule.
3. Compile rule AST to SQL.
4. Evaluate matching customers into a temporary table.
5. Compute score for matched customers.
6. Generate reason codes for matched customers.
7. Compare matched customers to customer_segment_current.
8. Insert new memberships.
9. Refresh existing memberships.
10. Detect exited memberships.
11. Delete exited memberships from current table.
12. Insert history rows for entered, refreshed, score_changed, exited.
13. Update evaluation run counts.
14. Mark evaluation run completed or failed.
```

## 12.2 Temporary Table

Use a transaction and temporary table per segment evaluation:

```sql
create temporary table tmp_segment_matches (
    customer_id uuid primary key,
    score numeric(10,4),
    reason_codes jsonb
) on commit drop;
```

Insert matched customers:

```sql
insert into tmp_segment_matches (customer_id, score, reason_codes)
select
    matched.customer_id,
    matched.score,
    matched.reason_codes
from (
    -- compiled segment query here
) matched;
```

## 12.3 Insert New Memberships

```sql
insert into customer_segment_current (
    customer_id,
    segment_id,
    segment_version_id,
    score,
    reason_codes,
    entered_at,
    last_matched_at,
    evaluation_run_id
)
select
    t.customer_id,
    $1 as segment_id,
    $2 as segment_version_id,
    t.score,
    t.reason_codes,
    now(),
    now(),
    $3 as evaluation_run_id
from tmp_segment_matches t
left join customer_segment_current csc
  on csc.customer_id = t.customer_id
 and csc.segment_id = $1
where csc.customer_id is null;
```

## 12.4 History for Entered

```sql
insert into customer_segment_history (
    customer_id,
    segment_id,
    segment_version_id,
    event_type,
    score,
    reason_codes,
    evaluation_run_id
)
select
    t.customer_id,
    $1,
    $2,
    'entered',
    t.score,
    t.reason_codes,
    $3
from tmp_segment_matches t
left join customer_segment_current csc
  on csc.customer_id = t.customer_id
 and csc.segment_id = $1
where csc.customer_id is null;
```

Because order matters, write entered history before inserting current rows or use a CTE that captures inserted rows.

## 12.5 Refresh Existing Memberships

```sql
update customer_segment_current csc
set
    segment_version_id = $2,
    score = t.score,
    reason_codes = t.reason_codes,
    last_matched_at = now(),
    evaluation_run_id = $3
from tmp_segment_matches t
where csc.customer_id = t.customer_id
  and csc.segment_id = $1;
```

## 12.6 Score Changed History

Before refreshing, insert score change history where score changed materially.

Use a tolerance of `0.0001`.

```sql
insert into customer_segment_history (
    customer_id,
    segment_id,
    segment_version_id,
    event_type,
    previous_score,
    score,
    reason_codes,
    evaluation_run_id
)
select
    csc.customer_id,
    csc.segment_id,
    $2,
    'score_changed',
    csc.score,
    t.score,
    t.reason_codes,
    $3
from customer_segment_current csc
join tmp_segment_matches t
  on t.customer_id = csc.customer_id
where csc.segment_id = $1
  and abs(coalesce(csc.score, 0) - coalesce(t.score, 0)) > 0.0001;
```

## 12.7 Version Changed History

If the segment version changed for existing customers, insert a version_changed event.

```sql
insert into customer_segment_history (
    customer_id,
    segment_id,
    segment_version_id,
    event_type,
    previous_score,
    score,
    reason_codes,
    evaluation_run_id
)
select
    csc.customer_id,
    csc.segment_id,
    $2,
    'version_changed',
    csc.score,
    t.score,
    t.reason_codes,
    $3
from customer_segment_current csc
join tmp_segment_matches t
  on t.customer_id = csc.customer_id
where csc.segment_id = $1
  and csc.segment_version_id <> $2;
```

## 12.8 Exited Memberships

Insert exit history:

```sql
insert into customer_segment_history (
    customer_id,
    segment_id,
    segment_version_id,
    event_type,
    previous_score,
    score,
    reason_codes,
    evaluation_run_id
)
select
    csc.customer_id,
    csc.segment_id,
    csc.segment_version_id,
    'exited',
    csc.score,
    null,
    csc.reason_codes,
    $3
from customer_segment_current csc
left join tmp_segment_matches t
  on t.customer_id = csc.customer_id
where csc.segment_id = $1
  and t.customer_id is null;
```

Then delete exited current memberships:

```sql
delete from customer_segment_current csc
where csc.segment_id = $1
  and not exists (
      select 1
      from tmp_segment_matches t
      where t.customer_id = csc.customer_id
  );
```

## 12.9 Evaluation Run Counts

Compute and persist:

- customers_evaluated
- customers_matched
- customers_entered
- customers_exited
- customers_refreshed
- customers_score_changed

---

# 13. Single-Customer Realtime Evaluation

Implement `SingleCustomerEvaluationService`.

This service reevaluates one customer against relevant active segment versions.

## 13.1 Inputs

```ts
export type SingleCustomerEvaluationInput = {
  customerId: string;
  changedMetrics?: string[];
  eventType?: string;
  eventId?: string;
};
```

## 13.2 Flow

```text
1. Determine active segment versions to evaluate.
2. If changedMetrics provided, use segment_version_metric_dependencies to limit segments.
3. For each relevant segment version, compile the rule.
4. Add `and cfc.customer_id = $customerId` to compiled SQL.
5. Evaluate membership.
6. If customer matches and no current row exists, insert current + entered history.
7. If customer matches and current row exists, refresh score/reasons + score/version history if needed.
8. If customer does not match and current row exists, insert exited history and remove current row.
9. Emit domain events if event infrastructure exists.
```

## 13.3 When to Trigger

Trigger single-customer evaluation after:

- Customer created
- Customer merged
- Purchase completed
- Return completed
- Promotion redeemed
- Email/SMS opt-in changed
- Loyalty tier changed
- Customer profile updated
- Customer features recalculated
- Category or brand affinity recalculated
- Size profile recalculated

---

# 14. Segment Preview

Implement `SegmentPreviewService`.

Segment preview allows an admin to see impact before activation.

## 14.1 Request

```json
{
  "ruleAst": {
    "all": [
      {
        "metric": "net_revenue_365d",
        "op": ">=",
        "value": 500
      }
    ]
  },
  "limit": 25
}
```

## 14.2 Response

```json
{
  "isValid": true,
  "validationErrors": [],
  "estimatedSize": 18420,
  "sampleCustomers": [
    {
      "customerId": "...",
      "score": 100,
      "reasonCodes": {
        "reasons": []
      }
    }
  ],
  "profile": {
    "avgNetRevenue365d": 720.25,
    "avgGrossMargin365d": 298.10,
    "avgOrderCount365d": 4.2,
    "avgReturnRate365d": 0.08,
    "avgMarkdownShare365d": 0.22,
    "topStores": [],
    "topChannels": [],
    "topCategories": []
  }
}
```

## 14.3 Preview Profile Metrics

At minimum return:

- estimatedSize
- avgNetRevenue365d
- avgGrossMargin365d
- avgOrderCount365d
- avgReturnRate365d
- avgMarkdownShare365d
- top preferred stores
- top preferred channels
- sample customers

---

# 15. Activation Audience Builder

Implement `AudienceBuilderService`.

This generates an audience snapshot from segment membership plus activation filters.

## 15.1 Request Type

```ts
export type ActivationAudienceRequest = {
  name: string;
  description?: string;
  segmentKeys: string[];
  requireAllSegments?: boolean;
  channel?: 'email' | 'sms' | 'push' | 'pos' | 'web' | 'export';
  storeIds?: string[];
  maxAudienceSize?: number;
  suppressRecentlyContacted?: boolean;
  minDaysSinceLastContact?: number;
  requireRelevantInventory?: boolean;
  holdoutPercent?: number;
  additionalFilters?: SegmentRule;
  expiresAt?: string;
};
```

## 15.2 Request Example

```json
{
  "name": "Lapsed VIP Running Shoe Winback",
  "segmentKeys": ["lapsed-vip", "running-shoe-affinity"],
  "requireAllSegments": true,
  "channel": "email",
  "storeIds": ["store-014", "store-022"],
  "maxAudienceSize": 10000,
  "suppressRecentlyContacted": true,
  "minDaysSinceLastContact": 7,
  "requireRelevantInventory": true,
  "holdoutPercent": 10
}
```

## 15.3 Response

```json
{
  "audienceId": "...",
  "status": "ready",
  "totalCandidates": 18420,
  "eligibleCustomers": 9320,
  "holdoutCustomers": 932,
  "activationCustomers": 8388
}
```

## 15.4 Audience Logic

Candidates come from `customer_segment_current`.

If `requireAllSegments = true`, customer must be in all requested segments.

If `requireAllSegments = false`, customer may be in any requested segment.

Apply suppression after candidate selection.

Apply holdout after suppression.

## 15.5 Channel Suppression

For channel eligibility:

```text
email -> customer_features_current.email_opt_in = true
sms   -> customer_features_current.sms_opt_in = true
push  -> customer_features_current.push_opt_in = true
pos   -> no opt-in required, but employee/fraud/abuse suppressions still apply
web   -> no opt-in required, but employee/fraud/abuse suppressions still apply
export -> apply requested filters only
```

Always suppress:

- employee_flag = true
- fraud_risk_flag = true
- abuse_risk_flag = true

## 15.6 Holdout Assignment

Holdout must be deterministic for an audience.

Use a hash of `audience_id + customer_id`.

Example logic:

```sql
mod(abs(hashtext(audience_id::text || customer_id::text)), 100) < holdout_percent
```

Customers in holdout should be stored in `activation_audience_members` with `treatment_group = 'holdout'`.

Do not simply exclude holdouts. Store them for measurement.

---

# 16. API Endpoints

Implement REST endpoints. Use authentication/authorization according to the existing system.

All write endpoints require admin permissions.

All endpoints should validate request body using Zod or equivalent.

---

## 16.1 Segment CRUD

### Create Segment

```http
POST /api/customer-segments
```

Request:

```json
{
  "segmentKey": "lapsed-vip",
  "name": "Lapsed VIP Customers",
  "description": "High-value customers who have not purchased recently.",
  "segmentFamily": "churn_risk",
  "evaluationMode": "batch",
  "priority": 10
}
```

Response:

```json
{
  "id": "...",
  "segmentKey": "lapsed-vip",
  "name": "Lapsed VIP Customers",
  "status": "draft"
}
```

### List Segments

```http
GET /api/customer-segments?status=active&family=lifecycle
```

Response:

```json
{
  "items": [],
  "total": 0
}
```

### Get Segment

```http
GET /api/customer-segments/:segmentId
```

### Update Segment Metadata

```http
PATCH /api/customer-segments/:segmentId
```

Allowed fields:

- name
- description
- segmentFamily
- evaluationMode
- priority
- status, except do not archive active segment without retiring active version

### Archive Segment

```http
POST /api/customer-segments/:segmentId/archive
```

---

## 16.2 Segment Versions

### Create Segment Version

```http
POST /api/customer-segments/:segmentId/versions
```

Request:

```json
{
  "ruleAst": {
    "all": [
      {
        "metric": "net_revenue_365d",
        "op": ">=",
        "value": 500
      }
    ]
  },
  "scoringConfig": null,
  "activationPolicy": null,
  "suppressionPolicy": null
}
```

Behavior:

1. Validate rule.
2. Store as next version number with status `draft`.
3. Store validation status and validation errors.
4. Store metric dependencies.

### Validate Segment Version

```http
POST /api/customer-segment-versions/validate
```

Request:

```json
{
  "ruleAst": {}
}
```

Response:

```json
{
  "isValid": true,
  "errors": [],
  "metricDependencies": ["net_revenue_365d"]
}
```

### Preview Segment Version

```http
POST /api/customer-segment-versions/preview
```

Request:

```json
{
  "ruleAst": {},
  "limit": 25
}
```

### Activate Segment Version

```http
POST /api/customer-segments/:segmentId/versions/:versionId/activate
```

Behavior:

1. Validate version.
2. In a transaction, retire existing active version for that segment.
3. Mark selected version active.
4. Mark segment active if it was draft.
5. Trigger evaluation unless request says `evaluateImmediately = false`.

Request:

```json
{
  "evaluateImmediately": true
}
```

### Retire Segment Version

```http
POST /api/customer-segments/:segmentId/versions/:versionId/retire
```

---

## 16.3 Evaluation APIs

### Evaluate All Active Batch Segments

```http
POST /api/customer-segments/evaluate-active
```

Response:

```json
{
  "runIds": ["..."]
}
```

### Evaluate One Segment

```http
POST /api/customer-segments/:segmentId/evaluate
```

Response:

```json
{
  "runId": "...",
  "status": "completed"
}
```

### Evaluate One Customer

```http
POST /api/customers/:customerId/evaluate-segments
```

Request:

```json
{
  "changedMetrics": ["order_count_lifetime", "net_revenue_365d"],
  "eventType": "purchase_completed",
  "eventId": "..."
}
```

Response:

```json
{
  "customerId": "...",
  "evaluatedSegments": 12,
  "entered": 1,
  "exited": 0,
  "refreshed": 4
}
```

### Get Evaluation Run

```http
GET /api/customer-segment-evaluation-runs/:runId
```

---

## 16.4 Membership APIs

### Get Customer Segments

```http
GET /api/customers/:customerId/segments
```

Response:

```json
{
  "customerId": "...",
  "segments": [
    {
      "segmentId": "...",
      "segmentKey": "lapsed-vip",
      "name": "Lapsed VIP Customers",
      "segmentFamily": "churn_risk",
      "segmentVersionId": "...",
      "versionNumber": 2,
      "score": 91.25,
      "reasonCodes": {
        "reasons": []
      },
      "enteredAt": "2026-04-24T12:00:00Z",
      "lastMatchedAt": "2026-04-24T12:00:00Z"
    }
  ]
}
```

### Get Segment Members

```http
GET /api/customer-segments/:segmentId/members?limit=100&offset=0
```

Response:

```json
{
  "items": [],
  "total": 0
}
```

### Get Customer Segment History

```http
GET /api/customers/:customerId/segment-history
```

---

## 16.5 Audience APIs

### Build Activation Audience

```http
POST /api/activation-audiences
```

Request:

```json
{
  "name": "Lapsed VIP Winback",
  "segmentKeys": ["lapsed-vip"],
  "requireAllSegments": true,
  "channel": "email",
  "maxAudienceSize": 10000,
  "suppressRecentlyContacted": true,
  "minDaysSinceLastContact": 7,
  "holdoutPercent": 10
}
```

Response:

```json
{
  "audienceId": "...",
  "status": "ready",
  "totalCandidates": 15000,
  "eligibleCustomers": 10000,
  "holdoutCustomers": 1000,
  "activationCustomers": 9000
}
```

### Get Audience

```http
GET /api/activation-audiences/:audienceId
```

### Get Audience Members

```http
GET /api/activation-audiences/:audienceId/members?treatmentGroup=activation&limit=1000
```

### Export Audience Members

```http
GET /api/activation-audiences/:audienceId/export.csv
```

CSV columns:

```text
customer_id,treatment_group,score,segment_keys,segment_version_ids,suppression_reasons
```

---

## 16.6 Metric Registry APIs

### List Metrics

```http
GET /api/segment-metrics
```

Response:

```json
{
  "items": [
    {
      "metricKey": "net_revenue_365d",
      "displayName": "Net Revenue 365 Days",
      "valueType": "numeric",
      "allowedOperators": [">", ">=", "<", "<=", "between"]
    }
  ]
}
```

Only internal developer/admin roles should create or update metric registry entries.

---

# 17. Seed Metric Registry

Insert these default metrics.

```sql
insert into segment_metric_registry (
    metric_key,
    display_name,
    description,
    value_type,
    source_type,
    source_table,
    source_column,
    allowed_operators,
    supports_window,
    supports_dimension,
    dimension_config
)
values
('first_purchase_at', 'First Purchase Date', 'Date of first purchase.', 'timestamp', 'customer_feature', 'customer_features_current', 'first_purchase_at', array['=', '!=', '>', '>=', '<', '<=', 'exists', 'not_exists'], false, false, null),
('last_purchase_at', 'Last Purchase Date', 'Date of most recent purchase.', 'timestamp', 'customer_feature', 'customer_features_current', 'last_purchase_at', array['=', '!=', '>', '>=', '<', '<=', 'exists', 'not_exists'], false, false, null),
('days_since_first_purchase', 'Days Since First Purchase', 'Number of days since first purchase.', 'integer', 'customer_feature', 'customer_features_current', 'days_since_first_purchase', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),
('days_since_last_purchase', 'Days Since Last Purchase', 'Number of days since most recent purchase.', 'integer', 'customer_feature', 'customer_features_current', 'days_since_last_purchase', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),

('order_count_lifetime', 'Lifetime Order Count', 'Total number of completed orders.', 'integer', 'customer_feature', 'customer_features_current', 'order_count_lifetime', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),
('order_count_30d', 'Order Count 30 Days', 'Completed orders in last 30 days.', 'integer', 'customer_feature', 'customer_features_current', 'order_count_30d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),
('order_count_90d', 'Order Count 90 Days', 'Completed orders in last 90 days.', 'integer', 'customer_feature', 'customer_features_current', 'order_count_90d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),
('order_count_365d', 'Order Count 365 Days', 'Completed orders in last 365 days.', 'integer', 'customer_feature', 'customer_features_current', 'order_count_365d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),

('net_revenue_lifetime', 'Lifetime Net Revenue', 'Net revenue after returns and cancellations.', 'numeric', 'customer_feature', 'customer_features_current', 'net_revenue_lifetime', array['=', '!=', '>', '>=', '<', '<=', 'between', 'percentile_gte', 'percentile_lte'], false, false, null),
('net_revenue_365d', 'Net Revenue 365 Days', 'Net revenue in last 365 days after returns.', 'numeric', 'customer_feature', 'customer_features_current', 'net_revenue_365d', array['=', '!=', '>', '>=', '<', '<=', 'between', 'percentile_gte', 'percentile_lte'], false, false, null),
('gross_margin_365d', 'Gross Margin 365 Days', 'Gross margin contribution in last 365 days.', 'numeric', 'customer_feature', 'customer_features_current', 'gross_margin_365d', array['=', '!=', '>', '>=', '<', '<=', 'between', 'percentile_gte', 'percentile_lte'], false, false, null),
('avg_order_value_365d', 'Average Order Value 365 Days', 'Average order value in last 365 days.', 'numeric', 'customer_feature', 'customer_features_current', 'avg_order_value_365d', array['=', '!=', '>', '>=', '<', '<=', 'between', 'percentile_gte', 'percentile_lte'], false, false, null),

('return_count_365d', 'Return Count 365 Days', 'Return count in last 365 days.', 'integer', 'customer_feature', 'customer_features_current', 'return_count_365d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),
('return_rate_365d', 'Return Rate 365 Days', 'Return rate in last 365 days.', 'numeric', 'customer_feature', 'customer_features_current', 'return_rate_365d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),

('markdown_revenue_share_365d', 'Markdown Revenue Share 365 Days', 'Share of revenue from marked-down purchases.', 'numeric', 'customer_feature', 'customer_features_current', 'markdown_revenue_share_365d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),
('average_discount_percent_365d', 'Average Discount Percent 365 Days', 'Average discount percent in last 365 days.', 'numeric', 'customer_feature', 'customer_features_current', 'average_discount_percent_365d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),
('coupon_redemption_count_365d', 'Coupon Redemption Count 365 Days', 'Coupon redemptions in last 365 days.', 'integer', 'customer_feature', 'customer_features_current', 'coupon_redemption_count_365d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),
('coupon_redemption_rate_365d', 'Coupon Redemption Rate 365 Days', 'Coupon redemption rate in last 365 days.', 'numeric', 'customer_feature', 'customer_features_current', 'coupon_redemption_rate_365d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),
('full_price_purchase_count_365d', 'Full Price Purchase Count 365 Days', 'Full-price purchases in last 365 days.', 'integer', 'customer_feature', 'customer_features_current', 'full_price_purchase_count_365d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),
('promo_purchase_count_365d', 'Promo Purchase Count 365 Days', 'Promotional purchases in last 365 days.', 'integer', 'customer_feature', 'customer_features_current', 'promo_purchase_count_365d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),

('preferred_store_id', 'Preferred Store', 'Most common or highest-value store for the customer.', 'text', 'customer_feature', 'customer_features_current', 'preferred_store_id', array['=', '!=', 'in', 'not_in', 'exists', 'not_exists'], false, false, null),
('preferred_channel', 'Preferred Channel', 'Preferred purchasing channel.', 'text', 'customer_feature', 'customer_features_current', 'preferred_channel', array['=', '!=', 'in', 'not_in', 'exists', 'not_exists'], false, false, null),
('web_order_count_365d', 'Web Order Count 365 Days', 'Web orders in last 365 days.', 'integer', 'customer_feature', 'customer_features_current', 'web_order_count_365d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),
('store_order_count_365d', 'Store Order Count 365 Days', 'Store orders in last 365 days.', 'integer', 'customer_feature', 'customer_features_current', 'store_order_count_365d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, false, null),

('email_opt_in', 'Email Opt-In', 'Whether customer can receive email.', 'boolean', 'customer_feature', 'customer_features_current', 'email_opt_in', array['=', '!='], false, false, null),
('sms_opt_in', 'SMS Opt-In', 'Whether customer can receive SMS.', 'boolean', 'customer_feature', 'customer_features_current', 'sms_opt_in', array['=', '!='], false, false, null),
('push_opt_in', 'Push Opt-In', 'Whether customer can receive push notifications.', 'boolean', 'customer_feature', 'customer_features_current', 'push_opt_in', array['=', '!='], false, false, null),

('employee_flag', 'Employee Flag', 'Whether customer is an employee.', 'boolean', 'customer_feature', 'customer_features_current', 'employee_flag', array['=', '!='], false, false, null),
('fraud_risk_flag', 'Fraud Risk Flag', 'Whether customer has fraud risk flag.', 'boolean', 'customer_feature', 'customer_features_current', 'fraud_risk_flag', array['=', '!='], false, false, null),
('abuse_risk_flag', 'Abuse Risk Flag', 'Whether customer has abuse risk flag.', 'boolean', 'customer_feature', 'customer_features_current', 'abuse_risk_flag', array['=', '!='], false, false, null),

('category_affinity_score', 'Category Affinity Score', 'Affinity score for a category.', 'numeric', 'category_feature', 'customer_category_features', 'affinity_score', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, true, '{"required": ["category_key"]}'::jsonb),
('category_purchase_count_365d', 'Category Purchase Count 365 Days', 'Purchase count in a category in last 365 days.', 'integer', 'category_feature', 'customer_category_features', 'purchase_count_365d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, true, '{"required": ["category_key"]}'::jsonb),

('brand_affinity_score', 'Brand Affinity Score', 'Affinity score for a brand.', 'numeric', 'brand_feature', 'customer_brand_features', 'affinity_score', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, true, '{"required": ["brand_key"]}'::jsonb),
('brand_purchase_count_365d', 'Brand Purchase Count 365 Days', 'Purchase count for a brand in last 365 days.', 'integer', 'brand_feature', 'customer_brand_features', 'purchase_count_365d', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, true, '{"required": ["brand_key"]}'::jsonb),

('size_confidence_score', 'Size Confidence Score', 'Confidence that customer buys a specific size.', 'numeric', 'size_profile', 'customer_size_profiles', 'confidence_score', array['=', '!=', '>', '>=', '<', '<=', 'between'], false, true, '{"required": ["size_type", "size_value"]}'::jsonb)
on conflict (metric_key) do update set
    display_name = excluded.display_name,
    description = excluded.description,
    value_type = excluded.value_type,
    source_type = excluded.source_type,
    source_table = excluded.source_table,
    source_column = excluded.source_column,
    allowed_operators = excluded.allowed_operators,
    supports_window = excluded.supports_window,
    supports_dimension = excluded.supports_dimension,
    dimension_config = excluded.dimension_config,
    updated_at = now();
```

---

# 18. Default Segment Seeds

Create default segments and versions. These should be inserted idempotently.

## 18.1 Lifecycle Segments

### Prospects

Customers known to the system but no purchase yet.

```json
{
  "all": [
    { "metric": "order_count_lifetime", "op": "=", "value": 0 }
  ]
}
```

### New Customers

```json
{
  "all": [
    { "metric": "order_count_lifetime", "op": ">=", "value": 1 },
    { "metric": "days_since_first_purchase", "op": "<=", "value": 30 }
  ]
}
```

### One-Time Buyers

```json
{
  "all": [
    { "metric": "order_count_lifetime", "op": "=", "value": 1 },
    { "metric": "days_since_first_purchase", "op": ">", "value": 14 }
  ]
}
```

### Repeat Customers

```json
{
  "all": [
    { "metric": "order_count_lifetime", "op": ">=", "value": 2 }
  ]
}
```

### Active Customers

```json
{
  "all": [
    { "metric": "order_count_lifetime", "op": ">=", "value": 1 },
    { "metric": "days_since_last_purchase", "op": "<=", "value": 90 }
  ]
}
```

### Lapsing Customers

```json
{
  "all": [
    { "metric": "order_count_lifetime", "op": ">=", "value": 1 },
    { "metric": "days_since_last_purchase", "op": "between", "value": [91, 180] }
  ]
}
```

### Lapsed Customers

```json
{
  "all": [
    { "metric": "order_count_lifetime", "op": ">=", "value": 1 },
    { "metric": "days_since_last_purchase", "op": ">", "value": 180 }
  ]
}
```

### Dormant Customers

```json
{
  "all": [
    { "metric": "order_count_lifetime", "op": ">=", "value": 1 },
    { "metric": "days_since_last_purchase", "op": ">", "value": 365 }
  ]
}
```

## 18.2 Value Segments

### VIP Customers

```json
{
  "all": [
    { "metric": "net_revenue_365d", "op": ">=", "value": 750 },
    { "metric": "order_count_lifetime", "op": ">=", "value": 3 },
    { "metric": "return_rate_365d", "op": "<", "value": 0.35 }
  ]
}
```

### Potential VIP Customers

```json
{
  "all": [
    { "metric": "order_count_lifetime", "op": "between", "value": [1, 2] },
    { "metric": "net_revenue_365d", "op": ">=", "value": 300 },
    { "metric": "return_rate_365d", "op": "<", "value": 0.35 }
  ]
}
```

### High Margin Customers

```json
{
  "all": [
    { "metric": "gross_margin_365d", "op": ">=", "value": 250 }
  ]
}
```

### High AOV Customers

```json
{
  "all": [
    { "metric": "avg_order_value_365d", "op": ">=", "value": 150 },
    { "metric": "order_count_365d", "op": ">=", "value": 2 }
  ]
}
```

### Frequent Buyers

```json
{
  "all": [
    { "metric": "order_count_365d", "op": ">=", "value": 5 }
  ]
}
```

## 18.3 Promotion Behavior Segments

### Full-Price Shoppers

```json
{
  "all": [
    { "metric": "full_price_purchase_count_365d", "op": ">=", "value": 2 },
    { "metric": "markdown_revenue_share_365d", "op": "<", "value": 0.25 },
    { "metric": "coupon_redemption_rate_365d", "op": "<", "value": 0.25 }
  ]
}
```

### Promo-Responsive Customers

```json
{
  "all": [
    { "metric": "promo_purchase_count_365d", "op": ">=", "value": 2 },
    { "metric": "coupon_redemption_rate_365d", "op": ">=", "value": 0.3 }
  ]
}
```

### Coupon-Dependent Customers

```json
{
  "all": [
    { "metric": "order_count_365d", "op": ">=", "value": 2 },
    { "metric": "coupon_redemption_rate_365d", "op": ">=", "value": 0.7 }
  ]
}
```

### Clearance Buyers

```json
{
  "all": [
    { "metric": "order_count_365d", "op": ">=", "value": 2 },
    { "metric": "markdown_revenue_share_365d", "op": ">=", "value": 0.7 }
  ]
}
```

## 18.4 Channel Behavior Segments

### Store-Only Customers

```json
{
  "all": [
    { "metric": "store_order_count_365d", "op": ">=", "value": 1 },
    { "metric": "web_order_count_365d", "op": "=", "value": 0 }
  ]
}
```

### Web-Only Customers

```json
{
  "all": [
    { "metric": "web_order_count_365d", "op": ">=", "value": 1 },
    { "metric": "store_order_count_365d", "op": "=", "value": 0 }
  ]
}
```

### Omnichannel Customers

```json
{
  "all": [
    { "metric": "web_order_count_365d", "op": ">=", "value": 1 },
    { "metric": "store_order_count_365d", "op": ">=", "value": 1 }
  ]
}
```

## 18.5 Churn Risk Segments

### At-Risk VIP Customers

```json
{
  "all": [
    { "metric": "net_revenue_lifetime", "op": ">=", "value": 750 },
    { "metric": "order_count_lifetime", "op": ">=", "value": 3 },
    { "metric": "days_since_last_purchase", "op": "between", "value": [120, 365] },
    { "metric": "return_rate_365d", "op": "<", "value": 0.35 }
  ]
}
```

### High Return-Rate Customers

```json
{
  "all": [
    { "metric": "order_count_365d", "op": ">=", "value": 2 },
    { "metric": "return_rate_365d", "op": ">=", "value": 0.4 }
  ]
}
```

## 18.6 Category Affinity Segments

Seed these if category keys exist in PIM. If PIM category keys differ, update the category keys accordingly.

### Running Shoe Customers

```json
{
  "all": [
    {
      "metric": "category_affinity_score",
      "dimension": { "category_key": "running-shoes" },
      "op": ">=",
      "value": 0.7
    }
  ]
}
```

### Sneaker Customers

```json
{
  "all": [
    {
      "metric": "category_affinity_score",
      "dimension": { "category_key": "sneakers" },
      "op": ">=",
      "value": 0.7
    }
  ]
}
```

### Kids Footwear Customers

```json
{
  "all": [
    {
      "metric": "category_affinity_score",
      "dimension": { "category_key": "kids-footwear" },
      "op": ">=",
      "value": 0.7
    }
  ]
}
```

### Apparel Customers

```json
{
  "all": [
    {
      "metric": "category_affinity_score",
      "dimension": { "category_key": "apparel" },
      "op": ">=",
      "value": 0.7
    }
  ]
}
```

---

# 19. Feature Builder Requirements

The segmentation engine depends on customer feature tables. If they are not already being populated, implement a feature builder.

## 19.1 Required Inputs

Expected source tables may vary by system. Map your existing schema into these concepts:

- customers
- orders
- order_items
- returns
- products
- categories
- brands
- stores
- promotions
- coupon redemptions
- inventory
- customer consent/preferences

## 19.2 KPI Rules

Use these calculations:

### Net Revenue

```text
net_revenue = gross_sales - discounts - returns - cancellations
```

### Gross Margin

```text
gross_margin = net_revenue - cost_of_goods_sold
```

### Return Rate

Use item-based return rate if possible:

```text
return_rate = returned_item_count / purchased_item_count
```

Fallback to order-based return rate:

```text
return_rate = return_count / order_count
```

### Markdown Revenue Share

```text
markdown_revenue_share = markdown_revenue / total_net_revenue
```

### Coupon Redemption Rate

```text
coupon_redemption_rate = orders_with_coupon / total_orders
```

### Preferred Store

Use the store with the highest order count in the last 365 days. If tied, use highest net revenue. If still tied, use most recent purchase.

### Preferred Channel

Use the channel with highest order count in the last 365 days:

```text
store
web
omnichannel
```

If both store and web have at least one order in last 365 days, preferred_channel can be `omnichannel`.

## 19.3 Category Affinity Score

Start with a simple score:

```text
category_affinity_score =
  0.45 * normalized_category_purchase_count_365d
+ 0.35 * normalized_category_net_revenue_365d
+ 0.20 * recent_purchase_boost
```

Where:

```text
recent_purchase_boost = 1.0 if last category purchase <= 90 days
recent_purchase_boost = 0.5 if last category purchase <= 180 days
recent_purchase_boost = 0.0 otherwise
```

Clamp score to 0–1.

## 19.4 Brand Affinity Score

Use same structure as category affinity.

## 19.5 Size Confidence Score

For each customer and size type/value:

```text
confidence_score = min(1.0, purchase_count_for_size / total_purchases_for_size_type)
```

Boost recent size observations:

```text
if last_seen_at <= 180 days, confidence_score = confidence_score + 0.10
```

Clamp to 1.0.

Do not force one size per customer. Keep multiple sizes.

---

# 20. Jobs and Scheduling

## 20.1 Batch Job

Implement a job:

```text
evaluate-active-segments
```

It should:

1. Load all active segments with active versions where `evaluation_mode in ('batch', 'hybrid')`.
2. Evaluate each segment.
3. Log run IDs and counts.
4. Continue evaluating other segments if one fails.
5. Return summary.

Recommended schedule:

```text
Daily at 02:00 local business timezone
```

Add an endpoint or CLI command to run manually.

## 20.2 Single Segment Job

Implement:

```text
evaluate-segment --segment-key=lapsed-vip
```

## 20.3 Single Customer Job

Implement:

```text
evaluate-customer-segments --customer-id=<uuid>
```

This is useful after purchase, return, opt-in change, or manual customer support action.

## 20.4 Concurrency Control

Avoid two evaluations for the same segment running simultaneously.

Use PostgreSQL advisory locks.

Example:

```sql
select pg_try_advisory_lock(hashtext('segment-evaluation:' || $1));
```

Release after completion:

```sql
select pg_advisory_unlock(hashtext('segment-evaluation:' || $1));
```

---

# 21. Event Emission

If the system has an event bus, emit events.

## 21.1 Events

```text
customer.segment.entered
customer.segment.exited
customer.segment.score_changed
customer.segment.version_changed
activation_audience.ready
```

## 21.2 Event Payload

```json
{
  "eventType": "customer.segment.entered",
  "occurredAt": "2026-04-24T12:00:00Z",
  "customerId": "...",
  "segmentId": "...",
  "segmentKey": "lapsed-vip",
  "segmentVersionId": "...",
  "score": 91.25,
  "evaluationRunId": "..."
}
```

---

# 22. Inventory-Aware Segmentation and Activation

Do not create thousands of static microsegments such as:

```text
Nike size 9 customers near Store 014
Adidas size 10 customers near Store 022
Boot buyers near Store 003
```

Instead:

1. Create durable base segments:
   - Sneaker affinity customers
   - Running shoe affinity customers
   - Kids footwear customers
   - Brand loyalists

2. Apply inventory filters at activation time:
   - Store has inventory
   - Store has overstock
   - Customer likely size is available
   - Product is active online
   - Margin is acceptable
   - Customer has not bought same category recently

## 22.1 Optional Inventory Filter Contract

If inventory tables exist, implement `requireRelevantInventory` in the audience builder.

Expected input structures:

```text
inventory_by_location(product_id, store_id, available_quantity, reserved_quantity)
products(product_id, category_id, category_key, brand_id, brand_key, size_type, size_value, active, gross_margin_percent)
```

Activation inventory eligibility should check:

```text
customer has category or brand affinity
customer size profile matches product size
store has available quantity > threshold
product active = true
gross margin percent >= requested minimum
```

If inventory tables are not ready, keep the field in the API and return a clear error if `requireRelevantInventory = true`.

---

# 23. Conflict Resolution

Customers can belong to many segments.

Example:

```text
Customer is:
- VIP
- Lapsed
- Running shoe buyer
- Full-price shopper
- Store 014 loyalist
```

Activation systems must avoid bad treatment decisions.

Recommended priority order:

1. Compliance suppression
2. Customer contact frequency cap
3. Segment priority
4. Campaign priority
5. Margin protection
6. Inventory relevance
7. Holdout assignment

Example:

```text
Customer qualifies for:
- 25% off lapsed customer campaign
- New running shoe launch email
- Full-price VIP early access

Because customer is a full-price VIP, choose early access instead of discount.
```

The segmentation engine should expose segment priority and customer segment list. The activation engine should make the final decision.

---

# 24. Reporting and Measurement

Implement reporting queries or service methods.

## 24.1 Segment Health Metrics

For each segment:

- segment_size
- new_entries_7d
- exits_7d
- new_entries_30d
- exits_30d
- average_score
- revenue_share
- margin_share
- average_order_value
- purchase_frequency
- return_rate
- markdown_share

## 24.2 Segment Movement Metrics

Track transitions:

```text
Prospect -> New Customer
New Customer -> Repeat Customer
Active -> Lapsing
Lapsing -> Lapsed
Lapsed -> Reactivated
VIP -> At-Risk VIP
At-Risk VIP -> Active VIP
```

This can be calculated from `customer_segment_history`.

## 24.3 Activation Metrics

For each activation audience:

- total_candidates
- eligible_customers
- holdout_customers
- activation_customers
- suppressed_customers
- top suppression reasons

Campaign performance should be measured by the activation/promotion module, but the segmentation engine should preserve audience snapshots to support incremental lift analysis.

---

# 25. Admin UI Requirements

Build or expose APIs to support an admin UI with this workflow:

```text
1. Create segment.
2. Choose segment family.
3. Add rule conditions.
4. Validate rule.
5. Preview customer count.
6. View sample customers.
7. View explanation for sample customers.
8. View estimated revenue and margin profile.
9. Save draft version.
10. Activate version.
11. Run evaluation.
12. View current members.
13. View membership history.
14. Use segment in activation audience.
15. Monitor segment health.
```

The UI must not allow users to write raw SQL.

The UI should fetch available metrics from:

```http
GET /api/segment-metrics
```

---

# 26. Security and Permissions

Implement permissions according to the existing auth system.

Minimum roles:

```text
segmentation:read
segmentation:write
segmentation:activate
segmentation:evaluate
segmentation:admin
```

Rules:

- Anyone with read permission can list segments and memberships.
- Only write permission can create draft segments and versions.
- Only activate permission can activate a segment version.
- Only evaluate permission can run evaluation jobs manually.
- Only admin permission can change metric registry.

Log all write actions.

---

# 27. Auditing

Create an audit log if the platform does not already have one.

Minimum audit events:

- segment.created
- segment.updated
- segment.archived
- segment_version.created
- segment_version.activated
- segment_version.retired
- segment.evaluated
- activation_audience.created

Audit payload should include:

```json
{
  "actorUserId": "...",
  "eventType": "segment_version.activated",
  "entityType": "customer_segment_version",
  "entityId": "...",
  "occurredAt": "...",
  "before": {},
  "after": {}
}
```

---

# 28. Testing Requirements

Implement automated tests.

## 28.1 Rule Validator Tests

Test cases:

- Valid simple metric rule
- Invalid unknown metric
- Invalid operator for metric
- Invalid value type
- Invalid between value
- Invalid in value
- Missing dimension
- Extra dimension on non-dimension metric
- Too deep nesting
- Empty all/any/not array

## 28.2 Rule Compiler Tests

Test cases:

- Compile simple numeric comparison
- Compile boolean comparison
- Compile between
- Compile in/not_in
- Compile exists/not_exists
- Compile nested all/any/not
- Compile category affinity exists subquery
- Compile brand affinity exists subquery
- Compile size profile exists subquery
- Ensure values are parameterized
- Ensure unknown metric cannot compile

## 28.3 Segment Evaluation Tests

Set up sample customers and features.

Test cases:

- Customer enters segment
- Customer exits segment
- Customer remains and is refreshed
- Score changed creates history
- Version change creates history
- Batch evaluation counts are correct
- Failed evaluation marks run failed
- Advisory lock prevents duplicate run

## 28.4 Single-Customer Evaluation Tests

Test cases:

- Evaluates only one customer
- Uses changed metric dependencies
- Enters/exits/refreshes correctly
- Does not affect other customers

## 28.5 Audience Builder Tests

Test cases:

- Require all segments
- Require any segment
- Email opt-in suppression
- SMS opt-in suppression
- Employee/fraud/abuse suppression
- Holdout assignment deterministic
- Max audience size respected
- Audience snapshot stored

## 28.6 API Tests

Test cases:

- Create segment
- Create version
- Validate version
- Preview version
- Activate version
- Evaluate segment
- List members
- Get customer segments
- Build audience
- Export audience

---

# 29. Performance Requirements

The system should support:

- At least hundreds of thousands of customers initially
- Segment batch evaluation within acceptable nightly processing window
- Indexed member lookup by customer and segment
- Segment preview without full expensive scans where possible

Performance guidelines:

1. Keep customer-level segmentation based on `customer_features_current`.
2. Add indexes for commonly filtered metrics.
3. Use exists subqueries for dimensioned features.
4. Use temporary tables during evaluation.
5. Evaluate one segment at a time unless the database can handle parallelism.
6. Add pagination to all member APIs.
7. Limit preview sample size.
8. Avoid generating huge reason JSON for non-matching customers.

---

# 30. Error Handling

Use consistent API errors.

Example:

```json
{
  "error": {
    "code": "RULE_VALIDATION_FAILED",
    "message": "Segment rule is invalid.",
    "details": [
      {
        "path": "all[0].metric",
        "code": "UNKNOWN_METRIC",
        "message": "Metric does not exist in registry."
      }
    ]
  }
}
```

Common error codes:

```text
RULE_VALIDATION_FAILED
SEGMENT_NOT_FOUND
SEGMENT_VERSION_NOT_FOUND
SEGMENT_VERSION_INVALID
SEGMENT_ALREADY_ACTIVE
METRIC_NOT_FOUND
INVALID_OPERATOR
EVALUATION_ALREADY_RUNNING
AUDIENCE_BUILD_FAILED
INSUFFICIENT_PERMISSION
```

---

# 31. Implementation Phases

## Phase 1 — Database and Types

Implement:

- Core database migrations
- Metric registry seed
- TypeScript domain types
- Repositories
- Basic API route skeleton

Acceptance criteria:

- Migrations run successfully.
- Metric registry contains default metrics.
- TypeScript compiles.
- Basic segment CRUD works.

## Phase 2 — Rule Validation and Compilation

Implement:

- Rule AST validation
- Metric dependency extraction
- SQL compilation
- Unit tests

Acceptance criteria:

- Invalid rules are rejected.
- Valid rules compile to parameterized SQL.
- Dimensioned metrics compile correctly.
- Unit tests pass.

## Phase 3 — Segment Versions and Preview

Implement:

- Create segment version
- Validate version
- Preview rule
- Preview profile metrics
- Activate version

Acceptance criteria:

- Admin can create draft version.
- Admin can preview segment size.
- Admin can activate valid version.
- Existing active version is retired.

## Phase 4 — Batch Evaluation

Implement:

- Evaluation runs
- Temporary match table
- Current membership updates
- History rows
- Score calculation
- Reason code generation
- Manual evaluation endpoint

Acceptance criteria:

- Evaluating a segment populates current membership.
- Entered/exited/score_changed/version_changed history works.
- Run counts are correct.

## Phase 5 — Realtime Single-Customer Evaluation

Implement:

- Metric dependency table
- Single-customer evaluation endpoint/service
- Trigger integration hook for customer events

Acceptance criteria:

- Purchase/return/profile changes can reevaluate one customer.
- Only relevant dependent segments are evaluated when changed metrics are provided.

## Phase 6 — Audience Builder

Implement:

- Activation audience tables
- Audience creation endpoint
- Segment membership query
- Suppression rules
- Channel opt-in logic
- Deterministic holdout
- Audience export

Acceptance criteria:

- Audience snapshot is stored.
- Suppressed, holdout, and activation members are stored.
- CSV export works.

## Phase 7 — Default Segments and Reporting

Implement:

- Default segment seed service
- Segment health queries
- Customer segment history APIs
- Evaluation run reporting

Acceptance criteria:

- Default segments are available.
- Health metrics return useful values.
- Customer history is visible.

---

# 32. Acceptance Criteria for Complete Build

The build is complete when all of the following are true:

1. Segment CRUD works.
2. Segment versions are immutable after activation.
3. Activating a version retires the previous active version.
4. Rule validation rejects invalid metrics, operators, values, and dimensions.
5. Rule compiler only emits safe parameterized SQL.
6. Segment preview returns count, sample customers, and profile metrics.
7. Batch evaluation updates current membership correctly.
8. Segment history records entered, exited, refreshed, score_changed, and version_changed events.
9. Single-customer realtime evaluation works.
10. Metric dependency extraction works.
11. Default retail segments are seeded.
12. Customer segment APIs work.
13. Segment member APIs work.
14. Activation audience builder works.
15. Channel opt-in suppression works.
16. Employee/fraud/abuse suppression works.
17. Deterministic holdout assignment works.
18. Audience export works.
19. Tests pass.
20. Database indexes are present.
21. All write actions are permission-protected.
22. Evaluation run failures are recorded.
23. The system does not allow arbitrary SQL from business users.

---

# 33. Important Design Rules

## 33.1 Do Not Mix Segment Membership and Contact Permission

A customer can be a VIP even if they are not email opted in.

Keep these separate:

```text
Customer trait: VIP
Channel permission: email_opt_in
Activation eligibility: can receive this campaign now
```

## 33.2 Use Net Revenue, Not Gross Sales

Retail segmentation must account for:

- Returns
- Refunds
- Discounts
- Markdowns
- Cancellations
- Gross margin

A customer who bought 2,000 and returned 1,700 is not equivalent to a customer who kept 2,000.

## 33.3 Version Every Definition Change

Never silently change an active segment definition.

Create a new version.

## 33.4 Keep Inventory Context Out of Static Segments

Do not create thousands of static inventory microsegments.

Use durable customer affinity segments plus activation-time inventory filters.

## 33.5 Always Store Holdouts

Do not simply exclude holdout customers.

Store holdouts in the audience snapshot so incremental lift can be measured.

## 33.6 Explain Membership

Every customer segment membership should have reason codes.

This is critical for:

- Store associates
- Customer support
- Marketing review
- Debugging
- Reporting

---

# 34. Example End-to-End Scenario

## Scenario: Lapsed VIP Running Shoe Winback

### Step 1: Base Segments Exist

Customer belongs to:

```text
lapsed-vip
running-shoe-affinity
full-price-shopper
store-014-loyalist
```

### Step 2: Promotion Team Builds Audience

Request:

```json
{
  "name": "Lapsed VIP Running Shoe Winback",
  "segmentKeys": ["lapsed-vip", "running-shoe-affinity"],
  "requireAllSegments": true,
  "channel": "email",
  "storeIds": ["store-014"],
  "maxAudienceSize": 5000,
  "suppressRecentlyContacted": true,
  "minDaysSinceLastContact": 10,
  "requireRelevantInventory": true,
  "holdoutPercent": 10
}
```

### Step 3: Audience Builder Selects Candidates

Candidates:

```text
Customers in both lapsed-vip and running-shoe-affinity
```

### Step 4: Suppression

Suppress customers who:

```text
email_opt_in = false
employee_flag = true
fraud_risk_flag = true
abuse_risk_flag = true
recently contacted
no relevant inventory if inventory filter is enabled
```

### Step 5: Holdout

Assign 10% deterministic holdout.

### Step 6: Output

Store audience snapshot:

```text
total_candidates = 18,420
eligible_customers = 9,320
holdout_customers = 932
activation_customers = 8,388
```

Promotion engine can now send the campaign while preserving holdout for measurement.

---

# 35. Final Build Checklist

Use this checklist before marking the task complete.

```text
[ ] Migrations created and tested
[ ] Metric registry seeded
[ ] Default segments seeded
[ ] Segment CRUD API implemented
[ ] Segment version API implemented
[ ] Rule validator implemented
[ ] Rule compiler implemented
[ ] Preview service implemented
[ ] Scoring service implemented
[ ] Reason code generation implemented
[ ] Batch evaluation implemented
[ ] Evaluation run logging implemented
[ ] Current membership table updated correctly
[ ] History table updated correctly
[ ] Single-customer evaluation implemented
[ ] Metric dependency extraction implemented
[ ] Audience builder implemented
[ ] Channel suppression implemented
[ ] Deterministic holdout implemented
[ ] Audience export implemented
[ ] Customer segment lookup API implemented
[ ] Segment member API implemented
[ ] Segment history API implemented
[ ] Permissions enforced
[ ] Audit events written
[ ] Unit tests pass
[ ] Integration tests pass
[ ] Performance indexes added
[ ] No arbitrary SQL is accepted from users
[ ] Documentation added for admin/API usage
```

---

# 36. Deliverables

The implementing agent must deliver:

1. PostgreSQL migrations.
2. Seed scripts for metric registry.
3. Seed scripts for default retail segments.
4. TypeScript domain types.
5. Repository layer.
6. Rule validation service.
7. Rule compiler service.
8. Segment CRUD services and APIs.
9. Segment version services and APIs.
10. Segment preview service and API.
11. Segment evaluation service.
12. Single-customer evaluation service.
13. Segment membership services and APIs.
14. Audience builder service and APIs.
15. CSV audience export.
16. Tests for validation, compilation, evaluation, membership history, and audience builder.
17. Operational job or CLI for evaluating active segments.
18. Documentation for running migrations, seeding defaults, and triggering evaluations.

---

# 37. Final Instruction

Build this as a retail customer intelligence segmentation engine with versioned rules, durable membership, explainable reasons, customer scoring, batch and realtime evaluation, and activation audience snapshots.

Do not build a generic CRM.

Do not allow arbitrary SQL.

Do not skip segment versioning.

Do not merge activation eligibility into segment membership.

Do not create static microsegments for every inventory situation.

The final system should let POS, webstore, promotions, inventory, and reporting use a shared, reliable, auditable view of customer intelligence.
