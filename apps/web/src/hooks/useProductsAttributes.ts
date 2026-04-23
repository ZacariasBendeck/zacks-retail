import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  productsAttributesApi,
  type DimensionInput,
  type DimensionPatch,
  type FamilyRulesReplaceInput,
  type ValueInput,
  type ValuePatch,
} from '../services/productsAttributesApi'
import type { SetSkuAttributesInput } from '../types/productsAttributes'

const CATALOG_STALE_MS = 5 * 60 * 1000

/**
 * Shared invalidator for admin mutations. Drops every cached attribute query
 * (dimensions + coverage + per-SKU + family-rules) plus the Families-page
 * attribute-rules views, which mirror the same data from the other side.
 */
function invalidateAllAttributes(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['products-attributes'] })
  qc.invalidateQueries({ queryKey: ['product-families'] })
  qc.invalidateQueries({ queryKey: ['products-skus'] })
}

export function useAttributeDimensions(withCounts = false) {
  return useQuery({
    queryKey: ['products-attributes', 'dimensions', { withCounts }],
    queryFn: () => productsAttributesApi.listDimensions(withCounts),
    staleTime: CATALOG_STALE_MS,
  })
}

export function useSkuAttributes(code: string | undefined) {
  return useQuery({
    queryKey: ['products-attributes', 'sku', code],
    queryFn: () => productsAttributesApi.getForSku(code!),
    enabled: !!code,
    staleTime: CATALOG_STALE_MS,
  })
}

export function useSetSkuAttributes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, input }: { code: string; input: SetSkuAttributesInput }) =>
      productsAttributesApi.setForSku(code, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['products-attributes', 'sku', vars.code] })
      qc.invalidateQueries({ queryKey: ['products-attributes', 'dimensions'] })
      qc.invalidateQueries({ queryKey: ['products-skus'] })
    },
  })
}

export function useAttributeCoverage() {
  return useQuery({
    queryKey: ['products-attributes', 'coverage'],
    queryFn: () => productsAttributesApi.coverage(),
    staleTime: CATALOG_STALE_MS,
  })
}

// ──────────────── Dimension admin ────────────────

export function useCreateDimension() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: DimensionInput) => productsAttributesApi.createDimension(input),
    onSuccess: () => invalidateAllAttributes(qc),
  })
}

export function useUpdateDimension() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, patch }: { code: string; patch: DimensionPatch }) =>
      productsAttributesApi.updateDimension(code, patch),
    onSuccess: () => invalidateAllAttributes(qc),
  })
}

export function useDeleteDimension() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => productsAttributesApi.deleteDimension(code),
    onSuccess: () => invalidateAllAttributes(qc),
  })
}

export function useReorderDimensions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entries: { code: string; sortOrder: number }[]) =>
      productsAttributesApi.reorderDimensions(entries),
    onSuccess: () => invalidateAllAttributes(qc),
  })
}

// ──────────────── Family rules (from dim side) ────────────────

export function useDimensionFamilyRules(dimensionCode: string | null) {
  return useQuery({
    queryKey: ['products-attributes', 'family-rules', dimensionCode],
    queryFn: () => productsAttributesApi.getFamilyRules(dimensionCode!),
    enabled: !!dimensionCode,
    staleTime: CATALOG_STALE_MS,
  })
}

export function useReplaceDimensionFamilyRules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dimensionCode, input }: { dimensionCode: string; input: FamilyRulesReplaceInput }) =>
      productsAttributesApi.replaceFamilyRules(dimensionCode, input),
    onSuccess: () => invalidateAllAttributes(qc),
  })
}

// ──────────────── Value admin ────────────────

export function useCreateValue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dimensionCode, input }: { dimensionCode: string; input: ValueInput }) =>
      productsAttributesApi.createValue(dimensionCode, input),
    onSuccess: () => invalidateAllAttributes(qc),
  })
}

export function useUpdateValue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: ValuePatch }) =>
      productsAttributesApi.updateValue(id, patch),
    onSuccess: () => invalidateAllAttributes(qc),
  })
}

export function useDeleteValue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => productsAttributesApi.deleteValue(id),
    onSuccess: () => invalidateAllAttributes(qc),
  })
}

export function useDeactivateValue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => productsAttributesApi.deactivateValue(id),
    onSuccess: () => invalidateAllAttributes(qc),
  })
}

export function useMergeValues() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: number; targetId: number }) =>
      productsAttributesApi.mergeValues(sourceId, targetId),
    onSuccess: () => invalidateAllAttributes(qc),
  })
}

export function useReorderValues() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      dimensionCode,
      entries,
    }: {
      dimensionCode: string
      entries: { valueId: number; sortOrder: number }[]
    }) => productsAttributesApi.reorderValues(dimensionCode, entries),
    onSuccess: () => invalidateAllAttributes(qc),
  })
}
