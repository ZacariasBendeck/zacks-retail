import { prisma } from '../db/prisma';

export interface CasePackSummary {
  code: string;
  description: string | null;
  sizeTypeCode: number;
  active: boolean;
  dateLastChanged: string | null;
  totalUnits: number;
  cellCount: number;
  skuCount: number;
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
  skuCount: number | bigint | string | null;
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
    skuCount: toNumber(row.skuCount),
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
      COALESCE(cell_totals.total_units, 0)::integer AS "totalUnits",
      COALESCE(cell_totals.cell_count, 0)::integer AS "cellCount",
      COALESCE(sku_usage.sku_count, 0)::integer AS "skuCount"
    FROM app.case_pack cp
    LEFT JOIN (
      SELECT
        case_pack_code,
        SUM(quantity)::integer AS total_units,
        COUNT(*)::integer AS cell_count
      FROM app.case_pack_cell
      GROUP BY case_pack_code
    ) cell_totals ON cell_totals.case_pack_code = cp.code
    LEFT JOIN (
      SELECT
        UPPER(case_pack_code) AS case_pack_code,
        COUNT(DISTINCT sku_key)::integer AS sku_count
      FROM (
        SELECT
          NULLIF(BTRIM(pol.case_pack_id), '') AS case_pack_code,
          pol.sku_id::text AS sku_key
        FROM app.purchase_order_line pol
        WHERE NULLIF(BTRIM(pol.case_pack_id), '') IS NOT NULL
        UNION
        SELECT
          NULLIF(BTRIM(pol.case_pack_code), '') AS case_pack_code,
          COALESCE(pol.sku_id::text, NULLIF(BTRIM(pol.sku_code), '')) AS sku_key
        FROM app.purchase_order_legacy_line pol
        WHERE NULLIF(BTRIM(pol.case_pack_code), '') IS NOT NULL
      ) usage_rows
      WHERE sku_key IS NOT NULL
      GROUP BY UPPER(case_pack_code)
    ) sku_usage ON sku_usage.case_pack_code = UPPER(cp.code)
    ${whereClause}
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
      COALESCE(cell_totals.total_units, 0)::integer AS "totalUnits",
      COALESCE(cell_totals.cell_count, 0)::integer AS "cellCount",
      COALESCE(sku_usage.sku_count, 0)::integer AS "skuCount"
    FROM app.case_pack cp
    LEFT JOIN (
      SELECT
        case_pack_code,
        SUM(quantity)::integer AS total_units,
        COUNT(*)::integer AS cell_count
      FROM app.case_pack_cell
      GROUP BY case_pack_code
    ) cell_totals ON cell_totals.case_pack_code = cp.code
    LEFT JOIN (
      SELECT
        UPPER(case_pack_code) AS case_pack_code,
        COUNT(DISTINCT sku_key)::integer AS sku_count
      FROM (
        SELECT
          NULLIF(BTRIM(pol.case_pack_id), '') AS case_pack_code,
          pol.sku_id::text AS sku_key
        FROM app.purchase_order_line pol
        WHERE NULLIF(BTRIM(pol.case_pack_id), '') IS NOT NULL
        UNION
        SELECT
          NULLIF(BTRIM(pol.case_pack_code), '') AS case_pack_code,
          COALESCE(pol.sku_id::text, NULLIF(BTRIM(pol.sku_code), '')) AS sku_key
        FROM app.purchase_order_legacy_line pol
        WHERE NULLIF(BTRIM(pol.case_pack_code), '') IS NOT NULL
      ) usage_rows
      WHERE sku_key IS NOT NULL
      GROUP BY UPPER(case_pack_code)
    ) sku_usage ON sku_usage.case_pack_code = UPPER(cp.code)
    WHERE cp.code = ${normalizedCode}
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
