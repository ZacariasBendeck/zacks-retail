import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  productMatchingSetsApi,
  type MatchingSetInput,
  type MatchingSetListFilters,
  type MatchingSetMemberInput,
  type MatchingSetPatch,
  type MatchingSetRoleInput,
  type MatchingSetTypeInput,
} from '../services/productMatchingSetsApi'

const STALE_MS = 2 * 60 * 1000

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['product-matching-sets'] })
}

export function useMatchingSetTypes() {
  return useQuery({
    queryKey: ['product-matching-sets', 'types'],
    queryFn: () => productMatchingSetsApi.listTypes(),
    staleTime: STALE_MS,
  })
}

export function useMatchingSets(filter?: MatchingSetListFilters) {
  return useQuery({
    queryKey: ['product-matching-sets', 'list', filter ?? {}],
    queryFn: () => productMatchingSetsApi.list(filter),
    staleTime: STALE_MS,
  })
}

export function useMatchingSet(id: string | null | undefined) {
  return useQuery({
    queryKey: ['product-matching-sets', 'detail', id],
    queryFn: () => productMatchingSetsApi.get(id!),
    enabled: !!id,
    staleTime: STALE_MS,
  })
}

export function useMatchingSetsBySku(skuRef: string | null | undefined) {
  return useQuery({
    queryKey: ['product-matching-sets', 'by-sku', skuRef],
    queryFn: () => productMatchingSetsApi.bySku(skuRef!),
    enabled: !!skuRef,
    staleTime: STALE_MS,
  })
}

export function useCreateMatchingSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: MatchingSetInput) => productMatchingSetsApi.create(input),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateMatchingSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MatchingSetPatch }) =>
      productMatchingSetsApi.update(id, patch),
    onSuccess: () => invalidate(qc),
  })
}

export function useArchiveMatchingSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => productMatchingSetsApi.archive(id),
    onSuccess: () => invalidate(qc),
  })
}

export function useRestoreMatchingSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => productMatchingSetsApi.restore(id),
    onSuccess: () => invalidate(qc),
  })
}

export function useAddMatchingSetMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MatchingSetMemberInput }) =>
      productMatchingSetsApi.addMember(id, input),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateMatchingSetMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      skuId,
      patch,
    }: {
      id: string
      skuId: string
      patch: Partial<Pick<MatchingSetMemberInput, 'roleCode' | 'isPrimary' | 'quantityRatio'>>
    }) => productMatchingSetsApi.updateMember(id, skuId, patch),
    onSuccess: () => invalidate(qc),
  })
}

export function useRemoveMatchingSetMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, skuId }: { id: string; skuId: string }) =>
      productMatchingSetsApi.removeMember(id, skuId),
    onSuccess: () => invalidate(qc),
  })
}

export function useCreateMatchingSetType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: MatchingSetTypeInput) => productMatchingSetsApi.createType(input),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateMatchingSetType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, patch }: { code: string; patch: MatchingSetTypeInput }) =>
      productMatchingSetsApi.updateType(code, patch),
    onSuccess: () => invalidate(qc),
  })
}

export function useCreateMatchingSetRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ typeCode, input }: { typeCode: string; input: MatchingSetRoleInput }) =>
      productMatchingSetsApi.createRole(typeCode, input),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateMatchingSetRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      typeCode,
      roleCode,
      patch,
    }: {
      typeCode: string
      roleCode: string
      patch: MatchingSetRoleInput
    }) => productMatchingSetsApi.updateRole(typeCode, roleCode, patch),
    onSuccess: () => invalidate(qc),
  })
}
