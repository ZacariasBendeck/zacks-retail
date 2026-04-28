import path from 'node:path';
import { Client } from 'pg';
import {
  buildSelectScript,
  getOrRecoverPassword,
  ricsDbPath,
  runPowerShellJson,
} from '../../src/services/accessOleDb';
import { hashPassword } from '../../src/services/employees/passwordHash';
import {
  loadManifest,
  requireTable,
  stageTable,
} from '../rics/sync/artifactManifest';

type Args = {
  manifestPath: string | null;
  mdbPath: string;
  active: boolean;
  importLegacyPins: boolean;
};

type SourceSalespersonRow = {
  code: string | null;
  name: string | null;
  otherInfo: string | null;
  commMethod: string | null;
  tcPassword: string | null;
  tcAdmin: boolean | string | number | null;
  tcFullUser: boolean | string | number | null;
  commission: number | string | null;
  cashierPassword: string | null;
  dateLastChanged: string | Date | null;
};

type ImportSummary = {
  sourceRows: number;
  eligibleRows: number;
  insertedEmployees: number;
  updatedEmployees: number;
  importedTimeClockPins: number;
  importedLegacyCashierPins: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    manifestPath: null,
    mdbPath: ricsDbPath('RISLSPSN.MDB'),
    active: false,
    importLegacyPins: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    switch (value) {
      case '--manifest':
        args.manifestPath = path.resolve(String(argv[++index] ?? ''));
        break;
      case '--mdb':
        args.mdbPath = path.resolve(String(argv[++index] ?? ''));
        break;
      case '--active':
        args.active = true;
        break;
      case '--no-legacy-pins':
        args.importLegacyPins = false;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Unknown flag: ${value}`);
    }
  }

  return args;
}

function printUsage(): void {
  console.info(
    [
      'Usage: pnpm --filter @benlow-rics/api import:employees-from-rics -- [options]',
      '',
      'Options:',
      '  --manifest <path>   Import Salespeople from a canonical RICS artifact manifest.',
      '  --mdb <path>        Import directly from RISLSPSN.MDB for local rehearsal/backfill.',
      '  --active            Mark imported employee rows active. Default is inactive.',
      '  --no-legacy-pins    Do not import hashed TCPassword/CashierPassword values.',
    ].join('\n'),
  );
}

function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function cleanCode(value: unknown): string | null {
  const text = cleanText(value);
  return text ? text.toUpperCase() : null;
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = cleanText(value)?.toLowerCase();
  return text === 'true' || text === 't' || text === '1' || text === 'y' || text === 'yes';
}

function parseNumber(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : null;
}

function parseRicsDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const text = cleanText(value);
  if (!text) return null;
  const match = /^\/Date\((-?\d+)\)\/$/.exec(text);
  if (match) {
    const date = new Date(Number(match[1]));
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function commissionBaseFor(method: string | null): string {
  const normalized = method?.trim().toUpperCase() ?? '';
  if (normalized.startsWith('G') || normalized.startsWith('P')) return 'GROSS_PROFIT';
  return 'NET_SALES';
}

async function loadRowsFromMdb(mdbPath: string): Promise<SourceSalespersonRow[]> {
  const password = getOrRecoverPassword(mdbPath);
  const raw = await runPowerShellJson<Record<string, unknown> | Record<string, unknown>[]>(
    buildSelectScript(
      mdbPath,
      password,
      [
        'SELECT',
        '  [Code] AS Code,',
        '  [Name] AS Name,',
        '  [Other Info] AS OtherInfo,',
        '  [Comm Method] AS CommMethod,',
        '  [TCPassword] AS TCPassword,',
        '  [TCAdmin] AS TCAdmin,',
        '  [TCFullUser] AS TCFullUser,',
        '  [Commission] AS Commission,',
        '  [CashierPassword] AS CashierPassword,',
        '  [DateLastChanged] AS DateLastChanged',
        'FROM [Salespeople]',
      ].join('\n'),
    ),
  );
  const rows = Array.isArray(raw) ? raw : [raw];
  return rows.map((row) => ({
    code: cleanText(row.Code),
    name: cleanText(row.Name),
    otherInfo: cleanText(row.OtherInfo),
    commMethod: cleanText(row.CommMethod),
    tcPassword: cleanText(row.TCPassword),
    tcAdmin: row.TCAdmin as SourceSalespersonRow['tcAdmin'],
    tcFullUser: row.TCFullUser as SourceSalespersonRow['tcFullUser'],
    commission: row.Commission as SourceSalespersonRow['commission'],
    cashierPassword: cleanText(row.CashierPassword),
    dateLastChanged: row.DateLastChanged as SourceSalespersonRow['dateLastChanged'],
  }));
}

async function loadRowsFromManifest(client: Client, manifestPath: string): Promise<SourceSalespersonRow[]> {
  const { manifest, manifestDir } = loadManifest(manifestPath);
  const table = requireTable(manifest, 'salespeople');
  const tempName = await stageTable(client, manifestDir, table);
  const result = await client.query<{
    code: string | null;
    name: string | null;
    other_info: string | null;
    comm_method: string | null;
    tc_password: string | null;
    tc_admin: boolean | string | number | null;
    tc_full_user: boolean | string | number | null;
    commission: number | string | null;
    cashier_password: string | null;
    date_last_changed: string | Date | null;
  }>(
    `SELECT code, name, other_info, comm_method, tc_password, tc_admin, tc_full_user, commission, cashier_password, date_last_changed FROM "${tempName}"`,
  );
  return result.rows.map((row) => ({
    code: cleanText(row.code),
    name: cleanText(row.name),
    otherInfo: cleanText(row.other_info),
    commMethod: cleanText(row.comm_method),
    tcPassword: cleanText(row.tc_password),
    tcAdmin: row.tc_admin,
    tcFullUser: row.tc_full_user,
    commission: row.commission,
    cashierPassword: cleanText(row.cashier_password),
    dateLastChanged: row.date_last_changed,
  }));
}

export async function importRicsSalespeople(argv: string[] = process.argv.slice(2)): Promise<ImportSummary> {
  const args = parseArgs(argv);
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');
    const rows = args.manifestPath
      ? await loadRowsFromManifest(client, args.manifestPath)
      : await loadRowsFromMdb(args.mdbPath);

    let insertedEmployees = 0;
    let updatedEmployees = 0;
    let importedTimeClockPins = 0;
    let importedLegacyCashierPins = 0;

    for (const row of rows) {
      const salespersonCode = cleanCode(row.code);
      if (!salespersonCode) continue;

      const tcPassword = cleanText(row.tcPassword);
      const cashierPassword = cleanText(row.cashierPassword);
      const timeClockPinHash = args.importLegacyPins && tcPassword
        ? await hashPassword(tcPassword)
        : null;
      const legacyCashierPinHash = args.importLegacyPins && cashierPassword
        ? await hashPassword(cashierPassword)
        : null;
      const changedAt = parseRicsDate(row.dateLastChanged);
      const result = await client.query<{ inserted: boolean; id: string }>(
        `
        INSERT INTO app.employee (
          salesperson_code,
          display_name,
          active,
          other_information,
          commission_rate,
          commission_base,
          rics_commission_method,
          time_clock_enabled,
          time_clock_pin_hash,
          time_clock_admin,
          time_clock_full_user,
          legacy_cashier_pin_hash,
          rics_salesperson_changed_at,
          rics_salesperson_imported_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5::numeric, $6, $7,
          true, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (salesperson_code) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          active = EXCLUDED.active,
          other_information = EXCLUDED.other_information,
          commission_rate = EXCLUDED.commission_rate,
          commission_base = EXCLUDED.commission_base,
          rics_commission_method = EXCLUDED.rics_commission_method,
          time_clock_enabled = EXCLUDED.time_clock_enabled,
          time_clock_pin_hash = COALESCE(EXCLUDED.time_clock_pin_hash, app.employee.time_clock_pin_hash),
          time_clock_admin = EXCLUDED.time_clock_admin,
          time_clock_full_user = EXCLUDED.time_clock_full_user,
          legacy_cashier_pin_hash = COALESCE(EXCLUDED.legacy_cashier_pin_hash, app.employee.legacy_cashier_pin_hash),
          rics_salesperson_changed_at = EXCLUDED.rics_salesperson_changed_at,
          rics_salesperson_imported_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING (xmax = 0) AS inserted, id
        `,
        [
          salespersonCode,
          cleanText(row.name) ?? salespersonCode,
          args.active,
          cleanText(row.otherInfo),
          parseNumber(row.commission),
          commissionBaseFor(cleanText(row.commMethod)),
          cleanText(row.commMethod),
          timeClockPinHash,
          parseBoolean(row.tcAdmin),
          parseBoolean(row.tcFullUser),
          legacyCashierPinHash,
          changedAt,
        ],
      );

      const employee = result.rows[0];
      if (employee?.inserted) insertedEmployees += 1;
      else updatedEmployees += 1;
      if (timeClockPinHash) importedTimeClockPins += 1;
      if (legacyCashierPinHash) importedLegacyCashierPins += 1;
    }

    await client.query('COMMIT');
    const summary = {
      sourceRows: rows.length,
      eligibleRows: rows.filter((row) => cleanCode(row.code)).length,
      insertedEmployees,
      updatedEmployees,
      importedTimeClockPins,
      importedLegacyCashierPins,
    };
    console.info('[employees] Imported RICS salespeople', summary);
    return summary;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (require.main === module) {
  importRicsSalespeople()
    .catch((error) => {
      console.error('[employees] RICS salesperson import failed', error);
      process.exitCode = 1;
    });
}
