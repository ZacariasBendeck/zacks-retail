# Customer KPI Module — Frontend Design Spec
# Scope: Frontend Only
# Target: Retail Chain + Webstore
# Stack Assumption: React + TypeScript + Tailwind

---

## 1. Goal

Design a beautiful, fast, executive-friendly Customer KPI frontend module that helps users answer:

- Who are our best customers?
- Who is becoming inactive?
- Which customers only buy on discount?
- Which customers buy online vs in-store?
- Which stores have the strongest customer loyalty?
- Which customers should receive promotions?

This module is not a traditional CRM. It is a retail customer intelligence dashboard.

---

## 2. Navigation Placement

Add a new main sidebar section:

```txt
Clientes
  Dashboard
  Clientes
  Segmentos
  Riesgo de Abandono
  Clientes VIP
  Sensibilidad a Descuentos

Recommended sidebar label:

Customer Intelligence

Spanish UI option:

Inteligencia de Clientes
3. Main Pages

The module should have these frontend routes:

/customers/dashboard
/customers
/customers/:id
/customers/segments
/customers/churn-risk
/customers/vip
/customers/discount-sensitive
4. Page 1 — Customer KPI Dashboard
Route
GET /customers/dashboard
Purpose

Executive overview of customer health.

Layout
--------------------------------------------------
Customer Intelligence
Subtitle: Understand customer value, loyalty, and risk
--------------------------------------------------

[ KPI CARD ] [ KPI CARD ] [ KPI CARD ] [ KPI CARD ]

[ Customer Value Chart        ] [ Churn Risk Chart ]

[ RFM Distribution            ] [ Channel Split     ]

[ Top Customers Table                             ]

[ At-Risk Customers Table                         ]
4.1 Top KPI Cards

Use large, clean cards.

Card 1: Total Customers
Total Customers
124,850
+8.4% vs last 90 days
Card 2: Active Customers
Active Customers
42,180
33.8% of customer base
Card 3: Average LTV
Average LTV
L 2,840
Across all identified customers
Card 4: High Churn Risk
High Churn Risk
9,420
Needs reactivation campaign
4.2 Dashboard Visual Style

Use:

White or soft-gray background
Rounded cards
Subtle shadows
Clear hierarchy
No heavy borders
Plenty of spacing
Color used only for status/risk

Suggested Tailwind style:

className="rounded-2xl border bg-white p-6 shadow-sm"
4.3 Dashboard Charts
Customer Value Chart

Shows customer count by LTV bands.

LTV Bands:
- L 0–500
- L 501–1,500
- L 1,501–3,000
- L 3,001–7,500
- L 7,500+
Churn Risk Chart

Donut or stacked bar:

LOW
MEDIUM
HIGH
RFM Distribution

Heatmap or grouped cards:

VIP: R5 F5 M5
Loyal: High F + Medium/High M
New: High R + Low F
At Risk: Low R + High M
Lost: Low R + Low F
Channel Split
Store Only
Online Only
Omnichannel
5. Page 2 — Customer List
Route
/customers
Purpose

Searchable customer database with KPI columns.

Layout
--------------------------------------------------
Customers
Search, filter, and compare customer behavior
--------------------------------------------------

[ Search customer...              ]

[ Filter Bar ]
Store | Risk | Segment | Channel | RFM | LTV Range | Last Purchase

[ Customer Table ]
5.1 Filters

Required filters:

Store
Segment
Churn Risk
Channel
RFM Score
Last Purchase Date
LTV Range
Discount Sensitivity

Advanced filters:

Orders last 90 days
Average order value
Primary category
Online ratio
Dormant only
VIP only
5.2 Customer Table Columns
Customer
Primary Store
LTV
Orders
AOV
Last Purchase
Recency
Risk
RFM
Discount Ratio
Channel
Actions

Example row:

Maria Lopez
City Mall TGU
L 18,450
22
L 838
2026-04-12
12 days
LOW
5-5-4
18%
Store
View
5.3 Table Design Requirements

The table must support:

Column reorder
Column visibility toggle
Sorting
Saved views
Sticky header
Pagination
Export CSV
Row click to detail page

Saved view examples:

VIP Customers
High Risk Customers
Promo Sensitive Customers
Online Buyers
Dormant Customers
Top Customers by Store
6. Page 3 — Customer Detail Page
Route
/customers/:id
Purpose

One-page customer profile with all KPI intelligence.

Layout
--------------------------------------------------
[ Customer Name ]           [ Risk Badge ] [ Segment Badge ]
Phone / Email / Customer ID
Primary Store
--------------------------------------------------

[ Lifetime Value ] [ Orders ] [ AOV ] [ Recency ]

[ Customer Timeline Chart                         ]

[ Behavior Cards                                  ]

[ Purchase History Table                          ]

[ Recommended Actions                             ]
6.1 Header

Example:

Maria Lopez
VIP Customer · Low Risk
Primary Store: City Mall TGU
Last Purchase: 12 days ago

Badges:

VIP
Loyal
At Risk
Dormant
Promo Sensitive
Omnichannel
6.2 KPI Cards

Cards should be large and easy to read:

Lifetime Value
L 18,450

Total Orders
22

Average Order Value
L 838

Recency
12 days

Secondary KPIs:

Margin Value
Discount Ratio
Store Loyalty
Online Ratio
Orders 90d
Avg Days Between Orders
6.3 Customer Timeline

Show purchase history visually:

Jan    Feb    Mar    Apr
|      ||     |      ||

Better version:

Line chart for spend over time
Dots for transactions
Tooltip with transaction details

Tooltip:

April 12, 2026
City Mall TGU
L 1,280
2 items
Discount: 20%
6.4 Behavior Section

Use 4 cards:

Store Loyalty
Primary Store
City Mall TGU

Store Loyalty
82% of purchases
Discount Sensitivity
Discount Ratio
18%

Full-price leaning customer
Channel Preference
Channel
Store Buyer

Online Ratio
0%
Buying Rhythm
Average Cycle
34 days

Expected next purchase:
May 16, 2026
6.5 Purchase History Table

Columns:

Date
Store / Channel
Transaction #
Items
Net Amount
Discount
Margin

Row click should open transaction detail.

6.6 Recommended Actions

This is very important.

Show action cards based on KPI logic:

Recommended Action

This customer is VIP and low risk.
Do not send aggressive discounts.
Recommended campaign:
Early access / new arrivals / exclusive preview.

For high-risk customer:

Recommended Action

This customer has not purchased in 145 days.
Previously bought every 38 days.
Recommended campaign:
Win-back offer with limited-time discount.

For discount-sensitive customer:

Recommended Action

This customer buys mostly during promotions.
Recommended campaign:
Controlled discount with excluded premium SKUs.
7. Page 4 — Segments Page
Route
/customers/segments
Purpose

Show automatically generated customer groups.

Layout
--------------------------------------------------
Customer Segments
Automatically grouped by value, frequency, and risk
--------------------------------------------------

[ Segment Cards Grid ]

[ Segment Table ]
Segment Cards
VIP Customers
2,840 customers
High value, frequent buyers
Avg LTV: L 14,800
At Risk
9,420 customers
Previously active, now slowing down
Avg LTV: L 4,200
Dormant
18,300 customers
No purchase in 120+ days
Promo Sensitive
21,500 customers
Majority of purchases discounted
Omnichannel Customers
3,200 customers
Buy both online and in-store
Segment Detail Table

Columns:

Segment
Customers
Avg LTV
Avg Orders
Avg AOV
Avg Recency
Churn Risk
Recommended Action
8. Page 5 — Churn Risk Page
Route
/customers/churn-risk
Purpose

Operational screen for reactivation campaigns.

Layout
--------------------------------------------------
Churn Risk
Customers who are slowing down or disappearing
--------------------------------------------------

[ Risk Summary Cards ]

[ Risk Matrix ]

[ High Risk Customer Table ]
Risk Summary Cards
High Risk
9,420

Medium Risk
18,870

Dormant
24,120

Recoverable VIPs
1,130
Risk Matrix

Recommended matrix:

                Customer Value
              Low    Mid    High
Risk HIGH     Low    Med    Urgent
Risk MED      Low    Med    Watch
Risk LOW      Healthy Healthy VIP

Focus attention on:

High Value + High Risk

This group should visually stand out.

9. Page 6 — VIP Customers Page
Route
/customers/vip
Purpose

Protect and grow the best customers.

Main Table Columns
Customer
Primary Store
LTV
Margin Value
Orders
AOV
Last Purchase
RFM
Discount Ratio
Recommended Action

Recommended action examples:

Early access
Personal WhatsApp
No discount needed
Invite to private sale
New arrivals message

Important:

VIP page should not look like a discount page. It should feel premium.

10. Page 7 — Discount Sensitivity Page
Route
/customers/discount-sensitive
Purpose

Identify customers who only buy on discount.

Layout
--------------------------------------------------
Discount Sensitivity
Understand who buys full-price vs promotion-only
--------------------------------------------------

[ Discount Distribution Chart ]

[ Customer Table ]
Discount Bands
0–20% discount ratio: Full-price leaning
21–50%: Balanced
51–80%: Promo sensitive
81–100%: Promotion-only
Table Columns
Customer
LTV
Orders
Discount Ratio
Avg Discount
Margin Value
Last Purchase
Primary Store
Recommended Campaign
11. UI Components Required

Implement reusable components:

CustomerKpiCard
CustomerRiskBadge
CustomerSegmentBadge
RfmScoreBadge
CustomerValueChart
ChurnRiskChart
ChannelSplitChart
CustomerTimeline
CustomerMetricsTable
CustomerFilterBar
SavedViewSelector
RecommendedActionCard
12. Badge Design
Risk Badge
LOW      green
MEDIUM   amber
HIGH     red
Segment Badge
VIP              purple
Loyal            blue
At Risk          orange
Dormant          gray
Promo Sensitive  yellow
Omnichannel      teal
RFM Badge

Display as:

R5 F4 M5

Better visual:

[ R 5 ] [ F 4 ] [ M 5 ]
13. Empty States
No Metrics Yet
No customer metrics available yet.

Metrics are generated from completed customer transactions.
Run the customer metrics recompute job to populate this dashboard.

Button:

Recompute Metrics
Customer Has No Transactions
This customer has no purchase history yet.

KPIs will appear after the first completed transaction.
14. Loading States

Use skeleton cards:

[ skeleton card ] [ skeleton card ] [ skeleton card ]
[ skeleton chart                    ]
[ skeleton table                    ]

Do not show blank pages.

15. Error States

Example:

Unable to load customer metrics.

Please try again or contact support if the issue continues.

Include:

Retry
16. API Integration

Frontend should consume:

GET /customers/metrics/summary
GET /customers
GET /customers/:id/metrics
GET /customers/:id
GET /customers/:id/transactions
POST /customers/:id/recompute-metrics
POST /customers/recompute-metrics

Suggested additional frontend-friendly endpoints:

GET /customers/segments
GET /customers/churn-risk
GET /customers/vip
GET /customers/discount-sensitive
GET /customers/:id/recommendations
17. Recommended Backend Response Shapes
Summary Endpoint
{
  "total_customers": 124850,
  "active_customers": 42180,
  "dormant_customers": 24120,
  "avg_lifetime_value": 2840,
  "high_churn_risk": 9420,
  "churn_distribution": {
    "LOW": 78000,
    "MEDIUM": 37430,
    "HIGH": 9420
  },
  "channel_distribution": {
    "store_only": 110000,
    "online_only": 9850,
    "omnichannel": 5000
  }
}
Customer Detail Endpoint
{
  "customer": {
    "id": "uuid",
    "name": "Maria Lopez",
    "phone": "+50499999999",
    "email": "maria@example.com",
    "primary_store": "City Mall TGU"
  },
  "metrics": {
    "lifetime_value": 18450,
    "total_orders": 22,
    "avg_order_value": 838,
    "margin_value": 7200,
    "orders_90d": 5,
    "recency_days": 12,
    "discount_ratio": 0.18,
    "store_loyalty_ratio": 0.82,
    "online_ratio": 0,
    "churn_risk": "LOW",
    "r_score": 5,
    "f_score": 4,
    "m_score": 5
  },
  "recommendation": {
    "type": "VIP_RETENTION",
    "title": "Protect this VIP customer",
    "message": "Do not send aggressive discounts. Use early access or new arrivals instead."
  }
}
18. Visual Design Direction

The module should feel:

Modern
Premium
Analytical
Retail-focused
Fast
Executive-friendly

Avoid:

Old CRM look
Dense accounting tables
Too many borders
Tiny text
Generic dashboard colors
Overloaded charts
19. Design Inspiration

Use a layout similar to:

Modern SaaS analytics dashboard
Premium banking dashboard
Shopify-style commerce reporting
Stripe-style clean cards
Linear-style simple UI
20. Color Usage

Use neutral base:

Background: #F8FAFC
Cards: #FFFFFF
Text Primary: #0F172A
Text Secondary: #64748B
Borders: #E2E8F0

Status colors:

Low Risk: Green
Medium Risk: Amber
High Risk: Red
VIP: Purple
Dormant: Slate
Omnichannel: Teal

Do not overuse color. Let the data stand out.

21. Typography

Recommended:

Page title: text-2xl or text-3xl font-semibold
Section title: text-lg font-semibold
KPI value: text-3xl font-bold
Table text: text-sm
Helper text: text-xs text-muted
22. Page Header Pattern

Every page should use this header pattern:

<div className="mb-6 flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-semibold tracking-tight">
      Customer Intelligence
    </h1>
    <p className="text-sm text-muted-foreground">
      Understand customer value, loyalty, and churn risk.
    </p>
  </div>

  <div className="flex gap-2">
    <Button variant="outline">Export</Button>
    <Button>Recompute Metrics</Button>
  </div>
</div>
23. Customer Dashboard Wireframe
┌─────────────────────────────────────────────────────────────┐
│ Customer Intelligence                         Export  Recompute │
│ Understand customer value, loyalty, and churn risk.           │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Total        │ │ Active       │ │ Avg LTV      │ │ High Risk    │
│ 124,850      │ │ 42,180       │ │ L 2,840      │ │ 9,420        │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

┌───────────────────────────────┐ ┌───────────────────────────┐
│ Customer Value Distribution   │ │ Churn Risk                 │
│ chart                         │ │ chart                      │
└───────────────────────────────┘ └───────────────────────────┘

┌───────────────────────────────┐ ┌───────────────────────────┐
│ RFM Distribution              │ │ Channel Split              │
│ heatmap/cards                 │ │ chart                      │
└───────────────────────────────┘ └───────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Top Customers                                                │
│ table                                                        │
└─────────────────────────────────────────────────────────────┘
24. Customer Detail Wireframe
┌─────────────────────────────────────────────────────────────┐
│ Maria Lopez                                  VIP   LOW RISK   │
│ +504 9999-9999 · City Mall TGU · Last purchase 12 days ago    │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ LTV          │ │ Orders       │ │ AOV          │ │ Recency      │
│ L 18,450     │ │ 22           │ │ L 838        │ │ 12 days      │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Purchase Timeline                                            │
│ chart                                                        │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Store Loyalty│ │ Discount     │ │ Channel      │ │ Buying Cycle │
│ 82%          │ │ 18%          │ │ Store        │ │ 34 days      │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Recommended Action                                           │
│ Protect this VIP customer. Use early access, not discounts.  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Purchase History                                             │
│ table                                                        │
└─────────────────────────────────────────────────────────────┘
25. Implementation Deliverables

The frontend agent must implement:

Customer Intelligence sidebar navigation
Customer KPI dashboard page
Customer list page
Customer detail page
Segments page
Churn risk page
VIP customers page
Discount sensitivity page
Reusable KPI cards
Reusable badges
Filter bar
Saved table views
Loading states
Empty states
Error states
API integration layer
Responsive layout
26. Completion Criteria

The frontend is complete when:

Dashboard loads from API
Customer table supports filtering/sorting
Customer detail page shows all KPIs
Risk and segment badges are visually clear
Churn page identifies high-value at-risk customers
VIP page protects premium customers from unnecessary discounts
Discount sensitivity page separates full-price buyers from promo buyers
UI looks modern, premium, and retail-focused
All pages have loading, empty, and error states