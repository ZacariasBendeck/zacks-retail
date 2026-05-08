import { prisma } from '../../db/prisma';
import {
  type CriteriaExpression,
  type CriteriaToken,
  matchesCriteria,
  matchesKeywords,
  parseCriteria,
} from '../../utils/criteriaGrammar';
import { parsePositiveIntegerSelection } from '../../utils/numberSelection';
import type { SalesAnalysisCriteria } from './types';

function hasList<T>(values: T[] | undefined): boolean {
  return Array.isArray(values) && values.length > 0;
}

function hasText(value: string | undefined): boolean {
  return !!value?.trim();
}

export function hasSharedStoreCriteria(criteria: SalesAnalysisCriteria | undefined): boolean {
  if (!criteria) return false;
  return hasList(criteria.stores) || hasList(criteria.chains) || hasText(criteria.storesRaw);
}

export function hasSharedProductCriteria(criteria: SalesAnalysisCriteria | undefined): boolean {
  if (!criteria) return false;
  return (
    hasList(criteria.sectors) ||
    hasList(criteria.departments) ||
    hasList(criteria.categories) ||
    hasList(criteria.vendors) ||
    hasList(criteria.seasons) ||
    hasList(criteria.skus) ||
    hasList(criteria.groups) ||
    hasList(criteria.keywords) ||
    hasList(criteria.buyers) ||
    hasText(criteria.categoriesRaw) ||
    hasText(criteria.vendorsRaw) ||
    hasText(criteria.seasonsRaw) ||
    hasText(criteria.skusRaw) ||
    hasText(criteria.groupsRaw) ||
    hasText(criteria.keywordsRaw) ||
    hasText(criteria.styleColorRaw) ||
    hasText(criteria.styleColor)
  );
}

function selectedStringKeeps(selected: string[] | undefined, value: string | null | undefined): boolean {
  if (!selected?.length) return true;
  const normalizedValue = value?.trim().toUpperCase();
  if (!normalizedValue) return false;
  return selected.some((candidate) => candidate.trim().toUpperCase() === normalizedValue);
}

function selectedNumberKeeps(selected: number[] | undefined, value: number | null | undefined): boolean {
  if (!selected?.length) return true;
  if (value == null) return false;
  return selected.some((candidate) => Number(candidate) === Number(value));
}

function emptyExpression(raw = ''): CriteriaExpression {
  return { raw, tokens: [], andMode: false, empty: true };
}

function structuredExpression(values: Array<string | number> | undefined): CriteriaExpression {
  return parseCriteria(values?.map((value) => String(value)).join(','));
}

export function parseIntegerCriteriaExpression(raw: string | undefined): CriteriaExpression {
  const text = raw?.trim() ?? '';
  if (!text) return emptyExpression();

  const tokens: CriteriaToken[] = [];
  for (const piece of text.split(',')) {
    const part = piece.trim();
    if (!part) return parseCriteria(raw);

    const excluded = part.startsWith('<>');
    const body = excluded ? part.slice(2).trim() : part;
    if (/[?*!]/.test(body)) return parseCriteria(raw);

    const match = body.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) return parseCriteria(raw);

    const from = match[1]!;
    const to = match[2];
    if (to == null) {
      tokens.push({ kind: 'literal', value: from, excluded });
      continue;
    }

    const start = Number(from);
    const end = Number(to);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end <= 0 || end < start) {
      return parseCriteria(raw);
    }
    tokens.push({ kind: 'range', from, to, numeric: true, excluded });
  }

  return {
    raw: text,
    tokens,
    andMode: false,
    empty: tokens.length === 0,
  };
}

export function parseStoreCriteriaExpression(raw: string | undefined): CriteriaExpression {
  const parsedRange = parsePositiveIntegerSelection(raw);
  if (!parsedRange.error && parsedRange.values.length > 0) return structuredExpression(parsedRange.values);
  if (!parsedRange.error) return emptyExpression();
  return parseIntegerCriteriaExpression(raw);
}

function parseCategoryCriteriaExpression(raw: string | undefined): CriteriaExpression {
  return parseIntegerCriteriaExpression(raw);
}

export function facetKeeps<T extends string | number>(
  selected: T[] | undefined,
  expr: CriteriaExpression,
  candidate: string | number | null | undefined,
): boolean {
  const hasStructured = !!selected?.length;
  if (!hasStructured) return matchesCriteria(expr, candidate);

  const structuredHit = matchesCriteria(structuredExpression(selected), candidate);
  if (expr.empty) return structuredHit;

  const hasInclude = expr.tokens.some((token) => !token.excluded);
  if (hasInclude) {
    return structuredHit || matchesCriteria(expr, candidate);
  }

  return structuredHit && matchesCriteria(expr, candidate);
}

export function keywordFacetKeeps(
  selected: string[] | undefined,
  expr: CriteriaExpression,
  keywords: string | null | undefined,
): boolean {
  const hasStructured = !!selected?.length;
  if (!hasStructured) return matchesKeywords(expr, keywords);

  const structuredHit = matchesKeywords(structuredExpression(selected), keywords);
  if (expr.empty) return structuredHit;

  const hasInclude = expr.tokens.some((token) => !token.excluded);
  if (hasInclude) {
    return structuredHit || matchesKeywords(expr, keywords);
  }

  return structuredHit && matchesKeywords(expr, keywords);
}

export async function resolveSharedStoreNumbers(
  criteria: SalesAnalysisCriteria | undefined,
  requestedStores?: number[],
): Promise<number[] | undefined> {
  const c = criteria ?? {};
  const explicitStores = (requestedStores ?? [])
    .map((store) => Number(store))
    .filter((store) => Number.isInteger(store) && store > 0);

  if (!explicitStores.length && !hasSharedStoreCriteria(c)) return undefined;

  const [storeRows, chainRows] = await Promise.all([
    prisma.$queryRawUnsafe<{ number: number | null }[]>(`
      SELECT number
      FROM app.store_master
      ORDER BY number
    `),
    hasList(c.chains)
      ? prisma.$queryRawUnsafe<{ store_number: number | null; group_code: string | null }[]>(
          `
            SELECT sgm.store_number, sgm.group_code
            FROM app.store_group_member sgm
            INNER JOIN app.store_group sg ON sg.code = sgm.group_code
            WHERE sg.active = true
          `,
        )
      : Promise.resolve([]),
  ]);

  const allStores = storeRows
    .map((row) => Number(row.number))
    .filter((store) => Number.isInteger(store) && store > 0);
  const base = explicitStores.length ? explicitStores : allStores;
  const chainByStore = new Map<number, string>();
  for (const row of chainRows) {
    const storeNumber = Number(row.store_number);
    if (Number.isInteger(storeNumber) && storeNumber > 0 && row.group_code) {
      chainByStore.set(storeNumber, row.group_code.trim());
    }
  }

  const parsedStores = parseStoreCriteriaExpression(c.storesRaw);
  return Array.from(new Set(base))
    .filter((store) => facetKeeps(c.stores, parsedStores, store))
    .filter((store) => selectedStringKeeps(c.chains, chainByStore.get(store)))
    .sort((a, b) => a - b);
}

interface SharedSkuCriteriaRow {
  sku: string | null;
  category: number | null;
  vendor: string | null;
  season: string | null;
  group_code: string | null;
  style_color: string | null;
  keywords: string | null;
  department: number | null;
  sector: number | null;
  buyer_code: string | null;
}

export async function resolveSharedProductCriteriaSkuWhitelist(
  criteria: SalesAnalysisCriteria | undefined,
): Promise<string[] | null> {
  const c = criteria ?? {};
  if (!hasSharedProductCriteria(c)) return null;

  const parsed = {
    categories: parseCategoryCriteriaExpression(c.categoriesRaw),
    vendors: parseCriteria(c.vendorsRaw),
    seasons: parseCriteria(c.seasonsRaw),
    skus: parseCriteria(c.skusRaw),
    groups: parseCriteria(c.groupsRaw),
    styleColor: parseCriteria(c.styleColorRaw || c.styleColor),
    keywords: parseCriteria(c.keywordsRaw),
  };

  const rows = await prisma.$queryRawUnsafe<SharedSkuCriteriaRow[]>(`
    WITH base_keywords AS (
      SELECT UPPER(BTRIM(s.code)) AS sku_key, UPPER(BTRIM(kw.keyword)) AS keyword
      FROM app.sku s,
           UNNEST(string_to_array(COALESCE(s.keywords, ''), ' ')) AS kw(keyword)
      WHERE s.code IS NOT NULL
        AND BTRIM(s.code) <> ''
        AND BTRIM(kw.keyword) <> ''
    ),
    combined_keywords AS (
      SELECT sku_key, keyword FROM base_keywords
      UNION
      SELECT UPPER(BTRIM(o.rics_sku_code)) AS sku_key, UPPER(BTRIM(o.keyword)) AS keyword
      FROM app.sku_keyword_override o
      WHERE o.action = 'ADD'
    ),
    effective_keywords AS (
      SELECT sku_key, keyword FROM combined_keywords
      EXCEPT
      SELECT UPPER(BTRIM(o.rics_sku_code)) AS sku_key, UPPER(BTRIM(o.keyword)) AS keyword
      FROM app.sku_keyword_override o
      WHERE o.action = 'REMOVE'
    ),
    buyer_assignment AS (
      SELECT DISTINCT ON (UPPER(BTRIM(saa.sku_code)))
             UPPER(BTRIM(saa.sku_code)) AS sku_key,
             av.code AS buyer_code
      FROM app.sku_attribute_assignment saa
      JOIN app.attribute_dimension ad
        ON ad.id = saa.dimension_id
       AND ad.code = 'buyer'
      JOIN app.attribute_value av ON av.id = saa.value_id
      WHERE COALESCE(BTRIM(saa.sku_code), '') <> ''
      ORDER BY UPPER(BTRIM(saa.sku_code)), av.sort_order NULLS LAST, av.code
    )
    SELECT
      UPPER(BTRIM(s.code)) AS sku,
      s.category_number AS category,
      s.vendor_id AS vendor,
      s.season,
      s.group_code,
      s.style_color,
      NULLIF(STRING_AGG(ek.keyword, ' ' ORDER BY ek.keyword), '') AS keywords,
      td.number AS department,
      sec.number AS sector,
      ba.buyer_code
    FROM app.sku s
    LEFT JOIN effective_keywords ek ON ek.sku_key = UPPER(BTRIM(s.code))
    LEFT JOIN app.taxonomy_department td
      ON s.category_number BETWEEN td.beg_categ AND td.end_categ
    LEFT JOIN app.taxonomy_sector sec
      ON td.number BETWEEN sec.beg_dept AND sec.end_dept
    LEFT JOIN buyer_assignment ba ON ba.sku_key = UPPER(BTRIM(s.code))
    WHERE s.code IS NOT NULL
      AND BTRIM(s.code) <> ''
      AND COALESCE(s.rics_status, '') <> 'D'
    GROUP BY
      UPPER(BTRIM(s.code)),
      s.category_number,
      s.vendor_id,
      s.season,
      s.group_code,
      s.style_color,
      td.number,
      sec.number,
      ba.buyer_code
  `);

  const out: string[] = [];
  for (const row of rows) {
    const sku = row.sku?.trim().toUpperCase();
    if (!sku) continue;
    if (!selectedNumberKeeps(c.departments, row.department)) continue;
    if (!selectedNumberKeeps(c.sectors, row.sector)) continue;
    if (!facetKeeps(c.categories, parsed.categories, row.category)) continue;
    if (!facetKeeps(c.vendors, parsed.vendors, row.vendor)) continue;
    if (!facetKeeps(c.seasons, parsed.seasons, row.season)) continue;
    if (!facetKeeps(c.skus, parsed.skus, sku)) continue;
    if (!facetKeeps(c.groups, parsed.groups, row.group_code)) continue;
    if (!selectedStringKeeps(c.buyers, row.buyer_code)) continue;
    if (!matchesCriteria(parsed.styleColor, row.style_color)) continue;
    if (!keywordFacetKeeps(c.keywords, parsed.keywords, row.keywords)) continue;
    out.push(sku);
  }

  return Array.from(new Set(out)).sort((a, b) => a.localeCompare(b));
}
