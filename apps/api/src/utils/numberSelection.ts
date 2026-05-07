export interface PositiveIntegerSelectionResult {
  values: number[];
  error: string | null;
}

/**
 * Parses report number selections such as "1-2,5-17,19".
 * Duplicate values are removed while preserving the user's order.
 */
export function parsePositiveIntegerSelection(
  raw: string | null | undefined,
  options: { maxExpandedValues?: number } = {},
): PositiveIntegerSelectionResult {
  const text = raw?.trim() ?? '';
  if (!text) return { values: [], error: null };

  const maxExpandedValues = options.maxExpandedValues ?? 10_000;
  const values: number[] = [];
  const seen = new Set<number>();

  for (const token of text.split(',')) {
    const part = token.trim();
    if (!part) {
      return { values: [], error: 'Use commas between numbers and ranges.' };
    }

    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) {
      return { values: [], error: `Invalid number selection "${part}".` };
    }

    const start = Number(match[1]);
    const end = match[2] == null ? start : Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end <= 0) {
      return { values: [], error: `Invalid number selection "${part}".` };
    }
    if (end < start) {
      return { values: [], error: `Range "${part}" must run from low to high.` };
    }
    if (end - start + 1 > maxExpandedValues) {
      return { values: [], error: `Range "${part}" is too large.` };
    }

    for (let value = start; value <= end; value += 1) {
      if (seen.has(value)) continue;
      values.push(value);
      seen.add(value);
    }
  }

  return { values, error: null };
}
