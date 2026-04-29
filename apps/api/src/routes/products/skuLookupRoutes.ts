/**
 * SKU criteria lookup — the read primitive behind the utilities criteria picker
 * (and, in a follow-up, the products SKU list workbench).
 *
 * Spec: docs/dev/specs/2026-04-21-utilities-batch-change-design.md
 *
 * Mount at /api/v1/products/skus/lookup (POST body for arrays).
 */

import { Router, type IRouter, type Request, type Response } from 'express';
import { findSkusByCriteria } from '../../services/utilities/effectiveInventory';
import type { SkuCriteria } from '../../services/utilities/types';

const router: IRouter = Router();

router.post('/', async (req: Request, res: Response) => {
  const criteria = normalizeCriteria(req.body ?? {});
  const sampleLimit = clampInt((req.body as Record<string, unknown>)?.sampleLimit, 20, 0, 200);
  try {
    const result = await findSkusByCriteria(criteria, { sampleLimit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { code: 'InternalError', message: (err as Error).message } });
  }
});

function normalizeCriteria(body: Record<string, unknown>): SkuCriteria {
  return {
    skus:             toStringArray(body.skus),
    categories:       toIntArray(body.categories),
    vendors:          toStringArray(body.vendors),
    seasons:          toStringArray(body.seasons),
    stylesColors:     toStringArray(body.stylesColors),
    groups:           toStringArray(body.groups),
    keywords:         toStringArray(body.keywords),
    attributes:       toAttributeFilters(body.attributes),
    onlyFuturePriceChanges: body.onlyFuturePriceChanges === true,
    onlyWtdSales:     body.onlyWtdSales === true,
  };
}

function toAttributeFilters(raw: unknown): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const values = toStringArray(value);
    if (key.trim() && values?.length) out[key.trim()] = values;
  }
  return Object.keys(out).length ? out : undefined;
}

function toStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (t) out.push(t);
  }
  return out.length ? out : undefined;
}

function toIntArray(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: number[] = [];
  for (const v of raw) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && Number.isInteger(n)) out.push(n);
  }
  return out.length ? out : undefined;
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  if (raw == null) return fallback;
  const n = typeof raw === 'number' ? raw : Number(raw as string);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export default router;
