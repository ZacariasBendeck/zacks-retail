/**
 * TanStack Query hooks for the products-module Vendor admin UI.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { vendorsApi } from '../services/productsVendorApi'
import type { VendorInput } from '../types/productsVendor'

// Vendor + SKU-count data changes rarely; the PowerShell + Access read is
// expensive. 10 min stale-time keeps cache warm across page navigations;
// mutations invalidate immediately.
const LIST_STALE_MS = 10 * 60 * 1000

export function useVendors(q?: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['vendors', 'list', q ?? ''],
    queryFn: () => vendorsApi.list(q),
    enabled: options.enabled ?? true,
    staleTime: LIST_STALE_MS,
  })
}

export function useVendor(code: string | undefined) {
  return useQuery({
    queryKey: ['vendors', 'detail', code],
    queryFn: () => vendorsApi.get(code!),
    enabled: !!code,
    staleTime: LIST_STALE_MS,
  })
}

export function useVendorSkuCounts() {
  return useQuery({
    queryKey: ['vendors', 'sku-counts'],
    queryFn: () => vendorsApi.skuCountsAll(),
    staleTime: LIST_STALE_MS,
  })
}

export function useCreateVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: VendorInput) => vendorsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  })
}

export function useUpdateVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, patch }: { code: string; patch: Partial<Omit<VendorInput, 'code'>> }) =>
      vendorsApi.update(code, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  })
}

export function useDeleteVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => vendorsApi.remove(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  })
}

export function useVendorStoreAccounts(code: string | undefined) {
  return useQuery({
    queryKey: ['vendors', 'store-accounts', code],
    queryFn: () => vendorsApi.listStoreAccounts(code!),
    enabled: !!code,
  })
}

export function useUpsertVendorStoreAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      code,
      storeId,
      accountNo,
    }: {
      code: string
      storeId: number
      accountNo: string
    }) => vendorsApi.upsertStoreAccount(code, storeId, accountNo),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['vendors', 'store-accounts', vars.code] }),
  })
}

export function useDeleteVendorStoreAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, storeId }: { code: string; storeId: number }) =>
      vendorsApi.deleteStoreAccount(code, storeId),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['vendors', 'store-accounts', vars.code] }),
  })
}
