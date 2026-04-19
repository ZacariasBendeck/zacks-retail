/**
 * TanStack Query hooks for the products-module taxonomy entities.
 * Each entity gets a list / get / create / update / delete trio.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  categoriesApi,
  departmentsApi,
  groupsApi,
  keywordsApi,
  nrfCodesApi,
  promotionCodesApi,
  returnCodesApi,
  seasonsApi,
  sectorsApi,
  sizeTypesApi,
} from '../services/productsTaxonomyApi'
import type {
  CategoryInput,
  DepartmentInput,
  GroupInput,
  KeywordInput,
  PromotionCodeInput,
  ReturnCodeInput,
  SectorInput,
  SizeTypeInput,
} from '../types/productsTaxonomy'

// Departments
export function useDepartments() {
  return useQuery({ queryKey: ['taxonomy', 'departments'], queryFn: departmentsApi.list })
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
  return useQuery({ queryKey: ['taxonomy', 'categories'], queryFn: categoriesApi.list })
}
export function useCategory(n: number | undefined) {
  return useQuery({
    queryKey: ['taxonomy', 'categories', n],
    queryFn: () => categoriesApi.get(n!),
    enabled: n != null,
  })
}
export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CategoryInput) => categoriesApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'categories'] }),
  })
}
export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ number, patch }: { number: number; patch: Partial<CategoryInput> }) =>
      categoriesApi.update(number, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'categories'] }),
  })
}
export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (n: number) => categoriesApi.remove(n),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy', 'categories'] }),
  })
}

// Groups
export function useGroups() {
  return useQuery({ queryKey: ['taxonomy', 'groups'], queryFn: groupsApi.list })
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
  return useQuery({ queryKey: ['taxonomy', 'keywords'], queryFn: keywordsApi.list })
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
  return useQuery({ queryKey: ['taxonomy', 'sectors'], queryFn: sectorsApi.list })
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
  return useQuery({ queryKey: ['taxonomy', 'seasons'], queryFn: seasonsApi.list })
}
export function useSeason(code: string | undefined) {
  return useQuery({
    queryKey: ['taxonomy', 'seasons', code],
    queryFn: () => seasonsApi.get(code!),
    enabled: !!code,
  })
}

// Return codes
export function useReturnCodes() {
  return useQuery({ queryKey: ['taxonomy', 'return-codes'], queryFn: returnCodesApi.list })
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
  return useQuery({ queryKey: ['taxonomy', 'promotion-codes'], queryFn: promotionCodesApi.list })
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
  return useQuery({ queryKey: ['taxonomy', 'size-types'], queryFn: sizeTypesApi.list })
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
