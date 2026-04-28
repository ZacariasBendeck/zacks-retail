import { prisma } from '../db/prisma';

export interface StoreSummary {
  id: number;
  code: string;
  name: string;
  active: boolean;
  chainId: string | null;
  chainLabel: string | null;
}

export interface StoreDetail extends StoreSummary {
  mailName: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  email: string | null;
  phone: string | null;
  fax: string | null;
  lastTicketUsed: number | null;
  billToName: string | null;
  billToAddress1: string | null;
  billToAddress2: string | null;
  billToCity: string | null;
  billToState: string | null;
  billToZip: string | null;
  otherChargeDescription: string | null;
  region: number | null;
  dateLastChanged: string | null;
}

export interface StoreChain {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
  storeNumbers: number[];
  storeCount: number;
}

type StoreMasterRow = {
  number: number;
  description: string;
  mailName: string | null;
  addr1: string | null;
  addr2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  eMail: string | null;
  phone: string | null;
  fax: string | null;
  lastTicket: number | null;
  billMailName: string | null;
  billAddr1: string | null;
  billAddr2: string | null;
  billCity: string | null;
  billState: string | null;
  billZip: string | null;
  otherChargeDesc: string | null;
  region: number | null;
  dateLastChanged: Date | null;
  chainId: string | null;
  chainLabel: string | null;
};

type StoreGroupRow = {
  code: string;
  label: string;
  active: boolean;
  sortOrder: number;
  storeNumbers: number[] | string[] | null;
};

class StoreServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isStoreServiceError(err: unknown): err is StoreServiceError {
  return err instanceof StoreServiceError;
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStoreGroupCode(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    throw new StoreServiceError(400, 'INVALID_CHAIN_CODE', 'Chain code cannot be blank.');
  }
  if (normalized.length > 64) {
    throw new StoreServiceError(400, 'INVALID_CHAIN_CODE', 'Chain code must be 64 characters or fewer.');
  }
  return normalized;
}

function normalizeSortOrder(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function parseStoreNumbers(value: StoreGroupRow['storeNumbers']): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)
    .sort((a, b) => a - b);
}

function normalizeSummary(row: Pick<StoreMasterRow, 'number' | 'description' | 'chainId' | 'chainLabel'>): StoreSummary {
  return {
    id: row.number,
    code: String(row.number).padStart(3, '0'),
    name: cleanText(row.description) ?? `Store ${row.number}`,
    active: true,
    chainId: cleanText(row.chainId),
    chainLabel: cleanText(row.chainLabel),
  };
}

function normalizeDetail(row: StoreMasterRow): StoreDetail {
  const summary = normalizeSummary(row);
  return {
    ...summary,
    mailName: cleanText(row.mailName),
    address1: cleanText(row.addr1),
    address2: cleanText(row.addr2),
    city: cleanText(row.city),
    state: cleanText(row.state),
    zip: cleanText(row.zip),
    email: cleanText(row.eMail),
    phone: cleanText(row.phone),
    fax: cleanText(row.fax),
    lastTicketUsed: row.lastTicket ?? null,
    billToName: cleanText(row.billMailName),
    billToAddress1: cleanText(row.billAddr1),
    billToAddress2: cleanText(row.billAddr2),
    billToCity: cleanText(row.billCity),
    billToState: cleanText(row.billState),
    billToZip: cleanText(row.billZip),
    otherChargeDescription: cleanText(row.otherChargeDesc),
    region: row.region ?? null,
    dateLastChanged: row.dateLastChanged ? row.dateLastChanged.toISOString() : null,
  };
}

function normalizeStoreChain(row: StoreGroupRow): StoreChain {
  const storeNumbers = parseStoreNumbers(row.storeNumbers);
  return {
    id: row.code,
    label: cleanText(row.label) ?? row.code,
    active: row.active,
    sortOrder: normalizeSortOrder(row.sortOrder),
    storeNumbers,
    storeCount: storeNumbers.length,
  };
}

async function ensureStoreExists(id: number): Promise<void> {
  const row = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1
      FROM app.store_master
      WHERE number = ${id}
    ) AS "exists"
  `;
  if (!row[0]?.exists) {
    throw new StoreServiceError(404, 'STORE_NOT_FOUND', 'Store not found.');
  }
}

async function ensureStoreChainExists(code: string): Promise<void> {
  const row = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1
      FROM app.store_group
      WHERE code = ${code}
    ) AS "exists"
  `;
  if (!row[0]?.exists) {
    throw new StoreServiceError(404, 'CHAIN_NOT_FOUND', 'Store chain not found.');
  }
}

export async function listStores(): Promise<StoreSummary[]> {
  const rows = await prisma.$queryRaw<StoreMasterRow[]>`
    SELECT
      sm.number,
      sm."desc" AS description,
      NULL::text AS "mailName",
      NULL::text AS addr1,
      NULL::text AS addr2,
      NULL::text AS city,
      NULL::text AS state,
      NULL::text AS zip,
      NULL::text AS "eMail",
      NULL::text AS phone,
      NULL::text AS fax,
      NULL::integer AS "lastTicket",
      NULL::text AS "billMailName",
      NULL::text AS "billAddr1",
      NULL::text AS "billAddr2",
      NULL::text AS "billCity",
      NULL::text AS "billState",
      NULL::text AS "billZip",
      NULL::text AS "otherChargeDesc",
      NULL::smallint AS region,
      NULL::timestamp AS "dateLastChanged",
      sgm.group_code AS "chainId",
      sg.label AS "chainLabel"
    FROM app.store_master sm
    LEFT JOIN app.store_group_member sgm
      ON sgm.store_number = sm.number
    LEFT JOIN app.store_group sg
      ON sg.code = sgm.group_code
    ORDER BY sm.number ASC
  `;

  return rows.map(normalizeSummary);
}

export async function getStoreById(id: number): Promise<StoreDetail | null> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new StoreServiceError(400, 'INVALID_STORE_ID', 'Store id must be a positive integer.');
  }

  const rows = await prisma.$queryRaw<StoreMasterRow[]>`
    SELECT
      sm.number,
      sm."desc" AS description,
      sm.mail_name AS "mailName",
      sm.addr1,
      sm.addr2,
      sm.city,
      sm.state,
      sm.zip,
      sm.e_mail AS "eMail",
      sm.phone,
      sm.fax,
      sm.last_ticket AS "lastTicket",
      sm.bill_mail_name AS "billMailName",
      sm.bill_addr1 AS "billAddr1",
      sm.bill_addr2 AS "billAddr2",
      sm.bill_city AS "billCity",
      sm.bill_state AS "billState",
      sm.bill_zip AS "billZip",
      sm.other_charge_desc AS "otherChargeDesc",
      sm.region,
      sm.date_last_changed AS "dateLastChanged",
      sgm.group_code AS "chainId",
      sg.label AS "chainLabel"
    FROM app.store_master sm
    LEFT JOIN app.store_group_member sgm
      ON sgm.store_number = sm.number
    LEFT JOIN app.store_group sg
      ON sg.code = sgm.group_code
    WHERE sm.number = ${id}
    LIMIT 1
  `;

  const row = rows[0];
  return row ? normalizeDetail(row) : null;
}

export async function listStoreChains(): Promise<StoreChain[]> {
  const rows = await prisma.$queryRaw<StoreGroupRow[]>`
    SELECT
      sg.code,
      sg.label,
      sg.active,
      sg.sort_order AS "sortOrder",
      ARRAY_AGG(sgm.store_number ORDER BY sgm.store_number)
        FILTER (WHERE sgm.store_number IS NOT NULL) AS "storeNumbers"
    FROM app.store_group sg
    LEFT JOIN app.store_group_member sgm
      ON sgm.group_code = sg.code
    GROUP BY sg.code, sg.label, sg.active, sg.sort_order
    ORDER BY sg.sort_order ASC, sg.label ASC
  `;

  return rows.map(normalizeStoreChain);
}

export async function createStoreChain(input: {
  code: string;
  label: string;
  active?: boolean;
  sortOrder?: number;
}): Promise<StoreChain> {
  const code = normalizeStoreGroupCode(input.code);
  const label = cleanText(input.label);
  if (!label) {
    throw new StoreServiceError(400, 'INVALID_CHAIN_LABEL', 'Chain label cannot be blank.');
  }

  const existing = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1
      FROM app.store_group
      WHERE code = ${code}
    ) AS "exists"
  `;
  if (existing[0]?.exists) {
    throw new StoreServiceError(409, 'CHAIN_ALREADY_EXISTS', 'A store chain with that code already exists.');
  }

  await prisma.$executeRaw`
    INSERT INTO app.store_group (code, label, active, sort_order)
    VALUES (${code}, ${label}, ${input.active ?? true}, ${normalizeSortOrder(input.sortOrder)})
  `;

  const chains = await listStoreChains();
  const chain = chains.find((candidate) => candidate.id === code);
  if (!chain) {
    throw new StoreServiceError(500, 'CHAIN_CREATE_FAILED', 'Store chain was created but could not be reloaded.');
  }
  return chain;
}

export async function updateStoreChain(code: string, input: {
  label?: string;
  active?: boolean;
  sortOrder?: number;
}): Promise<StoreChain> {
  const normalizedCode = normalizeStoreGroupCode(code);
  const nextActive = input.active ?? null;
  const nextSortOrder = input.sortOrder == null ? null : normalizeSortOrder(input.sortOrder);
  await ensureStoreChainExists(normalizedCode);

  if (input.label !== undefined) {
    const label = cleanText(input.label);
    if (!label) {
      throw new StoreServiceError(400, 'INVALID_CHAIN_LABEL', 'Chain label cannot be blank.');
    }
    await prisma.$executeRaw`
      UPDATE app.store_group
      SET
        label = ${label},
        active = COALESCE(${nextActive}, active),
        sort_order = COALESCE(${nextSortOrder}, sort_order),
        updated_at = CURRENT_TIMESTAMP
      WHERE code = ${normalizedCode}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE app.store_group
      SET
        active = COALESCE(${nextActive}, active),
        sort_order = COALESCE(${nextSortOrder}, sort_order),
        updated_at = CURRENT_TIMESTAMP
      WHERE code = ${normalizedCode}
    `;
  }

  const chains = await listStoreChains();
  const chain = chains.find((candidate) => candidate.id === normalizedCode);
  if (!chain) {
    throw new StoreServiceError(500, 'CHAIN_UPDATE_FAILED', 'Store chain was updated but could not be reloaded.');
  }
  return chain;
}

export async function assignStoreToChain(storeId: number, chainId: string | null): Promise<StoreDetail> {
  if (!Number.isInteger(storeId) || storeId <= 0) {
    throw new StoreServiceError(400, 'INVALID_STORE_ID', 'Store id must be a positive integer.');
  }

  await ensureStoreExists(storeId);

  if (chainId == null) {
    await prisma.$executeRaw`
      DELETE FROM app.store_group_member
      WHERE store_number = ${storeId}
    `;
  } else {
    const normalizedChainId = normalizeStoreGroupCode(chainId);
    await ensureStoreChainExists(normalizedChainId);
    await prisma.$executeRaw`
      INSERT INTO app.store_group_member (store_number, group_code)
      VALUES (${storeId}, ${normalizedChainId})
      ON CONFLICT (store_number)
      DO UPDATE SET
        group_code = EXCLUDED.group_code,
        updated_at = CURRENT_TIMESTAMP
    `;
  }

  const store = await getStoreById(storeId);
  if (!store) {
    throw new StoreServiceError(500, 'STORE_RELOAD_FAILED', 'Store was updated but could not be reloaded.');
  }
  return store;
}
