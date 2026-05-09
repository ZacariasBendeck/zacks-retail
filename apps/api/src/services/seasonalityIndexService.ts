import { prisma } from '../db/prisma';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NEUTRAL_INDEXES = new Array<number>(12).fill(1);
const REPORT_TIME_ZONE = 'America/Tegucigalpa';

export interface MonthQuantity {
  yearMonth: string;
  quantity: number;
}

export interface SeasonalityMonth {
  month: number;
  label: string;
  rawSalesQty: number;
  index: number;
}

export interface DepartmentSeasonalityRow {
  departmentNumber: number;
  departmentLabel: string;
  totalSalesQty: number;
  averageMonthlyQty: number;
  sampleMonths: number;
  months: SeasonalityMonth[];
}

export interface SeasonalityIndexReport {
  basis: 'DEPARTMENT_ALL_STORES';
  generatedAt: string;
  historyStartMonth: string;
  historyEndMonth: string;
  rows: DepartmentSeasonalityRow[];
}

interface DepartmentMonthlySalesRow {
  department_number: number | null;
  department_label: string | null;
  year_month: string | null;
  qty: unknown;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const departmentSeasonalityCache = new Map<string, CacheEntry<DepartmentSeasonalityRow>>();

export function shiftYearMonth(ym: string, deltaMonths: number): string {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const total = year * 12 + (month - 1) + deltaMonths;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`;
}

export function currentYearMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? String(date.getUTCFullYear());
  const month = parts.find((part) => part.type === 'month')?.value ?? String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function lastCompletedYearMonth(date = new Date()): string {
  return shiftYearMonth(currentYearMonth(date), -1);
}

export function trailingYearMonths(endYearMonth: string, count = 12): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(shiftYearMonth(endYearMonth, -i));
  }
  return out;
}

export function nextYearMonths(startYearMonth: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => shiftYearMonth(startYearMonth, index));
}

export function calculateSeasonalityIndexes(monthlyQuantities: number[]): { averageMonthlyQty: number; indexes: number[] } {
  const padded = Array.from({ length: 12 }, (_, index) => Math.max(0, Number(monthlyQuantities[index] ?? 0)));
  const total = padded.reduce((sum, qty) => sum + qty, 0);
  const averageMonthlyQty = total / 12;
  if (averageMonthlyQty <= 0) {
    return { averageMonthlyQty: 0, indexes: [...NEUTRAL_INDEXES] };
  }
  return {
    averageMonthlyQty,
    indexes: padded.map((qty) => round2(qty / averageMonthlyQty)),
  };
}

export function buildNeutralSeasonalityRow(departmentNumber: number | null | undefined): DepartmentSeasonalityRow {
  return {
    departmentNumber: departmentNumber ?? 0,
    departmentLabel: departmentNumber != null ? `${departmentNumber}` : 'Unknown department',
    totalSalesQty: 0,
    averageMonthlyQty: 0,
    sampleMonths: 0,
    months: NEUTRAL_INDEXES.map((index, monthIndex) => ({
      month: monthIndex + 1,
      label: MONTH_LABELS[monthIndex],
      rawSalesQty: 0,
      index,
    })),
  };
}

export function buildDepartmentSeasonalityRows(
  rows: Array<{ departmentNumber: number; departmentLabel: string; yearMonth: string; quantity: number }>,
): DepartmentSeasonalityRow[] {
  const byDepartment = new Map<number, { label: string; monthQty: number[]; monthsSeen: Set<string> }>();
  for (const row of rows) {
    const month = Number(row.yearMonth.slice(5, 7));
    if (!Number.isInteger(month) || month < 1 || month > 12) continue;
    let bucket = byDepartment.get(row.departmentNumber);
    if (!bucket) {
      bucket = { label: row.departmentLabel, monthQty: new Array<number>(12).fill(0), monthsSeen: new Set<string>() };
      byDepartment.set(row.departmentNumber, bucket);
    }
    bucket.monthQty[month - 1] += Math.max(0, Number(row.quantity ?? 0));
    bucket.monthsSeen.add(row.yearMonth);
  }

  return [...byDepartment.entries()]
    .map(([departmentNumber, bucket]) => {
      const { averageMonthlyQty, indexes } = calculateSeasonalityIndexes(bucket.monthQty);
      const totalSalesQty = bucket.monthQty.reduce((sum, qty) => sum + qty, 0);
      return {
        departmentNumber,
        departmentLabel: bucket.label,
        totalSalesQty: Math.round(totalSalesQty),
        averageMonthlyQty: round2(averageMonthlyQty),
        sampleMonths: bucket.monthsSeen.size,
        months: indexes.map((index, monthIndex) => ({
          month: monthIndex + 1,
          label: MONTH_LABELS[monthIndex],
          rawSalesQty: Math.round(bucket.monthQty[monthIndex]),
          index,
        })),
      };
    })
    .sort((a, b) => a.departmentNumber - b.departmentNumber);
}

export function indexesByCalendarMonth(row: DepartmentSeasonalityRow | null | undefined): Map<number, number> {
  const source = row ?? buildNeutralSeasonalityRow(null);
  return new Map(source.months.map((month) => [month.month, month.index > 0 ? month.index : 1]));
}

export function forecastSeasonalDemand(
  history: MonthQuantity[],
  seasonalityIndexes: Map<number, number>,
  forecastMonths: string[],
): { forecastQty: number; baselineMonthlyQty: number; activeMonths: number } {
  if (forecastMonths.length === 0) {
    return { forecastQty: 0, baselineMonthlyQty: 0, activeMonths: 0 };
  }
  const byMonth = new Map<string, number>();
  for (const point of history) {
    byMonth.set(point.yearMonth, (byMonth.get(point.yearMonth) ?? 0) + Number(point.quantity ?? 0));
  }
  const observedMonths = [...byMonth.keys()].sort();
  if (observedMonths.length === 0) {
    return { forecastQty: 0, baselineMonthlyQty: 0, activeMonths: 0 };
  }

  const activeMonths = monthsBetween(observedMonths[0], observedMonths[observedMonths.length - 1]);
  let deseasonalizedTotal = 0;
  for (const ym of activeMonths) {
    const month = Number(ym.slice(5, 7));
    const index = seasonalityIndexes.get(month) ?? 1;
    const safeIndex = index > 0 ? index : 1;
    deseasonalizedTotal += (byMonth.get(ym) ?? 0) / safeIndex;
  }
  const baselineMonthlyQty = activeMonths.length > 0 ? deseasonalizedTotal / activeMonths.length : 0;
  const weightedDemand = forecastMonths.reduce((sum, ym) => {
    const month = Number(ym.slice(5, 7));
    return sum + baselineMonthlyQty * (seasonalityIndexes.get(month) ?? 1);
  }, 0);

  return {
    forecastQty: Math.max(0, Math.ceil(weightedDemand)),
    baselineMonthlyQty: round2(baselineMonthlyQty),
    activeMonths: activeMonths.length,
  };
}

export async function resolveDepartmentForCategory(categoryNumber: number | null | undefined): Promise<{
  departmentNumber: number | null;
  departmentLabel: string | null;
}> {
  if (categoryNumber == null) return { departmentNumber: null, departmentLabel: null };
  const rows = await prisma.$queryRawUnsafe<Array<{ number: number | null; label: string | null }>>(
    `
      SELECT number, COALESCE(number::text || ' - ' || NULLIF(BTRIM("desc"), ''), number::text) AS label
      FROM app.taxonomy_department
      WHERE $1::int BETWEEN beg_categ AND end_categ
      ORDER BY number
      LIMIT 1
    `,
    categoryNumber,
  );
  const row = rows[0];
  return {
    departmentNumber: row?.number == null ? null : Number(row.number),
    departmentLabel: row?.label ?? null,
  };
}

function seasonalityCacheTtlMs(): number {
  const raw = Number(process.env.SEASONALITY_INDEX_CACHE_MS ?? 15 * 60 * 1_000);
  return Number.isFinite(raw) && raw >= 0 ? raw : 15 * 60 * 1_000;
}

export function clearSeasonalityIndexCache(): void {
  departmentSeasonalityCache.clear();
}

function normalizeMonthlySalesRows(rows: DepartmentMonthlySalesRow[]): Array<{
  departmentNumber: number;
  departmentLabel: string;
  yearMonth: string;
  quantity: number;
}> {
  return rows
    .filter((row): row is DepartmentMonthlySalesRow & { department_number: number; department_label: string; year_month: string } =>
      row.department_number != null && row.department_label != null && row.year_month != null)
    .map((row) => ({
      departmentNumber: Number(row.department_number),
      departmentLabel: row.department_label,
      yearMonth: row.year_month,
      quantity: Number(row.qty ?? 0),
    }));
}

async function loadDepartmentMonthlySalesRowsBySkuId(
  historyStartMonth: string,
  historyEndMonth: string,
  departmentNumber: number,
): Promise<DepartmentMonthlySalesRow[]> {
  return prisma.$queryRawUnsafe<DepartmentMonthlySalesRow[]>(
    `
      WITH target_department AS (
        SELECT number, "desc", beg_categ, end_categ
        FROM app.taxonomy_department
        WHERE number = $3::int
        LIMIT 1
      )
      SELECT
        d.number AS department_number,
        COALESCE(d.number::text || ' - ' || NULLIF(BTRIM(d."desc"), ''), d.number::text) AS department_label,
        to_char(t.purchased_at AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM') AS year_month,
        COALESCE(SUM(l.quantity), 0)::float8 AS qty
      FROM target_department d
      JOIN app.sku s ON s.category_number BETWEEN d.beg_categ AND d.end_categ
      JOIN app.sales_history_ticket_line l ON l.sku_id = s.id
      JOIN app.sales_history_ticket t ON t.id = l.ticket_id
      WHERE t.status = 'completed'
        AND t.purchased_at >= (($1::text || '-01')::date::timestamp AT TIME ZONE 'America/Tegucigalpa')
        AND t.purchased_at < ((($2::text || '-01')::date + INTERVAL '1 month')::timestamp AT TIME ZONE 'America/Tegucigalpa')
      GROUP BY d.number, d."desc", to_char(t.purchased_at AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM')
      ORDER BY d.number, year_month
    `,
    historyStartMonth,
    historyEndMonth,
    departmentNumber,
  );
}

export async function getSeasonalityIndexReport(options: {
  endMonth?: string | null;
  departmentNumber?: number | null;
} = {}): Promise<SeasonalityIndexReport> {
  const historyEndMonth = options.endMonth ?? lastCompletedYearMonth();
  const historyStartMonth = shiftYearMonth(historyEndMonth, -11);
  const hasDepartment = options.departmentNumber != null;
  const rows = await prisma.$queryRawUnsafe<DepartmentMonthlySalesRow[]>(
    `
      WITH line_skus AS (
        SELECT
          t.purchased_at,
          COALESCE(s_by_id.category_number, s_by_code.category_number) AS category_number,
          COALESCE(l.quantity, 0)::float8 AS quantity
        FROM app.sales_history_ticket t
        JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
        LEFT JOIN app.sku s_by_id ON s_by_id.id = l.sku_id
        LEFT JOIN app.sku s_by_code
          ON s_by_id.id IS NULL
         AND l.sku_code IS NOT NULL
         AND UPPER(s_by_code.code) = UPPER(l.sku_code)
        WHERE t.status = 'completed'
          AND t.purchased_at >= (($1::text || '-01')::date::timestamp AT TIME ZONE 'America/Tegucigalpa')
          AND t.purchased_at < ((($2::text || '-01')::date + INTERVAL '1 month')::timestamp AT TIME ZONE 'America/Tegucigalpa')
      )
      SELECT
        d.number AS department_number,
        COALESCE(d.number::text || ' - ' || NULLIF(BTRIM(d."desc"), ''), d.number::text) AS department_label,
        to_char(ls.purchased_at AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM') AS year_month,
        COALESCE(SUM(ls.quantity), 0)::float8 AS qty
      FROM line_skus ls
      JOIN app.taxonomy_department d
        ON ls.category_number BETWEEN d.beg_categ AND d.end_categ
      WHERE ($3::int IS NULL OR d.number = $3::int)
      GROUP BY d.number, d."desc", to_char(ls.purchased_at AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM')
      ORDER BY d.number, year_month
    `,
    historyStartMonth,
    historyEndMonth,
    hasDepartment ? options.departmentNumber : null,
  );

  const normalizedRows = normalizeMonthlySalesRows(rows);

  return {
    basis: 'DEPARTMENT_ALL_STORES',
    generatedAt: new Date().toISOString(),
    historyStartMonth,
    historyEndMonth,
    rows: buildDepartmentSeasonalityRows(normalizedRows),
  };
}

export async function getDepartmentSeasonalityRow(
  departmentNumber: number | null | undefined,
  endMonth?: string | null,
): Promise<DepartmentSeasonalityRow> {
  if (departmentNumber == null) return buildNeutralSeasonalityRow(null);
  const historyEndMonth = endMonth ?? lastCompletedYearMonth();
  const historyStartMonth = shiftYearMonth(historyEndMonth, -11);
  const cacheKey = `${departmentNumber}:${historyStartMonth}:${historyEndMonth}`;
  const now = Date.now();
  const cached = departmentSeasonalityCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const rows = await loadDepartmentMonthlySalesRowsBySkuId(historyStartMonth, historyEndMonth, departmentNumber);
  const seasonalityRow = buildDepartmentSeasonalityRows(normalizeMonthlySalesRows(rows))[0]
    ?? buildNeutralSeasonalityRow(departmentNumber);
  departmentSeasonalityCache.set(cacheKey, {
    value: seasonalityRow,
    expiresAt: now + seasonalityCacheTtlMs(),
  });
  return seasonalityRow;
}

function monthsBetween(startYearMonth: string, endYearMonth: string): string[] {
  const out: string[] = [];
  let cursor = startYearMonth;
  while (cursor <= endYearMonth) {
    out.push(cursor);
    cursor = shiftYearMonth(cursor, 1);
  }
  return out;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
