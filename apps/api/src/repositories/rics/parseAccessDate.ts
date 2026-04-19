/**
 * Parse the string returned by OLE DB for a DATE column in RICS MDB files.
 * PowerShell's `ConvertTo-Json` serializes .NET DateTime values as
 * `/Date(unixMs)/`. We also fall back to native Date parsing so ISO strings
 * (from tests or non-JSON paths) still work.
 */
export function parseAccessDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const m = value.match(/\/Date\((-?\d+)\)\//);
    if (m) return new Date(Number(m[1]));
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'number') return new Date(value);
  return null;
}
