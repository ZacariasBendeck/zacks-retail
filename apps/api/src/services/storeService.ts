import { prisma } from '../db/prisma';

type StoreRow = {
  id: number;
  code: string;
  name: string | null;
  active: boolean;
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

function normalizeStore(row: StoreRow): { id: number; code: string; name: string; active: boolean } {
  return {
    id: row.id,
    code: row.code,
    name: row.name?.trim() || `Store ${row.id}`,
    active: row.active,
  };
}

export async function listStores(): Promise<Array<{ id: number; code: string; name: string; active: boolean }>> {
  const rows = await prisma.$queryRawUnsafe<StoreRow[]>(
    `SELECT number AS id,
            LPAD(number::text, 3, '0') AS code,
            "desc" AS name,
            true AS active
       FROM app.store_master
      ORDER BY number ASC`,
  );

  return rows.map(normalizeStore);
}

export async function getStoreById(id: number): Promise<{ id: number; code: string; name: string; active: boolean } | null> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new StoreServiceError(400, 'INVALID_STORE_ID', 'Store id must be a positive integer.');
  }

  const rows = await prisma.$queryRawUnsafe<StoreRow[]>(
    `SELECT number AS id,
            LPAD(number::text, 3, '0') AS code,
            "desc" AS name,
            true AS active
       FROM app.store_master
      WHERE number = $1
      LIMIT 1`,
    id,
  );

  const row = rows[0];
  return row ? normalizeStore(row) : null;
}
