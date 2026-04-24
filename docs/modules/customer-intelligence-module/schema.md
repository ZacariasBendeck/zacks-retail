# Customer Module Schema

## Purpose

This module manages retail customer intelligence for a physical retail chain and webstore.

This is not a traditional B2B CRM. Do not design sales pipelines, leads, opportunities, account managers, or call-log workflows.

The customer schema must support:

- POS customers
- Webstore customers
- Honduran ID-based legacy customers
- Promotion targeting
- Customer segmentation
- Customer KPIs
- Future loyalty workflows

---

# Canonical Tables

Implement these tables in the app schema:

- customer
- customer_identity
- customer_contact
- customer_address
- customer_legacy_profile
- customer_financial_profile
- customer_sales_summary_legacy
- customer_import_batch
- customer_import_reject

---

# 1. customer

The main clean customer record.

```sql
customer
- id uuid primary key
- honduran_id_raw text nullable
- honduran_id_normalized text nullable
- full_name text nullable
- gender text nullable
- birth_date date nullable
- status text default 'active'
- source text default 'rics_csv'
- first_seen_at timestamptz nullable
- last_seen_at timestamptz nullable
- imported_from_batch_id uuid nullable
- rics_account text nullable
- rics_code text nullable
- rics_date_added timestamptz nullable
- rics_date_last_changed timestamptz nullable
- created_at timestamptz default now()
- updated_at timestamptz default now()
```

Required indexes:

```sql
unique(honduran_id_normalized) where honduran_id_normalized is not null;
unique(rics_account) where rics_account is not null;
unique(rics_code) where rics_code is not null;
```

Important rules:

- Internal primary key must be UUID.
- Honduran ID is an important identity field, but not the primary key.
- Not every future customer will have a Honduran ID.
- Do not store KPIs directly in this table.

---

# 2. customer_identity

Stores all identifiers for a customer.

```sql
customer_identity
- id uuid primary key
- customer_id uuid references customer(id)
- identity_type text not null
- identity_value text not null
- normalized_value text not null
- source text default 'rics_csv'
- is_primary boolean default false
- created_at timestamptz default now()
```

Constraint:

```sql
unique(identity_type, normalized_value)
```

Allowed identity types:

```text
honduran_id
rics_account
rics_code
email
phone
webstore_user_id
```

Rules:

- Create one identity row for every usable identifier.
- Do not create duplicate identity rows.
- Never auto-merge two customers with different Honduran IDs unless manually approved.

---

# 3. customer_contact

Stores communication points.

```sql
customer_contact
- id uuid primary key
- customer_id uuid references customer(id)
- contact_type text not null
- value text not null
- normalized_value text nullable
- is_primary boolean default false
- is_verified boolean default false
- accepts_marketing boolean default false
- source text default 'rics_csv'
- created_at timestamptz default now()
```

Allowed contact types:

```text
email
phone
whatsapp
```

Rules:

- Having a phone or email does not mean the customer has consented to marketing.
- Marketing consent should be handled separately later if needed.
- For now, imported RICS contacts should default to `accepts_marketing = false` unless explicitly known.

---

# 4. customer_address

Stores customer address data.

```sql
customer_address
- id uuid primary key
- customer_id uuid references customer(id)
- addr1 text nullable
- addr2 text nullable
- city text nullable
- state text nullable
- county text nullable
- zip text nullable
- country text default 'HN'
- source text default 'rics_csv'
- created_at timestamptz default now()
```

Rules:

- RICS address data should be preserved but not overinterpreted.
- Default country is Honduras: `HN`.

---

# 5. customer_legacy_profile

Stores old RICS fields that may be useful but should not pollute the clean customer table.

```sql
customer_legacy_profile
- id uuid primary key
- customer_id uuid references customer(id)
- customer_extra_01 text nullable
- customer_extra_02 text nullable
- customer_extra_03 text nullable
- customer_extra_04 text nullable
- customer_extra_05 text nullable
- customer_extra_06 text nullable
- mail_extra_01 text nullable
- mail_extra_02 text nullable
- mail_extra_03 text nullable
- mail_extra_04 text nullable
- mail_extra_05 text nullable
- mail_extra_06 text nullable
- customer_comment text nullable
- mail_comment text nullable
- change_to text nullable
- created_at timestamptz default now()
```

Rules:

- Do not place `Extra_01` to `Extra_06` directly on `customer`.
- Preserve comments and extra fields here for later review.

---

# 6. customer_financial_profile

Stores RICS customer account financial fields.

```sql
customer_financial_profile
- id uuid primary key
- customer_id uuid references customer(id)
- credit_limit numeric(18,4) nullable
- current_balance numeric(18,4) nullable
- credit_slip_balance numeric(18,4) nullable
- non_taxable boolean default false
- plan_num smallint nullable
- plan_count smallint nullable
- plan_dollars numeric(18,4) nullable
- plan_last_credit_at timestamptz nullable
- plan_credit_balance numeric(18,4) nullable
- created_at timestamptz default now()
```

Rules:

- These are legacy financial/account fields.
- Do not mix them into the main customer table.
- Future customer credit/account features should be designed separately before relying on these fields operationally.

---

# 7. customer_sales_summary_legacy

Stores RICS historical customer sales summary fields.

```sql
customer_sales_summary_legacy
- id uuid primary key
- customer_id uuid references customer(id)
- date_last_purchase timestamptz nullable
- qty_sales_01 integer nullable
- qty_sales_02 integer nullable
- qty_sales_03 integer nullable
- qty_sales_04 integer nullable
- dollar_sales_01 numeric(18,4) nullable
- dollar_sales_02 numeric(18,4) nullable
- dollar_sales_03 numeric(18,4) nullable
- dollar_sales_04 numeric(18,4) nullable
- created_at timestamptz default now()
```

Rules:

- These are legacy summary fields only.
- Future customer KPIs should come from actual POS and webstore transactions.
- Do not treat these fields as the final customer KPI system.

---

# 8. customer_import_batch

Tracks each import run.

```sql
customer_import_batch
- id uuid primary key
- source text default 'rics_csv'
- file_name text not null
- started_at timestamptz default now()
- finished_at timestamptz nullable
- total_rows integer default 0
- created_count integer default 0
- updated_count integer default 0
- skipped_count integer default 0
- rejected_count integer default 0
```

Rules:

- Every CSV import must create an import batch.
- Import counts must be updated at the end of the run.
- This table is for auditability.

---

# 9. customer_import_reject

Stores rows that should not enter the clean customer schema.

```sql
customer_import_reject
- id uuid primary key
- batch_id uuid references customer_import_batch(id)
- source_file text not null
- row_number integer not null
- account text nullable
- code text nullable
- name text nullable
- honduran_id_raw text nullable
- honduran_id_normalized text nullable
- email text nullable
- reject_reason text not null
- raw_row jsonb not null
- created_at timestamptz default now()
```

Rules:

- Do not silently discard rejected rows.
- Store the raw row JSON.
- Rejects are not application customers.
- Rejects can be reviewed later and re-imported if needed.

---

# Design Rules

## Do not create one giant customer table

Keep separate:

- Core identity
- Identifiers
- Contacts
- Addresses
- Legacy fields
- Financial fields
- Legacy sales summary
- Import audit data

## Do not depend on rics_mirror

The customer module imports directly from CSV into the app schema.

`rics_mirror` may exist as backup, but the app must not depend on it for customer functionality.

## Do not build B2B CRM features

Avoid:

- Leads
- Opportunities
- Pipelines
- Sales rep ownership
- Call logs
- Account manager workflow

This module is for retail customer intelligence.

## Future customer KPIs

Do not store future KPIs directly on `customer`.

Future KPI tables should be separate, for example:

```text
customer_kpi_snapshot
customer_segment
customer_segment_membership
promotion_activation
```