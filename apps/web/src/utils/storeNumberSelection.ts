export interface StoreNumberSelectionResult {
  storeNumbers: number[];
  error: string | null;
}

export function parseStoreNumberSelectionText(
  value: string,
  availableStoreNumbers: number[] = [],
): StoreNumberSelectionResult {
  const trimmed = value.trim();
  if (!trimmed) return { storeNumbers: [], error: null };

  const knownStores = Array.from(
    new Set(
      availableStoreNumbers
        .map((storeNumber) => Number(storeNumber))
        .filter((storeNumber) => Number.isInteger(storeNumber) && storeNumber > 0),
    ),
  ).sort((a, b) => a - b);
  const knownStoreSet = new Set(knownStores);
  const hasKnownStores = knownStores.length > 0;
  const selected: number[] = [];
  const seen = new Set<number>();

  for (const token of trimmed.split(',')) {
    const part = token.trim();
    if (!part) {
      return { storeNumbers: [], error: 'Use commas between store numbers and ranges.' };
    }

    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) {
      return { storeNumbers: [], error: `Invalid store range "${part}".` };
    }

    const start = Number(match[1]);
    const end = match[2] == null ? start : Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end <= 0) {
      return { storeNumbers: [], error: `Invalid store range "${part}".` };
    }
    if (end < start) {
      return { storeNumbers: [], error: `Store range "${part}" must run from low to high.` };
    }

    let expanded: number[];
    if (match[2] == null) {
      expanded = !hasKnownStores || knownStoreSet.has(start) ? [start] : [];
    } else if (hasKnownStores) {
      expanded = knownStores.filter((storeNumber) => storeNumber >= start && storeNumber <= end);
    } else {
      expanded = Array.from({ length: end - start + 1 }, (_item, index) => start + index);
    }

    if (expanded.length === 0) {
      return { storeNumbers: [], error: `No active stores found for "${part}".` };
    }
    if (!hasKnownStores && expanded.length > 500) {
      return { storeNumbers: [], error: `Store range "${part}" is too large.` };
    }

    for (const storeNumber of expanded) {
      if (seen.has(storeNumber)) continue;
      selected.push(storeNumber);
      seen.add(storeNumber);
    }
  }

  return { storeNumbers: selected, error: null };
}

export function parseOptionalStoreNumberSelectionText(value: string): number[] | undefined {
  const parsed = parseStoreNumberSelectionText(value);
  return parsed.storeNumbers.length ? parsed.storeNumbers : undefined;
}
