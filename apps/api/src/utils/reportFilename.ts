export type ReportFilenameValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean)[];

export interface ReportFilenameCriterion {
  key?: string;
  value: ReportFilenameValue;
  defaultValue?: ReportFilenameValue;
  includeIfDefault?: boolean;
}

const MAX_TOKEN_LENGTH = 48;
const MAX_STEM_LENGTH = 180;

function hasValue(value: ReportFilenameValue): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function normalizeValue(value: ReportFilenameValue): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join('_');
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value ?? '');
}

function sameValue(left: ReportFilenameValue, right: ReportFilenameValue): boolean {
  return normalizeValue(left) === normalizeValue(right);
}

export function sanitizeFilenameToken(value: string | number | boolean): string {
  const readableOperators = String(value)
    .trim()
    .replace(/<>/g, ' not ')
    .replace(/>=/g, ' gte ')
    .replace(/<=/g, ' lte ')
    .replace(/>/g, ' gt ')
    .replace(/</g, ' lt ')
    .replace(/\*/g, ' star ')
    .replace(/\?/g, ' q ');

  const sanitized = readableOperators
    .replace(/['"]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  if (sanitized.length <= MAX_TOKEN_LENGTH) return sanitized;
  return sanitized.slice(0, MAX_TOKEN_LENGTH).replace(/-+$/g, '');
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0').slice(0, 7);
}

export function buildReportFilename(
  baseStem: string,
  extension: string,
  criteria: readonly ReportFilenameCriterion[] = [],
): string {
  const extensionToken = sanitizeFilenameToken(extension.replace(/^\./, '')).toLowerCase() || 'txt';
  const base = sanitizeFilenameToken(baseStem.replace(/\.(csv|xlsx)$/i, '')) || 'report';
  const parts = [base];

  for (const criterion of criteria) {
    if (!hasValue(criterion.value)) continue;
    if (
      criterion.defaultValue !== undefined &&
      !criterion.includeIfDefault &&
      sameValue(criterion.value, criterion.defaultValue)
    ) {
      continue;
    }

    const key = criterion.key ? sanitizeFilenameToken(criterion.key) : '';
    const value = sanitizeFilenameToken(normalizeValue(criterion.value));
    if (!value) continue;
    parts.push(key ? `${key}-${value}` : value);
  }

  const fullStem = parts.join('-').replace(/-+/g, '-');
  const stem = fullStem.length > MAX_STEM_LENGTH
    ? `${fullStem.slice(0, MAX_STEM_LENGTH - 8).replace(/-+$/g, '')}-${shortHash(fullStem)}`
    : fullStem.replace(/-+$/g, '');
  return `${stem || 'report'}.${extensionToken}`;
}
