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
  // RITRNSSV.TimeClock is always empty on this install — the live data lives in
  // RITRNSTC.TimeClock (49k rows). Only one can claim `rics_mirror.time_clock`,
  // so RITRNSTC wins; RITRNSSV drops TimeClock from its table list.
  {
    file: 'RITRNSSV.MDB',
    tables: [
      'Payouts',
      'SalesBatches',
      'TicketDetail',
      'TicketHeader',
      'TicketTender',
      'Transmitted',
    ],
  },
  { file: 'RIRETURN.MDB', tables: ['ReturnCodes'] },

  // ---- Added 2026-04-23 ---- /index-knowledge-unrelated batch
  // Canonical data surfaced by the RICSWIN-wide MDB scan. All row counts as
  // of scan date; see `apps/api/scripts/scan-mdbs.ts` for how these were found.

  // Barcode → SKU lookup. 840k rows; required for POS scan + barcode parity.
  { file: 'RIUPC.MDB', tables: ['UPC Cross Reference'] },

  // Purchase Orders: headers + lines. Purchasing module depends on these.
  // AsnCartonHead / AsnCartonDet cover Advanced Shipping Notice receiving.
  { file: 'RIPOMAS.MDB', tables: ['Purchase Master'] },
  { file: 'RIPODET.MDB', tables: ['Purchase Detail', 'AsnCartonDet', 'AsnCartonHead'] },

  // Open-to-Buy plan. 21k rows; consumed by the Sales-Analysis OTB-vs-Sales report.
  { file: 'RIOTB.MDB', tables: ['Open To Buy'] },

  // Case pack dimension taxonomy. Referenced by receiving / transfer flows.
  { file: 'RICASEPK.MDB', tables: ['Case_Packs', 'Case_Pack_Qtys'] },

  // Per-store / per-category tax rate overrides. Small but canonical.
  { file: 'RITAX.MDB', tables: ['Tax OverRide'] },

  // Inter-store transfer summaries (214 rows). Detail rows live in RITRNPCK
  // which is currently empty on this install — add later if it starts filling.
  { file: 'RITRANSF.MDB', tables: ['InvTransfers'] },

  // Time clock (49k rows). Owns `rics_mirror.time_clock` (see note above).
  { file: 'RITRNSTC.MDB', tables: ['TimeClock'] },

  // Scheduled future price changes (505 rows). Pricing module.
  { file: 'RIFUTURE.MDB', tables: ['Future Price Changes'] },

  // Customer master (1.6M customers) + family members. Large — this single
  // MDB is ~530 MB. Kept in the mirror so we have "all customer data" in
  // Postgres when RICS goes away.
  { file: 'RIMAIL.MDB', tables: ['MailListFamily', 'MailListNames'] },

  // Per-customer transaction history (14.7M rows across 4 tables). Partial
  // duplicate of RITRNSSV but indexed by customer Account, so joins by
  // customer are cheap. 2 GB MDB; adds meaningfully to sync runtime.
  {
    file: 'RIMAILED.MDB',
    tables: [
      'Mail Comment Detail',
      'Mail Purch Detail',
      'Mail Tender Detail',
      'Mail Ticket Detail',
    ],
  },

  // RISEMF.MDB still intentionally omitted. The file's 19 "SEMF <domain>"
  // tables are per-user screen-queue state, not canonical business data.
  // Seasons (originally suspected to live here) are not in any MDB in this
  // install — the Season Code Setup screen appears to write to the Windows
  // registry. Seasons are maintained in `public.SeasonOverlay` in Postgres.
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
