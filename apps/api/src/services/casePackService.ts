import { prisma } from '../db/prisma';

export interface CasePackSummary {
  code: string;
  description: string | null;
  sizeTypeCode: number;
  active: boolean;
  dateLastChanged: string | null;
  totalUnits: number;
  cellCount: number;
}

export interface CasePackCell {
  columnLabel: string;
  rowLabel: string;
  quantity: number;
}

export interface CasePackDetail extends CasePackSummary {
  cells: CasePackCell[];
}

type CasePackSummaryRow = {
  code: string;
  description: string | null;
  sizeTypeCode: number;
  active: boolean;
  dateLastChanged: Date | null;
  totalUnits: number | bigint | string | null;
  cellCount: number | bigint | string | null;
};

type CasePackCellRow = {
  columnLabel: string;
  rowLabel: string | null;
  quantity: number;
};

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function toNumber(value: number | bigint | string | null | undefined): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value) || 0;
  return value ?? 0;
}

function normalizeSummary(row: CasePackSummaryRow): CasePackSummary {
  return {
    code: row.code,
    description: cleanText(row.description),
    sizeTypeCode: row.sizeTypeCode,
    active: row.active,
    dateLastChanged: row.dateLastChanged ? row.dateLastChanged.toISOString() : null,
    totalUnits: toNumber(row.totalUnits),
    cellCount: toNumber(row.cellCount),
  };
}

export async function listCasePacks(filters: { sizeTypeCode?: number } = {}): Promise<CasePackSummary[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.sizeTypeCode != null) {
    values.push(filters.sizeTypeCode);
    conditions.push(`cp.size_type_code = $${values.length}`);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await prisma.$queryRawUnsafe<CasePackSummaryRow[]>(
    `
    SELECT
      cp.code,
      cp."desc" AS description,
      cp.size_type_code AS "sizeTypeCode",
      cp.active,
      cp.date_last_changed AS "dateLastChanged",
      COALESCE(SUM(cpc.quantity), 0)::integer AS "totalUnits",
      COUNT(cpc.case_pack_code)::integer AS "cellCount"
    FROM app.case_pack cp
    LEFT JOIN app.case_pack_cell cpc
      ON cpc.case_pack_code = cp.code
    ${whereClause}
    GROUP BY cp.code, cp."desc", cp.size_type_code, cp.active, cp.date_last_changed
    ORDER BY cp.code ASC
  `,
    ...values,
  );

  return rows.map(normalizeSummary);
}

export async function getCasePackByCode(code: string): Promise<CasePackDetail | null> {
  const normalizedCode = code.trim();
  if (!normalizedCode) return null;

  const summaries = await prisma.$queryRaw<CasePackSummaryRow[]>`
    SELECT
      cp.code,
      cp."desc" AS description,
      cp.size_type_code AS "sizeTypeCode",
      cp.active,
      cp.date_last_changed AS "dateLastChanged",
      COALESCE(SUM(cpc.quantity), 0)::integer AS "totalUnits",
      COUNT(cpc.case_pack_code)::integer AS "cellCount"
    FROM app.case_pack cp
    LEFT JOIN app.case_pack_cell cpc
      ON cpc.case_pack_code = cp.code
    WHERE cp.code = ${normalizedCode}
    GROUP BY cp.code, cp."desc", cp.size_type_code, cp.active, cp.date_last_changed
    LIMIT 1
  `;
  const summary = summaries[0];
  if (!summary) return null;

  const cells = await prisma.$queryRaw<CasePackCellRow[]>`
    SELECT
      column_label AS "columnLabel",
      row_label AS "rowLabel",
      quantity
    FROM app.case_pack_cell
    WHERE case_pack_code = ${normalizedCode}
    ORDER BY NULLIF(row_label, '') NULLS FIRST, column_label
  `;

  return {
    ...normalizeSummary(summary),
    cells: cells.map((cell) => ({
      columnLabel: cleanText(cell.columnLabel) ?? '',
      rowLabel: cleanText(cell.rowLabel) ?? '',
      quantity: cell.quantity,
    })),
  };
}
