# Customer CSV Import Specification

## Purpose

Import existing RICS customer data directly from CSV files into the new app customer schema.

The import should elevate usable customer data immediately into clean app tables.

Incomplete, unsafe, or untrustworthy rows should not become app customers. They should be stored in import reject/audit tables.

---

# Import Philosophy

The import flow is:

```text
RICS CSV files
  -> validate
  -> normalize
  -> match existing customer
  -> create or update app customer records
  -> store rejected rows in customer_import_reject
```

Do not import into `rics_mirror` first.

Do not make the app depend on `rics_mirror`.

---

# Source Files

## Customer.csv

RICS fields:

```text
Account
Code
Name
Gender
DateAdded
Birthday
Extra_01
Extra_02
Extra_03
Extra_04
Extra_05
Extra_06
Status
Comment
DateLastChanged
```

## MailListNames.csv

RICS fields:

```text
Account
Name
Addr1
Addr2
City
State
Zip
CreditLimit
CurrBal
CredSlip
Status
DateAdded
DateLstPurch
PlanNum
PlanCount
PlanDollars
PlanLastCred
PlanCredBal
NonTaxable
EMail
Extra_01
Extra_02
Extra_03
Extra_04
Extra_05
Extra_06
QtySales_01
QtySales_02
QtySales_03
QtySales_04
DollarSales_01
DollarSales_02
DollarSales_03
DollarSales_04
County
Comment
ChangeTo
DateLastChanged
```

---

# Join Rule

Preferred join:

```text
Customer.Account = MailListNames.Account
```

Rules:

- Treat `Customer.csv` as the primary customer source.
- Treat `MailListNames.csv` as enrichment.
- If a MailListNames row has no matching Customer row, it may still be imported if it has a usable identifier.
- If the only useful data is address/comment without identity, reject it.

---

# Honduran ID Normalization

Honduran ID may come from `Account`, `Code`, or another known field depending on current RICS usage.

Normalize by:

```text
1. Remove spaces
2. Remove hyphens
3. Remove dots
4. Keep only digits
```

Example:

```text
0801-1990-12345 -> 0801199012345
```

Rules:

- Store original value in `honduran_id_raw`.
- Store normalized value in `honduran_id_normalized`.
- Do not assume every customer has a Honduran ID.
- Do not auto-merge conflicting Honduran IDs.

---

# Minimum Acceptance Rule

Accept a customer only if at least one usable identifier exists:

```text
Account
Code
Honduran ID
Email
Phone
```

Reject rows when:

```text
- Blank row
- Name only, with no usable identifier
- No usable Account, Code, Honduran ID, Email, or Phone
- Conflicting duplicate identity
- Same email/phone points to different customers with incompatible Honduran IDs
- Unsafe record where identity cannot be trusted
```

---

# Matching Order

For each imported customer candidate:

```text
1. Match by honduran_id_normalized
2. If no match, match by rics_account
3. If no match, match by rics_code
4. If no match, match by normalized email
5. If no match, match by normalized phone if available
6. If still no match, create new customer
```

Important:

- Honduran ID is strongest.
- RICS Account and Code are strong legacy identifiers.
- Email and phone are useful but weaker.
- Never auto-merge two customers with different Honduran IDs unless manually approved.

---

# Data Mapping

## Customer.csv to customer

```text
Account -> customer.rics_account
Code -> customer.rics_code
Name -> customer.full_name
Gender -> customer.gender
Birthday -> customer.birth_date
Status -> customer.status
DateAdded -> customer.rics_date_added
DateLastChanged -> customer.rics_date_last_changed
```

Also:

```text
Account or Code -> customer.honduran_id_raw, if that field contains Honduran ID
Normalized Honduran ID -> customer.honduran_id_normalized
DateAdded -> customer.first_seen_at, if first_seen_at is empty
DateLastChanged -> customer.last_seen_at, if appropriate
```

## Customer.csv to customer_legacy_profile

```text
Extra_01 -> customer_extra_01
Extra_02 -> customer_extra_02
Extra_03 -> customer_extra_03
Extra_04 -> customer_extra_04
Extra_05 -> customer_extra_05
Extra_06 -> customer_extra_06
Comment -> customer_comment
```

---

## MailListNames.csv to customer_contact

```text
EMail -> customer_contact
```

Contact mapping:

```text
contact_type = email
value = EMail
normalized_value = lower(trim(EMail))
is_primary = true, if no other primary email exists
is_verified = false
accepts_marketing = false
source = rics_csv
```

---

## MailListNames.csv to customer_address

```text
Addr1 -> addr1
Addr2 -> addr2
City -> city
State -> state
County -> county
Zip -> zip
country -> HN
source -> rics_csv
```

Only create address row if at least one address field has a value.

---

## MailListNames.csv to customer_financial_profile

```text
CreditLimit -> credit_limit
CurrBal -> current_balance
CredSlip -> credit_slip_balance
NonTaxable -> non_taxable
PlanNum -> plan_num
PlanCount -> plan_count
PlanDollars -> plan_dollars
PlanLastCred -> plan_last_credit_at
PlanCredBal -> plan_credit_balance
```

Only create financial profile if at least one financial field has meaningful value.

---

## MailListNames.csv to customer_sales_summary_legacy

```text
DateLstPurch -> date_last_purchase
QtySales_01 -> qty_sales_01
QtySales_02 -> qty_sales_02
QtySales_03 -> qty_sales_03
QtySales_04 -> qty_sales_04
DollarSales_01 -> dollar_sales_01
DollarSales_02 -> dollar_sales_02
DollarSales_03 -> dollar_sales_03
DollarSales_04 -> dollar_sales_04
```

Only create sales summary row if at least one sales summary field has meaningful value.

---

## MailListNames.csv to customer_legacy_profile

```text
Extra_01 -> mail_extra_01
Extra_02 -> mail_extra_02
Extra_03 -> mail_extra_03
Extra_04 -> mail_extra_04
Extra_05 -> mail_extra_05
Extra_06 -> mail_extra_06
Comment -> mail_comment
ChangeTo -> change_to
```

---

# Identity Rows to Create

Create `customer_identity` records for every usable identifier:

```text
honduran_id
rics_account
rics_code
email
phone
```

Examples:

```text
identity_type = honduran_id
identity_value = original Honduran ID
normalized_value = normalized Honduran ID
is_primary = true
```

```text
identity_type = rics_account
identity_value = Account
normalized_value = trimmed Account
is_primary = false
```

```text
identity_type = rics_code
identity_value = Code
normalized_value = trimmed Code
is_primary = false
```

```text
identity_type = email
identity_value = EMail
normalized_value = lower(trim(EMail))
is_primary = false
```

Rules:

- Do not create identity rows for blank values.
- Do not create duplicate identity rows.
- If an identity already exists for another customer, reject or flag the row unless it is clearly safe to update.

---

# Import Batch Behavior

Every import run must create a `customer_import_batch`.

Track:

```text
source
file_name
started_at
finished_at
total_rows
created_count
updated_count
skipped_count
rejected_count
```

At the end of the import:

- Update counts.
- Set `finished_at`.

---

# Reject Behavior

Rejected rows must be inserted into `customer_import_reject`.

Required fields:

```text
batch_id
source_file
row_number
account
code
name
honduran_id_raw
honduran_id_normalized
email
reject_reason
raw_row
created_at
```

Common reject reasons:

```text
blank_row
missing_identifier
invalid_email
conflicting_honduran_id
duplicate_identity_conflict
unsafe_match
parse_error
```

Do not silently discard rows.

---

# Update Behavior

If an existing customer is matched:

- Update missing clean fields when imported data is better.
- Do not overwrite good existing data with blank imported data.
- Do not overwrite manually corrected app data unless the import is explicitly allowed to.
- Add missing identity/contact/address/profile rows where appropriate.
- Preserve legacy extras and comments.

---

# Status Handling

Map RICS status into app status carefully.

Default:

```text
null/blank -> active
active-like value -> active
inactive-like value -> inactive
blocked/bad/deleted-like value -> blocked or inactive
```

If status meaning is unclear:

```text
preserve original RICS status in legacy profile or notes
default customer.status = active
```

---

# Done Criteria

The customer import task is done only when:

```text
- Prisma schema/models exist
- Migration exists
- Import batch table works
- Reject table works
- Customer import service parses Customer.csv
- Customer import service parses MailListNames.csv
- Join by Account works
- Honduran ID normalization is tested
- Email normalization is tested
- Duplicate matching is tested
- Reject logic is tested
- Existing tests pass
```