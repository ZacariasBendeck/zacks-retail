import fs from 'node:fs';

export interface CustomerCsvRow {
  Account: string;
  Code: string;
  Name: string;
  Gender: string;
  DateAdded: string;
  Birthday: string;
  Extra_01: string;
  Extra_02: string;
  Extra_03: string;
  Extra_04: string;
  Extra_05: string;
  Extra_06: string;
  Status: string;
  Comment: string;
  DateLastChanged: string;
}

export interface MailListNamesCsvRow {
  Account: string;
  Name: string;
  Addr1: string;
  Addr2: string;
  City: string;
  State: string;
  Zip: string;
  CreditLimit: string;
  CurrBal: string;
  CredSlip: string;
  Status: string;
  DateAdded: string;
  DateLstPurch: string;
  PlanNum: string;
  PlanCount: string;
  PlanDollars: string;
  PlanLastCred: string;
  PlanCredBal: string;
  NonTaxable: string;
  EMail: string;
  Extra_01: string;
  Extra_02: string;
  Extra_03: string;
  Extra_04: string;
  Extra_05: string;
  Extra_06: string;
  QtySales_01: string;
  QtySales_02: string;
  QtySales_03: string;
  QtySales_04: string;
  DollarSales_01: string;
  DollarSales_02: string;
  DollarSales_03: string;
  DollarSales_04: string;
  County: string;
  Comment: string;
  ChangeTo: string;
  DateLastChanged: string;
}

type CsvRecord = Record<string, string>;

const CUSTOMER_HEADERS = [
  'Account',
  'Code',
  'Name',
  'Gender',
  'DateAdded',
  'Birthday',
  'Extra_01',
  'Extra_02',
  'Extra_03',
  'Extra_04',
  'Extra_05',
  'Extra_06',
  'Status',
  'Comment',
  'DateLastChanged',
] as const;

const MAIL_HEADERS = [
  'Account',
  'Name',
  'Addr1',
  'Addr2',
  'City',
  'State',
  'Zip',
  'CreditLimit',
  'CurrBal',
  'CredSlip',
  'Status',
  'DateAdded',
  'DateLstPurch',
  'PlanNum',
  'PlanCount',
  'PlanDollars',
  'PlanLastCred',
  'PlanCredBal',
  'NonTaxable',
  'EMail',
  'Extra_01',
  'Extra_02',
  'Extra_03',
  'Extra_04',
  'Extra_05',
  'Extra_06',
  'QtySales_01',
  'QtySales_02',
  'QtySales_03',
  'QtySales_04',
  'DollarSales_01',
  'DollarSales_02',
  'DollarSales_03',
  'DollarSales_04',
  'County',
  'Comment',
  'ChangeTo',
  'DateLastChanged',
] as const;

export function parseCustomerCsv(text: string): CustomerCsvRow[] {
  return parseTypedCsv<CustomerCsvRow>(text, CUSTOMER_HEADERS);
}

export function parseMailListNamesCsv(text: string): MailListNamesCsvRow[] {
  return parseTypedCsv<MailListNamesCsvRow>(text, MAIL_HEADERS);
}

export function parseTypedCsv<T>(
  text: string,
  requiredHeaders: readonly string[],
): T[] {
  const rows = parseCsvRecords(text);
  if (rows.length === 0) return [];

  const headers = new Set(Object.keys(rows[0] ?? {}));
  for (const header of requiredHeaders) {
    if (!headers.has(header)) {
      throw new Error(`CSV missing required header: ${header}`);
    }
  }

  return rows.map((row) => {
    const shaped: CsvRecord = {};
    for (const header of requiredHeaders) {
      shaped[header] = row[header] ?? '';
    }
    return shaped as T;
  });
}

export function parseCsvRecords(text: string): CsvRecord[] {
  const matrix = parseCsvMatrix(text);
  if (matrix.length === 0) return [];

  const [headerRow, ...dataRows] = matrix;
  const headers = headerRow.map((cell) => stripBom(cell).trim());

  return dataRows
    .filter((row) => row.some((cell) => normalizeImportText(cell) !== null))
    .map((row) => {
      const record: CsvRecord = {};
      for (let i = 0; i < headers.length; i += 1) {
        const header = headers[i];
        if (!header) continue;
        record[header] = row[i] ?? '';
      }
      return record;
    });
}

export async function* parseCsvFileRecords(filePath: string): AsyncGenerator<CsvRecord> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  let headerRow: string[] | null = null;

  for await (const row of parseCsvRowsFromStream(stream)) {
    const cells = row.map((cell) => stripBom(cell));
    if (headerRow == null) {
      headerRow = cells.map((cell) => cell.trim());
      continue;
    }
    if (!cells.some((cell) => normalizeImportText(cell) !== null)) continue;

    const record: CsvRecord = {};
    for (let i = 0; i < headerRow.length; i += 1) {
      const header = headerRow[i];
      if (!header) continue;
      record[header] = cells[i] ?? '';
    }
    yield record;
  }
}

export function normalizeImportText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = normalizeImportText(value);
  return normalized ? normalized.toLowerCase() : null;
}

export function isValidEmail(value: string | null | undefined): boolean {
  const normalized = normalizeEmail(value);
  if (!normalized) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function normalizePhone(value: string | null | undefined): string | null {
  const normalized = normalizeImportText(value);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

export function normalizeHonduranIdRaw(value: string | null | undefined): string | null {
  return normalizeImportText(value);
}

export function normalizeHonduranIdDigits(value: string | null | undefined): string | null {
  const normalized = normalizeImportText(value);
  if (!normalized) return null;
  const digits = normalized.replace(/[^\d]/g, '');
  return digits.length > 0 ? digits : null;
}

export function toUsableHonduranId(value: string | null | undefined): string | null {
  const digits = normalizeHonduranIdDigits(value);
  return digits && digits.length === 13 ? digits : null;
}

export function deriveHonduranIdCandidate(
  account: string | null | undefined,
  code: string | null | undefined,
): { raw: string | null; normalized: string | null; conflict: boolean } {
  const accountId = toUsableHonduranId(account);
  const codeId = toUsableHonduranId(code);

  if (accountId && codeId && accountId !== codeId) {
    return { raw: normalizeImportText(account), normalized: null, conflict: true };
  }

  if (accountId) {
    return {
      raw: normalizeHonduranIdRaw(account),
      normalized: accountId,
      conflict: false,
    };
  }

  if (codeId) {
    return {
      raw: normalizeHonduranIdRaw(code),
      normalized: codeId,
      conflict: false,
    };
  }

  return { raw: null, normalized: null, conflict: false };
}

export function mapImportedStatus(value: string | null | undefined): string {
  const normalized = normalizeImportText(value)?.toLowerCase();
  if (!normalized) return 'active';
  if (['active', 'a', 'open', 'good', 'current', 'ok', 'yes', 'y'].includes(normalized)) {
    return 'active';
  }
  if (['inactive', 'inact', 'disabled', 'closed', 'archive', 'archived', 'no', 'n'].includes(normalized)) {
    return 'inactive';
  }
  if (['blocked', 'block', 'bad', 'deleted', 'delete', 'void'].includes(normalized)) {
    return 'blocked';
  }
  return 'active';
}

export function parseImportedDate(value: string | null | undefined): Date | null {
  const normalized = normalizeImportText(value);
  if (!normalized) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const date = new Date(`${normalized}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const usDate = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(.*))?$/);
  if (usDate) {
    const month = Number(usDate[1]);
    const day = Number(usDate[2]);
    const year = normalizeYear(Number(usDate[3]));
    const timePart = normalizeImportText(usDate[4]);
    if (!timePart) {
      return buildUtcDate(year, month, day, 0, 0, 0);
    }

    const time = parseTimePart(timePart);
    if (!time) return null;
    return buildUtcDate(year, month, day, time.hour, time.minute, time.second);
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseImportedDecimal(value: string | null | undefined): string | null {
  const normalized = normalizeImportText(value);
  if (!normalized) return null;
  const cleaned = normalized.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return cleaned;
}

export function parseImportedInteger(value: string | null | undefined): number | null {
  const decimal = parseImportedDecimal(value);
  if (decimal == null) return null;
  const parsed = Number(decimal);
  return Number.isInteger(parsed) ? parsed : null;
}

export function parseImportedBoolean(value: string | null | undefined): boolean | null {
  const normalized = normalizeImportText(value)?.toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 't', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'f', 'no', 'n'].includes(normalized)) return false;
  return null;
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };

  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      pushField();
      continue;
    }

    if (char === '\r') {
      if (text[i + 1] === '\n') i += 1;
      pushRow();
      continue;
    }

    if (char === '\n') {
      pushRow();
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  if (rows.length > 0 && rows[rows.length - 1].every((cell) => cell === '')) {
    rows.pop();
  }

  return rows;
}

async function* parseCsvRowsFromStream(
  stream: AsyncIterable<string | Buffer>,
): AsyncGenerator<string[]> {
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };

  const pushRow = function* (): Generator<string[]> {
    pushField();
    const completed = row;
    row = [];
    yield completed;
  };

  for await (const chunk of stream) {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
        continue;
      }

      if (char === ',') {
        pushField();
        continue;
      }

      if (char === '\r') {
        if (text[i + 1] === '\n') i += 1;
        yield* pushRow();
        continue;
      }

      if (char === '\n') {
        yield* pushRow();
        continue;
      }

      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    yield* pushRow();
  }
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function normalizeYear(year: number): number {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function parseTimePart(value: string): { hour: number; minute: number; second: number } | null {
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? '0');
  const meridiem = match[4]?.toUpperCase() ?? null;

  if (meridiem === 'AM' && hour === 12) hour = 0;
  if (meridiem === 'PM' && hour < 12) hour += 12;

  return { hour, minute, second };
}

function buildUtcDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
