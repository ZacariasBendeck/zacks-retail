/**
 * Access OLE DB DATA_TYPE (integer) -> Postgres column type (string).
 *
 * Code values from OleDbType enum:
 * https://learn.microsoft.com/en-us/dotnet/api/system.data.oledb.oledbtype
 *
 * When in doubt, the fallback is `text` — the mirror is throwaway and
 * losing precision is fine at the mirror layer. Callers can CAST when
 * they pull into clean module schemas later.
 */
export function oleDbToPostgresType(oleDbType: number): string {
  switch (oleDbType) {
    // Integers
    case 2: // adSmallInt (Int16)
      return 'smallint';
    case 3: // adInteger (Int32)
      return 'integer';
    case 20: // adBigInt (Int64)
      return 'bigint';
    case 16: // adTinyInt (SByte)
    case 17: // adUnsignedTinyInt (Byte) — Access "Byte" type
      return 'smallint';
    case 18: // adUnsignedSmallInt
      return 'integer';
    case 19: // adUnsignedInt
      return 'bigint';
    case 21: // adUnsignedBigInt
      return 'numeric(20,0)';

    // Floats
    case 4: // adSingle
    case 5: // adDouble
      return 'double precision';

    // Exact numerics / money
    case 6: // adCurrency — 64-bit scaled by 10000
    case 14: // adDecimal
    case 131: // adNumeric
      return 'numeric(18,4)';

    // Booleans
    case 11: // adBoolean
      return 'boolean';

    // Dates
    case 7: // adDate
    case 133: // adDBDate
    case 134: // adDBTime
    case 135: // adDBTimeStamp
    case 64: // adFileTime
      return 'timestamptz';

    // Text
    case 129: // adChar
    case 130: // adWChar
    case 200: // adVarChar
    case 201: // adLongVarChar
    case 202: // adVarWChar
    case 203: // adLongVarWChar
      return 'text';

    // GUID
    case 72: // adGUID
      return 'uuid';

    // Binary
    case 128: // adBinary
    case 204: // adVarBinary
    case 205: // adLongVarBinary
      return 'bytea';

    // Fallback — preserve the value as text, operator can re-type later
    default:
      return 'text';
  }
}

/**
 * Quote a Postgres identifier (schema, table, or column name).
 * Converts to lowercase snake_case first, then wraps in double quotes
 * only if needed (contains non-[a-z0-9_] chars or is a reserved word).
 * For safety we always quote — cheaper than maintaining a reserved-word list.
 */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Format one JSON-decoded row value as a field in Postgres TEXT-format COPY stream.
 *
 * TEXT format rules (https://www.postgresql.org/docs/current/sql-copy.html):
 *  - Columns separated by tab, rows terminated by LF.
 *  - NULL encoded as `\N`.
 *  - Literal backslash, tab, newline, carriage return, backspace, form feed,
 *    vertical tab, and escape encoded with backslash sequences.
 *  - Everything else written as-is.
 *
 * Type coercion is best-effort: the value comes out of PowerShell's
 * ConvertTo-Json, which emits booleans as `true`/`false`, numbers as JSON
 * numbers, dates as ISO-like strings, and binary as base64 (if it survives
 * at all — Jet binary columns are rare in RICS). We forward whatever we get
 * as the text representation and let Postgres parse.
 */
export function encodeCopyField(value: unknown, pgType: string): string {
  if (value === null || value === undefined) return '\\N';

  // Booleans -> "t" / "f" (Postgres accepts lowercase)
  if (typeof value === 'boolean') return value ? 't' : 'f';

  // Numbers -> straight toString (no locale separators)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '\\N';
    return String(value);
  }

  // Dates as JS Date (shouldn't happen via JSON but handle anyway)
  if (value instanceof Date) {
    return escapeCopyText(value.toISOString());
  }

  // Bytea — value is typically base64 after JSON round-trip. If caller gave us
  // a raw byte array, encode as hex-escape (\xHEXHEX). If it's a string we
  // assume it's already decoded content and pass it through with escaping.
  if (pgType === 'bytea' && value instanceof Uint8Array) {
    return '\\\\x' + Buffer.from(value).toString('hex');
  }

  // Strings: fast path + date normalizations.
  if (typeof value === 'string') {
    if (pgType === 'timestamptz' || pgType === 'date' || pgType === 'time') {
      const iso = normalizeToIsoDate(value);
      if (iso !== null) return escapeCopyText(iso);
    }
    return escapeCopyText(value);
  }

  // Everything else: stringify, escape, emit
  if (typeof value === 'object') {
    return escapeCopyText(JSON.stringify(value));
  }
  return escapeCopyText(String(value));
}

/**
 * Accept the variety of date formats PowerShell's ConvertTo-Json can produce
 * and turn them into something Postgres parses as timestamptz.
 *
 *   /Date(1610489968000)/              -> 2021-01-12T20:19:28.000Z
 *   /Date(1610489968000+0000)/         -> 2021-01-12T20:19:28.000Z  (offset encoded)
 *   2021-01-12T20:19:28                -> passthrough (ISO 8601 already)
 *   2021-01-12 20:19:28                -> passthrough (Postgres accepts space sep)
 *
 * Returns null for unrecognized input so the caller can fall back to raw
 * passthrough (Postgres' own parser may handle it; if not, it errors out and
 * we'll see it in the logs).
 */
export function normalizeToIsoDate(s: string): string | null {
  // MS legacy format: /Date(ms)/ or /Date(ms±HHMM)/
  const msMatch = s.match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/);
  if (msMatch) {
    const ms = Number(msMatch[1]);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
  }
  // Already ISO-ish — Postgres parses both T and space separators.
  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(s)) return s;
  // Pure date
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

/**
 * Escape a single string for Postgres COPY TEXT format.
 * Replace control characters and backslash with their backslash-escape
 * sequences. Order matters: backslash first, so we don't double-escape.
 */
function escapeCopyText(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    switch (c) {
      case 0x5c: out += '\\\\'; break; // backslash
      case 0x09: out += '\\t'; break;  // tab
      case 0x0a: out += '\\n'; break;  // LF
      case 0x0d: out += '\\r'; break;  // CR
      case 0x08: out += '\\b'; break;  // backspace
      case 0x0c: out += '\\f'; break;  // form feed
      case 0x0b: out += '\\v'; break;  // vertical tab
      default:
        // Postgres NUL is not allowed in text. Drop it.
        if (c === 0) continue;
        out += s[i];
    }
  }
  return out;
}
