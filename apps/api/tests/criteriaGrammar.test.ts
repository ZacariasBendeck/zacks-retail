/**
 * Unit tests for the RICS criteria-grammar parser.
 *
 * Reference: docs/rics-reference/77manual.txt lines ~580-632 (p. 7-8).
 */

import {
  parseCriteria,
  matchesCriteria,
  matchesKeywords,
} from '../src/utils/criteriaGrammar';

describe('parseCriteria', () => {
  it('treats blank input as an empty expression', () => {
    expect(parseCriteria('').empty).toBe(true);
    expect(parseCriteria(undefined).empty).toBe(true);
    expect(parseCriteria('   ').empty).toBe(true);
  });

  it('parses a literal list', () => {
    const expr = parseCriteria('NIKE, ADIDAS ,PUMA');
    expect(expr.empty).toBe(false);
    expect(expr.tokens).toHaveLength(3);
    expect(expr.tokens.every((t) => t.kind === 'literal' && !t.excluded)).toBe(true);
  });

  it('parses a numeric range', () => {
    const expr = parseCriteria('556-599');
    expect(expr.tokens).toHaveLength(1);
    expect(expr.tokens[0].kind).toBe('range');
    if (expr.tokens[0].kind === 'range') {
      expect(expr.tokens[0].numeric).toBe(true);
      expect(expr.tokens[0].from).toBe('556');
      expect(expr.tokens[0].to).toBe('599');
    }
  });

  it('parses exclusions', () => {
    const expr = parseCriteria('<>NIKE,<>400-449');
    expect(expr.tokens).toHaveLength(2);
    expect(expr.tokens[0].excluded).toBe(true);
    expect(expr.tokens[1].excluded).toBe(true);
  });

  it('treats !- as a literal hyphen (no range)', () => {
    const expr = parseCriteria('100!-120');
    expect(expr.tokens).toHaveLength(1);
    expect(expr.tokens[0].kind).toBe('literal');
    if (expr.tokens[0].kind === 'literal') {
      expect(expr.tokens[0].value).toBe('100-120');
    }
  });

  it('recognizes wildcards', () => {
    const expr = parseCriteria('???37,58*,*BLK');
    expect(expr.tokens).toHaveLength(3);
    expect(expr.tokens.every((t) => t.kind === 'pattern')).toBe(true);
  });

  it('recognizes leading + as keyword-AND mode', () => {
    const expr = parseCriteria('+WEDGE HEEL');
    expect(expr.andMode).toBe(true);
    // The rest after the + is treated as a single literal term.
    expect(expr.tokens).toHaveLength(1);
  });
});

describe('matchesCriteria', () => {
  it('literal list matches any listed value (case-insensitive)', () => {
    const expr = parseCriteria('NIKE,ADIDAS');
    expect(matchesCriteria(expr, 'nike')).toBe(true);
    expect(matchesCriteria(expr, 'PUMA')).toBe(false);
  });

  it('numeric range matches values within [from..to]', () => {
    const expr = parseCriteria('556-559');
    expect(matchesCriteria(expr, 556)).toBe(true);
    expect(matchesCriteria(expr, 559)).toBe(true);
    expect(matchesCriteria(expr, 560)).toBe(false);
  });

  it('exclusion rejects the excluded value and passes everything else', () => {
    const expr = parseCriteria('<>NIKE');
    expect(matchesCriteria(expr, 'NIKE')).toBe(false);
    expect(matchesCriteria(expr, 'ADIDAS')).toBe(true);
  });

  it('wildcards: `?` matches one char, `*` matches any', () => {
    const expr = parseCriteria('???37');
    expect(matchesCriteria(expr, 'AB937')).toBe(true);
    expect(matchesCriteria(expr, 'AB37')).toBe(false);       // only 2 chars before 37
    const star = parseCriteria('58*');
    expect(matchesCriteria(star, '5872BLK')).toBe(true);
    expect(matchesCriteria(star, '48BLK')).toBe(false);
  });

  it('empty expression matches everything', () => {
    expect(matchesCriteria(parseCriteria(''), 'ANYTHING')).toBe(true);
  });
});

describe('matchesKeywords', () => {
  it('any-match by default (OR)', () => {
    const expr = parseCriteria('WEDGE');
    expect(matchesKeywords(expr, 'WEDGE HEEL')).toBe(true);
    expect(matchesKeywords(expr, 'SNEAKER')).toBe(false);
  });

  it('AND mode requires every non-excluded token to hit a keyword', () => {
    const expr = parseCriteria('+WEDGE,HEEL');
    expect(matchesKeywords(expr, 'WEDGE HEEL')).toBe(true);
    expect(matchesKeywords(expr, 'WEDGE SNEAKER')).toBe(false);
  });

  it('exclusion on a keyword rejects SKUs with that keyword', () => {
    const expr = parseCriteria('<>PROMO');
    expect(matchesKeywords(expr, 'WEDGE PROMO')).toBe(false);
    expect(matchesKeywords(expr, 'WEDGE')).toBe(true);
  });
});
