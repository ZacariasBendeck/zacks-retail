# AGENTS.md

## Project context

We are building a new retail system for a physical retail chain + webstore.

Business context:
- About 30 shoe/clothing stores
- Central warehouse
- POS
- Inventory
- PIM
- Purchasing
- Reports
- Future webstore integration

Stack:
- Node
- TypeScript
- Postgres
- Prisma

This is not a traditional B2B CRM. Do not design sales pipelines, leads, opportunities, call logs, or account-manager workflows.

The customer module is a retail customer intelligence module connected to:
- POS
- Webstore
- Promotions
- Inventory
- Customer segmentation
- Customer activation

## Customer import strategy

We are importing directly from RICS CSV files into the new app schema.

Do not make the new app depend on `rics_mirror` for customers.

The import flow should be:

```text
RICS CSV files
  -> validate and normalize
  -> good records inserted into app customer tables
  -> incomplete or unsafe records inserted into import reject/audit tables