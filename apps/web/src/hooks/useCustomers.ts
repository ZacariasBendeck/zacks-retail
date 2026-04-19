import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchCustomers,
  fetchCustomer,
  fetchCustomerBalances,
  searchCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  fetchFamilyMembers,
  createFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
} from '../services/customerApi'
import type {
  CustomerListParams,
  CustomerCreatePayload,
  CustomerUpdatePayload,
  FamilyMemberCreatePayload,
  FamilyMemberUpdatePayload,
} from '../types/customer'

export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => fetchCustomers(params),
    placeholderData: (prev) => prev,
  })
}

export function useCustomer(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => fetchCustomer(customerId!),
    enabled: !!customerId,
  })
}

export function useCustomerBalances(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customer-balances', customerId],
    queryFn: () => fetchCustomerBalances(customerId!),
    enabled: !!customerId,
  })
}

export function useCustomerSearch(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['customer-search', q],
    queryFn: () => searchCustomers(q),
    enabled: enabled && q.length > 0,
    staleTime: 30 * 1000,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CustomerCreatePayload) => createCustomer(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CustomerUpdatePayload }) =>
      updateCustomer(id, payload),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer', v.id] })
    },
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useFamilyMembers(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customer-family', customerId],
    queryFn: () => fetchFamilyMembers(customerId!),
    enabled: !!customerId,
  })
}

export function useCreateFamilyMember(customerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: FamilyMemberCreatePayload) => createFamilyMember(customerId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-family', customerId] })
      qc.invalidateQueries({ queryKey: ['customer', customerId] })
    },
  })
}

export function useUpdateFamilyMember(customerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ familyId, payload }: { familyId: string; payload: FamilyMemberUpdatePayload }) =>
      updateFamilyMember(customerId, familyId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-family', customerId] })
      qc.invalidateQueries({ queryKey: ['customer', customerId] })
    },
  })
}

export function useDeleteFamilyMember(customerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (familyId: string) => deleteFamilyMember(customerId, familyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-family', customerId] })
      qc.invalidateQueries({ queryKey: ['customer', customerId] })
    },
  })
}
