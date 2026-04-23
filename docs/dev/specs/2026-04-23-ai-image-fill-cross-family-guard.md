# AI Image-Fill — Cross-Family Category Guard

**Date:** 2026-04-23
**Source:** `/index-knowledge` pass — bug surfaced when a boot image pasted into the SKU creator with Familia=Zapatos auto-filled Category to `23 — Pend Clasificar (TRAJES MARCA HOMBRE)`, a row in the `suits` family.
**Type:** Design decision

## Context

The SKU creator at `/products/skus/new` runs an AI image analysis on each paste / drag-drop. Claude Vision returns ~15 attribute hints; `mapAiResultsToReferenceIds` in [`apps/api/src/services/aiFieldMappingService.ts`](../../../apps/api/src/services/aiFieldMappingService.ts) resolves those hints to numeric reference ids via fuzzy-substring matching against the legacy SQLite ref tables, then the route overlays a family-validated `resolution` on top.

The family-aware path (`analyzeShoeImage` → `isCategoryInFamilyAllowList` → `resolveCategory`) correctly rejects cross-family category numbers: when Claude returns `"565 — Zap Pend Clasif"` and 565 IS in the `zapatos` allowlist, resolution succeeds. The bug wasn't in that arm.

The bug lived in the *legacy* arm: `mapAiResultsToReferenceIds` fuzzy-matched Claude's raw category text against the SQLite `categories` ref table without any family awareness. Claude's text `"565 — Zap Pend Clasif"` contains the substring `"Pend Clasificar"`, which the fuzzy matcher happily resolved to the first ref row named "Pend Clasificar" — category 23, which lives in the `suits` family. The route then overlaid the new fields (`categoryCode`, `categoryName`, `familyCode`) from the family-validated resolution but left the stale `mapped.categoryId = 23` in place. The frontend preferred `mapped.categoryId` (numeric) over the new string fields and applied it silently.

User-visible symptom: Familia=Zapatos selected at the top; the Detalles "Familia: …" tag contradicted it, showing "Trajes / Conjuntos" next to the auto-filled Pend Clasificar category.

## Decision / Design

Two-spot, defense-in-depth fix.

### 1. Backend — align `mapped.categoryId` with the family-validated resolution

In [`apps/api/src/routes/products/skuRoutes.ts`](../../../apps/api/src/routes/products/skuRoutes.ts) the `/analyze-image` handler now re-writes `mapped.categoryId` based on the resolution outcome:

- If `resolution` succeeded → `mapped.categoryId = resolution.categoryNumber` (overwrites any fuzzy-match value).
- If `resolution` is null (family check rejected or AI returned no category) → `mapped.categoryId = null`.

This alone closes the end-to-end bug. The legacy fuzzy-matched `categoryId` can no longer leak across families because the route is the single boundary where the client reads the value.

### 2. Frontend — belt-and-suspenders cross-family guard

In `applyAiFill()` at [`apps/web/src/pages/inventory/SkuFormPage.tsx`](../../../apps/web/src/pages/inventory/SkuFormPage.tsx) the category branch now rejects a resolved category whose `familyCode` differs from the operator's selected family:

```ts
const cat = validCategoriesById.get(matchedId)
if (cat && (!selectedFamily || !cat.familyCode || cat.familyCode === selectedFamily)) {
  // apply
} else {
  skipped.push('categoryId')   // surfaces in the AI-fill summary strip
}
```

The `!selectedFamily` / `!cat.familyCode` short-circuits keep legitimate pre-Family-picker flows (legacy /inventory/skus/new, or categories with no mapping) functional. The check fires only when both sides are known and disagree.

### 3. Why both layers

- Backend fix alone is sufficient for *this* bug. But the legacy fuzzy-matcher is still in the code, still invoked, and still available to any future route that forgets to overlay. The frontend check protects against that.
- Frontend alone is insufficient — the backend still ships a wrong `categoryId`, which would be applied anywhere that doesn't duplicate the guard (utilities batch paths, future admin UIs reading the same route).

### 4. What was NOT changed

- `mapAiResultsToReferenceIds` itself. The fuzzy matcher still runs against every other AI reference field (color, pattern, heel-height, etc.); those have no cross-family concern today because they aren't family-scoped. If a future reference field gains family scope, the same overlay pattern applies at the route boundary.
- The family-aware path in `imageAnalysisService` is untouched; it was correct.

## Related

- [`docs/dev/specs/2026-04-18-products-phase1-design.md`](2026-04-18-products-phase1-design.md) — broader products-phase-1 framing (AI_FIELD_MAP, reference data plumbing).
- [`docs/dev/specs/2026-04-23-postgres-only-development-policy.md`](2026-04-23-postgres-only-development-policy.md) — the migration backlog that eventually retires the fuzzy matcher entirely (when `colorId` et al. become proper dimensions).
