/**
 * TanStack Query hooks for the products-module taxonomy entities.
 * Each entity gets a list / get / create / update / delete trio.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  categoriesApi,
  categoryBuyerOptionsApi,
  departmentsApi,
  groupsApi,
  keywordsApi,
  nrfCodesApi,
  promotionCodesApi,
  resolveApi,
  returnCodesApi,
  seasonsApi,
  sectorsApi,
  sizeTypesApi,
  skuTotalApi,
} from '../services/productsTaxonomyApi'

/**
 * Taxonomy data changes rarely (department rename, new category) and the
 * PowerShell + Access read path is expensive (~1–2 s per call). Cache list
 * fetches for 10 minutes so navigating between Products pages serves from
 * cache instead of refetching every click. Mutations explicitly invalidate
 * so edits still appear instantly.
 */
const LIST_STALE_MS = 10 * 60 * 1000
import type {
  CategoryInput,
  DepartmentInput,
  GroupInput,
  KeywordInput,
  PromotionCodeInput,
  ReturnCodeInput,
  SeasonInput,
  SectorInput,
  SizeTypeInput,
} from '../types/productsTaxonomy'

// System-wide SKU total — shared denominator for the coverage footers.
export function useSkuTotal() {
  return useQuery({
    queryKey: ['taxonomy', 'sku-total'],
    queryFn: skuTotalApi.get,
    staleTime: LIST_STALE_MS,
  })
}

// Resolve Category → Department → Sector
export function useResolveTaxonomy(category: number | undefined) {
  return useQuery({
    queryKey: ['taxonomy', 'resolve', category],
    queryFn: () => resolveApi.forCategory(category!),
    enabled: category != null && Number.isFinite(category) && category > 0,
    staleTime: LIST_STALE_MS,
  })
}

// Departments
export function useDepartments() {
  return useQuery({ queryKey: ['taxonomy', 'departments'], queryFn: departmentsApi.list, staleTime: LIST_STALE_MS })
}
export function useDepartment(n: number | undefined) {
  return useQuery({
    queryKey: ['taxonomy', 'departments', n],
    queryFn: () => departmentsApi.get(n!),
    enabled: n != null,
  })
}
export function useCreateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: DepartmentInput) => departmentsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'departments'] }),
  })
}
export function useUpdateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ number, patch }: { number: number; patch: Partial<DepartmentInput> }) =>
      departmentsApi.update(number, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'departments'] }),
  })
}
export function useDeleteDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (n: number) => departmentsApi.remove(n),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'departments'] }),
  })
}

// Categories
export function useCategories() {
  return useQuery({ queryKey: ['taxonomy', 'categories'], queryFn: categoriesApi.list, staleTime: LIST_STALE_MS })
}
export function useCategory(n: number | undefined) {
  return useQuery({
    queryKey: ['taxonomy', 'categories', n],
    queryFn: () => categoriesApi.get(n!),
    enabled: n != null,
  })
}
export function useCategoryBuyerOptions() {
  return useQuery({
    queryKey: ['taxonomy', 'category-buyers', 'options'],
    queryFn: categoryBuyerOptionsApi.list,
    staleTime: LIST_STALE_MS,
  })
}
export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CategoryInput) => categoriesApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taxonomy', 'categories'] })
      qc.invalidateQueries({ queryKey: ['product-families'] })
    },
  })
}
export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ number, patch }: { number: number; patch: Partial<CategoryInput> }) =>
      categoriesApi.update(number, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taxonomy', 'categories'] })
      qc.invalidateQueries({ queryKey: ['product-families'] })
    },
  })
}
export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (n: number) => categoriesApi.remove(n),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taxonomy', 'categories'] })
      qc.invalidateQueries({ queryKey: ['product-families'] })
    },
  })
}

// Groups
export function useGroups() {
  return useQuery({ queryKey: ['taxonomy', 'groups'], queryFn: groupsApi.list, staleTime: LIST_STALE_MS })
}
export function useGroup(code: string | undefined) {
  return useQuery({
    queryKey: ['taxonomy', 'groups', code],
    queryFn: () => groupsApi.get(code!),
    enabled: !!code,
  })
}
export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: GroupInput) => groupsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'groups'] }),
  })
}
export function useUpdateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, patch }: { code: string; patch: Partial<GroupInput> }) =>
      groupsApi.update(code, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'groups'] }),
  })
}
export function useDeleteGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => groupsApi.remove(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'groups'] }),
  })
}

// Keywords
export function useKeywords() {
  return useQuery({ queryKey: ['taxonomy', 'keywords'], queryFn: keywordsApi.list, staleTime: LIST_STALE_MS })
}
export function useKeyword(k: string | undefined) {
  return useQuery({
    queryKey: ['taxonomy', 'keywords', k],
    queryFn: () => keywordsApi.get(k!),
    enabled: !!k,
  })
}
export function useCreateKeyword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: KeywordInput) => keywordsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'keywords'] }),
  })
}
export function useUpdateKeyword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ keyword, patch }: { keyword: string; patch: Partial<KeywordInput> }) =>
      keywordsApi.update(keyword, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'keywords'] }),
  })
}
export function useDeleteKeyword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (keyword: string) => keywordsApi.remove(keyword),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'keywords'] }),
  })
}

// Sectors
export function useSectors() {
  return useQuery({ queryKey: ['taxonomy', 'sectors'], queryFn: sectorsApi.list, staleTime: LIST_STALE_MS })
}
export function useSector(n: number | undefined) {
  return useQuery({
    queryKey: ['taxonomy', 'sectors', n],
    queryFn: () => sectorsApi.get(n!),
    enabled: n != null,
  })
}
export function useCreateSector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SectorInput) => sectorsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'sectors'] }),
  })
}
export function useUpdateSector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ number, patch }: { number: number; patch: Partial<SectorInput> }) =>
      sectorsApi.update(number, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'sectors'] }),
  })
}
export function useDeleteSector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (n: number) => sectorsApi.remove(n),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'sectors'] }),
  })
}

// Seasons
export function useSeasons() {
  return useQuery({ queryKey: ['taxonomy', 'seasons'], queryFn: seasonsApi.list, staleTime: LIST_STALE_MS })
}
export function useSeason(code: string | undefined) {
  return useQuery({
    queryKey: ['taxonomy', 'seasons', code],
    queryFn: () => seasonsApi.get(code!),
    enabled: !!code,
  })
}
export function useSeasonSource() {
  return useQuery({
    queryKey: ['taxonomy', 'seasons', '_source'],
    queryFn: () => seasonsApi.source(),
    staleTime: LIST_STALE_MS,
  })
}
export function useCreateSeason() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SeasonInput) => seasonsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'seasons'] }),
  })
}
export function useUpdateSeason() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, patch }: { code: string; patch: Partial<Omit<SeasonInput, 'code'>> }) =>
      seasonsApi.update(code, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'seasons'] }),
  })
}
export function useDeleteSeason() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => seasonsApi.remove(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'seasons'] }),
  })
}

// Return codes
export function useReturnCodes() {
  return useQuery({ queryKey: ['taxonomy', 'return-codes'], queryFn: returnCodesApi.list, staleTime: LIST_STALE_MS })
}
export function useReturnCode(n: number | undefined) {
  return useQuery({
    queryKey: ['taxonomy', 'return-codes', n],
    queryFn: () => returnCodesApi.get(n!),
    enabled: n != null,
  })
}
export function useCreateReturnCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ReturnCodeInput) => returnCodesApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'return-codes'] }),
  })
}
export function useUpdateReturnCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, patch }: { code: number; patch: Partial<ReturnCodeInput> }) =>
      returnCodesApi.update(code, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'return-codes'] }),
  })
}
export function useDeleteReturnCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (n: number) => returnCodesApi.remove(n),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'return-codes'] }),
  })
}

// Promotion codes
export function usePromotionCodes() {
  return useQuery({ queryKey: ['taxonomy', 'promotion-codes'], queryFn: promotionCodesApi.list, staleTime: LIST_STALE_MS })
}
export function usePromotionCode(code: string | undefined) {
  return useQuery({
    queryKey: ['taxonomy', 'promotion-codes', code],
    queryFn: () => promotionCodesApi.get(code!),
    enabled: !!code,
  })
}
export function useCreatePromotionCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PromotionCodeInput) => promotionCodesApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'promotion-codes'] }),
  })
}
export function useUpdatePromotionCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, patch }: { code: string; patch: Partial<PromotionCodeInput> }) =>
      promotionCodesApi.update(code, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'promotion-codes'] }),
  })
}
export function useDeletePromotionCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => promotionCodesApi.remove(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'promotion-codes'] }),
  })
}

// Size types
export function useSizeTypes() {
  return useQuery({ queryKey: ['taxonomy', 'size-types'], queryFn: sizeTypesApi.list, staleTime: LIST_STALE_MS })
}
export function useSizeType(n: number | undefined) {
  return useQuery({
    queryKey: ['taxonomy', 'size-types', n],
    queryFn: () => sizeTypesApi.get(n!),
    enabled: n != null,
  })
}
export function useCreateSizeType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SizeTypeInput) => sizeTypesApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'size-types'] }),
  })
}
export function useUpdateSizeType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, patch }: { code: number; patch: Partial<SizeTypeInput> }) =>
      sizeTypesApi.update(code, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'size-types'] }),
  })
}
export function useDeleteSizeType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (n: number) => sizeTypesApi.remove(n),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'size-types'] }),
  })
}

// NRF codes (read-only)
export function useNrfLookup(sizeTypeCode: number | undefined, rowLabel?: number, columnPosition?: number) {
  return useQuery({
    queryKey: ['taxonomy', 'nrf-codes', sizeTypeCode, rowLabel, columnPosition],
    queryFn: () => nrfCodesApi.lookup(sizeTypeCode!, rowLabel, columnPosition),
    enabled: sizeTypeCode != null,
  })
}
