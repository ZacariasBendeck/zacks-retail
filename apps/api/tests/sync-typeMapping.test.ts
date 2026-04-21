import { oleDbToPostgresType, encodeCopyField, quoteIdent, normalizeToIsoDate } from '../src/services/sync/typeMapping';
import { toSnakeCase } from '../src/services/sync/canonicalRicsTables';

describe('oleDbToPostgresType', () => {
  test('maps integer family', () => {
    expect(oleDbToPostgresType(2)).toBe('smallint');
    expect(oleDbToPostgresType(3)).toBe('integer');
    expect(oleDbToPostgresType(20)).toBe('bigint');
  });

  test('maps text family', () => {
    expect(oleDbToPostgresType(129)).toBe('text');
    expect(oleDbToPostgresType(130)).toBe('text');
    expect(oleDbToPostgresType(200)).toBe('text');
    expect(oleDbToPostgresType(201)).toBe('text');
    expect(oleDbToPostgresType(202)).toBe('text');
    expect(oleDbToPostgresType(203)).toBe('text');
  });

  test('maps money / decimal family to numeric(18,4)', () => {
    expect(oleDbToPostgresType(6)).toBe('numeric(18,4)');
    expect(oleDbToPostgresType(14)).toBe('numeric(18,4)');
    expect(oleDbToPostgresType(131)).toBe('numeric(18,4)');
  });

  test('maps dates to timestamptz', () => {
    expect(oleDbToPostgresType(7)).toBe('timestamptz');
    expect(oleDbToPostgresType(135)).toBe('timestamptz');
  });

  test('maps bool to boolean', () => {
    expect(oleDbToPostgresType(11)).toBe('boolean');
  });

  test('maps binary family to bytea', () => {
    expect(oleDbToPostgresType(128)).toBe('bytea');
    expect(oleDbToPostgresType(204)).toBe('bytea');
    expect(oleDbToPostgresType(205)).toBe('bytea');
  });

  test('falls back to text for unknown codes', () => {
    expect(oleDbToPostgresType(99999)).toBe('text');
  });
});

describe('encodeCopyField', () => {
  test('null -> \\N', () => {
    expect(encodeCopyField(null, 'text')).toBe('\\N');
    expect(encodeCopyField(undefined, 'integer')).toBe('\\N');
  });

  test('booleans -> t/f', () => {
    expect(encodeCopyField(true, 'boolean')).toBe('t');
    expect(encodeCopyField(false, 'boolean')).toBe('f');
  });

  test('numbers', () => {
    expect(encodeCopyField(42, 'integer')).toBe('42');
    expect(encodeCopyField(3.14, 'double precision')).toBe('3.14');
    expect(encodeCopyField(NaN, 'double precision')).toBe('\\N');
    expect(encodeCopyField(Infinity, 'double precision')).toBe('\\N');
  });

  test('plain strings', () => {
    expect(encodeCopyField('hello', 'text')).toBe('hello');
    expect(encodeCopyField('CASUAL NIÑOS', 'text')).toBe('CASUAL NIÑOS');
  });

  test('escapes COPY control characters', () => {
    expect(encodeCopyField('a\tb', 'text')).toBe('a\\tb');
    expect(encodeCopyField('a\nb', 'text')).toBe('a\\nb');
    expect(encodeCopyField('a\rb', 'text')).toBe('a\\rb');
    expect(encodeCopyField('a\\b', 'text')).toBe('a\\\\b');
  });

  test('drops NUL bytes', () => {
    expect(encodeCopyField('a\x00b', 'text')).toBe('ab');
  });

  test('dates -> ISO-escaped', () => {
    const d = new Date('2026-01-15T12:34:56.789Z');
    expect(encodeCopyField(d, 'timestamptz')).toBe('2026-01-15T12:34:56.789Z');
  });

  test('bytea with Uint8Array -> \\xHEX', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(encodeCopyField(bytes, 'bytea')).toBe('\\\\xdeadbeef');
  });
});

describe('normalizeToIsoDate', () => {
  test('MS /Date(ms)/ format', () => {
    expect(normalizeToIsoDate('/Date(1610489968000)/')).toBe('2021-01-12T22:19:28.000Z');
  });
  test('MS /Date(ms+offset)/ format — offset is informational only', () => {
    // The offset in /Date(ms+HHMM)/ is a display hint, not a timezone to shift.
    // The epoch ms is already UTC; we always emit the UTC ISO.
    expect(normalizeToIsoDate('/Date(1610489968000+0000)/')).toBe('2021-01-12T22:19:28.000Z');
    expect(normalizeToIsoDate('/Date(1610489968000-0600)/')).toBe('2021-01-12T22:19:28.000Z');
  });
  test('ISO passthrough', () => {
    expect(normalizeToIsoDate('2021-01-12T20:19:28')).toBe('2021-01-12T20:19:28');
    expect(normalizeToIsoDate('2021-01-12 20:19:28')).toBe('2021-01-12 20:19:28');
    expect(normalizeToIsoDate('2021-01-12')).toBe('2021-01-12');
  });
  test('unrecognized -> null', () => {
    expect(normalizeToIsoDate('not a date')).toBeNull();
    expect(normalizeToIsoDate('')).toBeNull();
  });
});

describe('encodeCopyField date strings', () => {
  test('MS Date format + timestamptz -> ISO', () => {
    expect(encodeCopyField('/Date(1610489968000)/', 'timestamptz')).toBe('2021-01-12T22:19:28.000Z');
  });
  test('MS Date format without timestamptz hint -> escaped passthrough', () => {
    expect(encodeCopyField('/Date(1610489968000)/', 'text')).toBe('/Date(1610489968000)/');
  });
});

describe('toSnakeCase', () => {
  test('camel case', () => {
    expect(toSnakeCase('InventoryMaster')).toBe('inventory_master');
    expect(toSnakeCase('InvCatalog')).toBe('inv_catalog');
  });
  test('spaces and hyphens to underscore', () => {
    expect(toSnakeCase('Vendor Master')).toBe('vendor_master');
    expect(toSnakeCase('Short Name')).toBe('short_name');
    expect(toSnakeCase('Inventory Quantities')).toBe('inventory_quantities');
  });
  test('all-caps acronyms', () => {
    expect(toSnakeCase('NRMACodes')).toBe('nrma_codes');
    expect(toSnakeCase('RITRNSSV')).toBe('ritrnssv');
  });
  test('collapses multiple underscores', () => {
    expect(toSnakeCase('A  B')).toBe('a_b');
    expect(toSnakeCase('A_-B')).toBe('a_b');
  });
});

describe('quoteIdent', () => {
  test('wraps in double quotes', () => {
    expect(quoteIdent('hello')).toBe('"hello"');
    expect(quoteIdent('inventory_master')).toBe('"inventory_master"');
  });

  test('doubles embedded quotes', () => {
    expect(quoteIdent('weird"name')).toBe('"weird""name"');
  });
});
