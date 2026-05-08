import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProductFamily } from '../types/sku'
import {
  productFamiliesApi,
  type FamilyAttributeRuleInput,
  type FamilyCategory,
  type FamilyCreateInput,
  type FamilyMetadataPatch,
} from '../services/productFamiliesApi'

const CATALOG_STALE_MS = 10 * 60 * 1000

function invalidateAllFamilies(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['product-families'] })
  qc.invalidateQueries({ queryKey: ['product-categories'] })
  qc.invalidateQueries({ queryKey: ['products-attributes'] })
  qc.invalidateQueries({ queryKey: ['taxonomy', 'categories'] })
}

export function useProductFamilies() {
  return useQuery({
    queryKey: ['product-families', 'list'],
    queryFn: () => productFamiliesApi.list() as Promise<ProductFamily[]>,
    staleTime: CATALOG_STALE_MS,
  })
}

export function useCreateProductFamily() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: FamilyCreateInput) => productFamiliesApi.create(input),
    onSuccess: () => invalidateAllFamilies(qc),
  })
}

export function useFamilyCategories(code: string | null) {
  return useQuery({
    queryKey: ['product-families', 'categories', code],
    queryFn: () => productFamiliesApi.categories(code!) as Promise<FamilyCategory[]>,
    enabled: !!code,
    staleTime: CATALOG_STALE_MS,
  })
}

export function useFamilyAttributeRules(code: string | null) {
  return useQuery({
    queryKey: ['product-families', 'attribute-rules', code],
    queryFn: () => productFamiliesApi.attributeRules(code!),
    enabled: !!code,
    staleTime: CATALOG_STALE_MS,
  })
}

export function useUpdateFamilyMetadata() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, patch }: { code: string; patch: FamilyMetadataPatch }) =>
      productFamiliesApi.updateMetadata(code, patch),
    onSuccess: () => invalidateAllFamilies(qc),
  })
}

export function useReplaceFamilyCategories() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      code,
      categories,
      force,
    }: {
      code: string
      categories: number[]
      force?: boolean
    }) => productFamiliesApi.replaceCategories(code, categories, { force }),
    onSuccess: () => invalidateAllFamilies(qc),
  })
}

export function useReplaceFamilyAttributeRules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, rules }: { code: string; rules: FamilyAttributeRuleInput[] }) =>
      productFamiliesApi.replaceAttributeRules(code, rules),
    onSuccess: () => invalidateAllFamilies(qc),
  })
}

export function useToggleFamilyAttributeRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      familyCode,
      dimensionCode,
      patch,
    }: {
      familyCode: string
      dimensionCode: string
      patch: { enabled?: boolean; isRequired?: boolean; sortOrder?: number }
    }) => productFamiliesApi.toggleAttributeRule(familyCode, dimensionCode, patch),
    onSuccess: () => invalidateAllFamilies(qc),
  })
}

export function useRemoveFamilyAttributeRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ familyCode, dimensionCode }: { familyCode: string; dimensionCode: string }) =>
      productFamiliesApi.removeAttributeRule(familyCode, dimensionCode),
    onSuccess: () => invalidateAllFamilies(qc),
  })
}
