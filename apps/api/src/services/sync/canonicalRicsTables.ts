/**
 * Canonical RICS MDB allowlist for the `pnpm sync:rics` ETL.
 *
 * The `E:/data/rics-mdbs/` folder contains ~77 files — real RICS tables,
 * nightly backups (`*.backup-YYYY-MM-DD-*.MDB`), dated copies
 * (`RITRANS011926.MDB`, `RITRANS - copia.MDB`), per-user scratch files
 * (`USERGELU.MDB`, `USERZULMA.MDB`), and physical-inventory temp files
 * (`JOELINVDETTEMP.MDB`, etc.). Auto-discovery would sweep all of it in,
 * so the ETL takes this hand-maintained allowlist instead.
 *
 * Each entry lists the MDB file and the tables inside it we want to mirror.
 * Table names match RICS casing; the ETL snake_cases them when generating
 * Postgres table names (`InventoryMaster` -> `inventory_master`).
 *
 * Adding a table: append a new row. Removing one: delete it here and the
 * next reload will drop the Postgres table (via the staging-schema swap).
 */
export interface CanonicalMdb {
  /** MDB file name, relative to RICS_DB_DIR. */
  file: string;
  /** RICS table names to pull. Case-sensitive match to what the MDB exposes. */
  tables: string[];
}

export const CANONICAL_MDBS: CanonicalMdb[] = [
  { file: 'RIINVMAS.MDB', tables: ['InventoryMaster', 'InvCatalog'] },
  { file: 'RICATEG.MDB', tables: ['Categories'] },
  { file: 'RIDEPT.MDB', tables: ['Departments', 'Sectors'] },
  { file: 'RIVENDOR.MDB', tables: ['Vendor Master', 'Vendor Accounts'] },
  { file: 'RISIZE.MDB', tables: ['SizeTypes', 'NRMACodes'] },
  { file: 'RIGROUP.MDB', tables: ['GroupCodes', 'Keywords', 'MarketingCode'] },
  { file: 'RISTORE.MDB', tables: ['StoreMaster'] },
  { file: 'RISLSPSN.MDB', tables: ['Salespeople', 'DeptOverride', 'SalespeopleSales'] },
  { file: 'RIINVHIS.MDB', tables: ['InvHis'] },
  { file: 'RIINVQUA.MDB', tables: ['Inventory Quantities'] },
  { file: 'RIINVCHG.MDB', tables: ['InvChanges'] },
  {
    file: 'RITRNSSV.MDB',
    tables: [
      'Payouts',
      'SalesBatches',
      'TicketDetail',
      'TicketHeader',
      'TicketTender',
      'TimeClock',
      'Transmitted',
    ],
  },
  { file: 'RIRETURN.MDB', tables: ['ReturnCodes'] },
  // RISEMF.MDB intentionally omitted. The file does open in ACE.OLEDB.12.0
  // (contrary to the legacy comment in SeasonRepository.ts), but its contents
  // are 19 "SEMF <domain>" tables that don't map 1:1 to a "Seasons" table the
  // app expects. Add targeted entries here once the consumer surface is clear.
];

/**
 * Turn a RICS identifier (table or column name) into a Postgres-safe
 * snake_case form. Handles:
 *  - CamelCase  -> snake_case
 *  - Spaces and hyphens -> underscores
 *  - Consecutive caps   -> insert underscore before the last cap
 *
 * `InventoryMaster` -> `inventory_master`
 * `Vendor Master`   -> `vendor_master`
 * `NRMACodes`       -> `nrma_codes`
 * `Short Name`      -> `short_name`
 */
export function toSnakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[\s\-]+/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}
