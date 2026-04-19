/**
 * RICS criteria-grammar parser.
 *
 * References:
 * - docs/modules/sales-reporting.md line 199 — shared criteria shape.
 * - docs/rics-reference/77manual.txt lines ~580-632 (RICS v7.7 p. 7-8).
 *
 * Supported grammar (all within a single field value):
 *   - Lists:         `NIKE,ADIDAS,PUMA`
 *   - Ranges:        `556-599` (numeric; equal-length alpha ranges accepted)
 *   - Exclusions:    `<>NIKE`, `<>556-599`   (applies to that term only)
 *   - Wildcards:     `?` matches one char; `*` matches zero-or-more
 *   - Hyphen-escape: `100!-120` treats the whole literal as `100-120` (not a range)
 *   - Keyword AND:   a leading `+` on the first term requires ALL keywords match
 *
 * The parser converts raw text into a structured `CriteriaExpression` that
 * adapters and facades can evaluate without re-implementing the grammar.
 *
 * Scope note: v1 handles ranges, lists, exclusions, wildcards and the hyphen-
 * escape. The keyword AND operator on the `keywords` facet is a flag on the
 * expression. Matching logic lives in `matchesCriteria()` and runs against
 * either strings or numeric-range tokens.
 */

/** One token inside a criteria expression. */
export type CriteriaToken =
  | { kind: 'literal'; value: string; excluded: boolean }
  | { kind: 'range'; from: string; to: string; numeric: boolean; excluded: boolean }
  | { kind: 'pattern'; pattern: RegExp; source: string; excluded: boolean };

export interface CriteriaExpression {
  raw: string;
  /** Every user-supplied token, preserving order. */
  tokens: CriteriaToken[];
  /** True if the raw input started with `+` (keyword-AND). */
  andMode: boolean;
  /** True if the input had no tokens (i.e. "match everything"). */
  empty: boolean;
}

const HYPHEN_ESCAPE = '\u0001'; // placeholder for `!-` so split-on-`-` ignores it
const COMMA_ESCAPE = '\u0002';   // placeholder used only during split of wildcard-translation

/**
 * Parse a raw criteria string into a structured expression.
 * Returns `{ empty: true }` on blank input — callers treat that as "no filter".
 */
export function parseCriteria(raw: string | null | undefined): CriteriaExpression {
  const text = (raw ?? '').trim();
  if (!text) {
    return { raw: '', tokens: [], andMode: false, empty: true };
  }

  let andMode = false;
  let work = text;
  if (work.startsWith('+')) {
    andMode = true;
    work = work.slice(1).trim();
  }

  // Preserve `!-` as a literal hyphen before splitting on `,` for lists.
  const escaped = work.replace(/!-/g, HYPHEN_ESCAPE);

  // Split into comma-separated terms, respecting leading/trailing spaces per term.
  const terms = escaped
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const tokens: CriteriaToken[] = [];
  for (const term of terms) {
    tokens.push(parseTerm(term));
  }

  return {
    raw: text,
    tokens,
    andMode,
    empty: tokens.length === 0,
  };
}

function parseTerm(termRaw: string): CriteriaToken {
  let term = termRaw;
  let excluded = false;
  if (term.startsWith('<>')) {
    excluded = true;
    term = term.slice(2).trim();
  }
  // Un-escape the placeholder back to `-` for display, but remember which
  // `-` were literal so we don't treat them as range separators.
  const literalTerm = term.replace(new RegExp(HYPHEN_ESCAPE, 'g'), '-');

  // Wildcards beat ranges — if either `?` or `*` appears anywhere, build a regex.
  if (/[?*]/.test(term)) {
    return {
      kind: 'pattern',
      pattern: wildcardToRegex(literalTerm),
      source: literalTerm,
      excluded,
    };
  }

  // Range detection: exactly one unescaped `-`, same length on both sides,
  // RICS requires numeric-only to be treated as a numeric range. For alpha
  // mixed entries we still honor range if the two sides are the same length
  // (the manual uses "same number of characters" as the rule).
  const hyphenIdx = indexOfUnescapedHyphen(term);
  if (hyphenIdx > 0 && hyphenIdx < term.length - 1) {
    const lhs = term.slice(0, hyphenIdx);
    const rhs = term.slice(hyphenIdx + 1);
    if (isPureNumber(lhs) && isPureNumber(rhs) && lhs.length === rhs.length) {
      return { kind: 'range', from: lhs, to: rhs, numeric: true, excluded };
    }
    if (lhs.length === rhs.length) {
      return { kind: 'range', from: lhs, to: rhs, numeric: false, excluded };
    }
  }

  return { kind: 'literal', value: literalTerm, excluded };
}

function isPureNumber(s: string): boolean {
  return /^-?\d+$/.test(s);
}

function indexOfUnescapedHyphen(term: string): number {
  // `term` may still contain HYPHEN_ESCAPE placeholders; we want the first
  // real `-` index. (Leading `-` is not a range separator.)
  for (let i = 1; i < term.length; i++) {
    if (term[i] === '-') return i;
  }
  return -1;
}

/**
 * Convert a RICS wildcard term into a case-insensitive regex.
 * `?` → `.`, `*` → `.*`. Anchors the full string.
 */
function wildcardToRegex(term: string): RegExp {
  // Escape regex metacharacters other than our wildcards.
  let out = '';
  for (const ch of term) {
    if (ch === '?') out += '.';
    else if (ch === '*') out += '.*';
    else if (/[-\\^$+.()|[\]{}]/.test(ch)) out += `\\${ch}`;
    else out += ch;
  }
  return new RegExp(`^${out}$`, 'i');
}

// ─────────────────────────── matching ─────────────────────────────────────

/**
 * Returns true if `candidate` satisfies the criteria.
 *
 * String semantics — case-insensitive literal / range / pattern match. For
 * ranges with `numeric: true`, both candidate and bounds are coerced to
 * numbers; otherwise the range is a lexicographic comparison on equal-length
 * strings (matches the RICS "same number of characters" rule).
 *
 * Numeric candidates (Category, Store) — pass the number directly; it is
 * stringified inside the function for pattern comparison.
 *
 * Empty expression → always matches. This keeps `matchesCriteria()` safe to
 * call unconditionally in adapters.
 *
 * Exclusion semantics — if ANY token marked `excluded` matches the candidate,
 * the whole expression fails. An excluded token on a non-matching candidate
 * is a no-op (i.e. `<>NIKE` never prevents `ADIDAS` from matching).
 *
 * Inclusion semantics — at least one non-excluded token must match. If every
 * token is excluded, the expression matches anything that doesn't hit any
 * exclusion (i.e. `<>NIKE` alone = everything except NIKE).
 */
export function matchesCriteria(
  expr: CriteriaExpression,
  candidate: string | number | null | undefined,
): boolean {
  if (expr.empty) return true;
  if (candidate == null) return false;
  const candStr = String(candidate).trim();

  let anyIncludeMatched = false;
  let anyIncludeToken = false;
  for (const t of expr.tokens) {
    const matched = tokenMatches(t, candStr);
    if (matched && t.excluded) return false;
    if (!t.excluded) {
      anyIncludeToken = true;
      if (matched) anyIncludeMatched = true;
    }
  }
  if (!anyIncludeToken) return true;  // only exclusions present → passes by default
  return anyIncludeMatched;
}

function tokenMatches(token: CriteriaToken, candidate: string): boolean {
  switch (token.kind) {
    case 'literal':
      return candidate.toLowerCase() === token.value.toLowerCase();
    case 'pattern':
      return token.pattern.test(candidate);
    case 'range': {
      if (token.numeric) {
        const n = Number(candidate);
        if (Number.isNaN(n)) return false;
        return n >= Number(token.from) && n <= Number(token.to);
      }
      // Alpha range: require same length to be meaningful (per manual).
      if (candidate.length !== token.from.length) return false;
      return (
        candidate.toUpperCase() >= token.from.toUpperCase() &&
        candidate.toUpperCase() <= token.to.toUpperCase()
      );
    }
  }
}

/**
 * Match a candidate's space-separated keyword list against a criteria
 * expression. Used for the `keywords` facet. Honors `andMode` on the
 * expression — when set, every non-excluded token must match at least one
 * keyword; otherwise any non-excluded token matching any keyword is a hit.
 * Exclusions still short-circuit as in `matchesCriteria`.
 */
export function matchesKeywords(
  expr: CriteriaExpression,
  keywords: string | null | undefined,
): boolean {
  if (expr.empty) return true;
  const list = (keywords ?? '')
    .split(/[\s,]+/)
    .map((k) => k.trim())
    .filter(Boolean);
  if (list.length === 0) {
    // No keywords on the SKU — only passes when the expression is empty or
    // has only exclusions.
    const hasIncludeToken = expr.tokens.some((t) => !t.excluded);
    return !hasIncludeToken;
  }
  // Exclusion check first.
  for (const t of expr.tokens) {
    if (!t.excluded) continue;
    for (const kw of list) {
      if (tokenMatches(t, kw)) return false;
    }
  }
  const includeTokens = expr.tokens.filter((t) => !t.excluded);
  if (includeTokens.length === 0) return true;
  if (expr.andMode) {
    return includeTokens.every((t) => list.some((kw) => tokenMatches(t, kw)));
  }
  return includeTokens.some((t) => list.some((kw) => tokenMatches(t, kw)));
}

/**
 * For SQL-level pre-filtering — extract a list of fully-qualified literal
 * values (no wildcards, no ranges, no exclusions) so an adapter can push a
 * narrow `IN (...)` filter down to Access. Returns `null` if the expression
 * can't be cleanly projected into an IN-clause, signalling "apply in memory".
 *
 * Ranges on numeric fields can use `sqlRangeBounds` instead.
 */
export function sqlInLiterals(expr: CriteriaExpression): string[] | null {
  if (expr.empty) return null;
  if (expr.tokens.some((t) => t.excluded)) return null;
  const out: string[] = [];
  for (const t of expr.tokens) {
    if (t.kind !== 'literal') return null;
    out.push(t.value);
  }
  return out;
}
