import { z } from 'zod';

// Known report types. Templates and runs/snapshots reference exactly these
// values in their `report_type` column. Adding a new report = one line here.
//
// Convention: kebab-case, matches the URL slug of the report's page under
// /reports/... on the web app.
export const REPORT_TYPES = [
  'sales-analysis',
  'sales-hierarchy-drill-down',
  'sales-pivot',
  'best-sellers',
  'stock-status',
  'sales-by-day',
  'sales-by-time',
  'salesperson-summary',
  'sales-history-by-month',
  'balancing-transfer',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const reportTypeSchema = z.enum(REPORT_TYPES);

export function isReportType(value: unknown): value is ReportType {
  return typeof value === 'string' && (REPORT_TYPES as readonly string[]).includes(value);
}
