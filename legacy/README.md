# Legacy

This folder holds **artifacts of the abandoned RICS → Odoo migration plan**. They are kept in-tree only because the RICS-to-Odoo data cutover is still running in parallel with new Zack's Retail development.

See [../CLAUDE.md](../CLAUDE.md) for project context: the team originally planned to migrate RICS onto Odoo, then changed direction to build **Zack's Retail** from scratch against Postgres + Prisma. Everything under this folder is from the pre-pivot era.

## Contents

| Path | What it is |
|---|---|
| `odoo-addons/` | The Odoo addon `rics_storefront_api` used to bridge a storefront to Odoo. Not touched by the new system. |
| `sqlite-migrations/` | The `NNN_*.{up,down,verify}.sql` triplet migrations that shaped the `apps/api/data/inventory.db` SQLite staging database during the RICS→Odoo move. The runtime `MIGRATIONS[]` array in [../apps/api/src/db/database.ts](../apps/api/src/db/database.ts) still applies these on API startup. |
| `MIGRATION_RUNBOOK.md` | Dev/staging/prod apply+rollback instructions for the SQLite migrations. Only relevant to the legacy stack. |

## Rules

- **No new code here.** Bug fixes to keep the RICS→Odoo cutover running are acceptable; new features are not.
- New inventory features target the **new Zack's Retail Postgres DB via Prisma** — see [../workflows/add_migration.md](../workflows/add_migration.md).
- Don't import from this folder into active Zack's Retail code. The legacy code path is self-contained; keep it that way.

## Removal plan

This whole folder is deleted once:

1. RICS data has been fully migrated into the new Zack's Retail Postgres DB.
2. The runtime `MIGRATIONS[]` array in [../apps/api/src/db/database.ts](../apps/api/src/db/database.ts) is removed and `apps/api` is reading from Postgres via Prisma.
3. [../apps/api/data/inventory.db](../apps/api/data/inventory.db) is no longer the source of truth for anything.

Until then, everything here is read-mostly and owned by whoever is driving the cutover.
