import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchPurchaseOrders,
  fetchPurchaseOrder,
  fetchPurchaseOrderHistory,
  createPurchaseOrder,
  updatePurchaseOrder,
  submitPurchaseOrder,
  confirmPurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  receivePurchaseOrder,
  receivePurchaseOrderFull,
  duplicatePurchaseOrder,
  replicatePurchaseOrder,
  combinePurchaseOrders,
  fetchPurchaseOrderReceipts,
  fetchTransferOrders,
  fetchPurchaseOrderOverdueExceptions,
  fetchPurchaseOrderSkuOptions,
  fetchPurchaseOrderVendorOptions,
  fetchPurchaseOrderBuyerOptions,
} from '../services/purchaseOrderApi'
import type {
  PoListParams,
  CreatePurchaseOrderPayload,
  UpdatePurchaseOrderPayload,
  SubmitPurchaseOrderPayload,
  ReceivePurchaseOrderPayload,
  ReceivePurchaseOrderFullPayload,
  DuplicatePurchaseOrderPayload,
  ReplicatePurchaseOrderPayload,
  CombinePurchaseOrdersPayload,
  TransferOrderListParams,
} from '../types/purchaseOrder'

export function usePurchaseOrders(params: PoListParams) {
  return useQuery({
    queryKey: ['purchase-orders', params],
    queryFn: () => fetchPurchaseOrders(params),
    placeholderData: (prev) => prev,
  })
}

export function usePurchaseOrder(poId: string | undefined) {
  return useQuery({
    queryKey: ['purchase-order', poId],
    queryFn: () => fetchPurchaseOrder(poId!),
    enabled: !!poId,
  })
}

export function usePurchaseOrderHistory(poId: string | undefined) {
  return useQuery({
    queryKey: ['purchase-order-history', poId],
    queryFn: () => fetchPurchaseOrderHistory(poId!),
    enabled: !!poId,
  })
}

export function usePurchaseOrderVendorOptions(q: string) {
  return useQuery({
    queryKey: ['purchase-order-vendor-options', q],
    queryFn: () => fetchPurchaseOrderVendorOptions({ q, pageSize: 50 }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
}

export function usePurchaseOrderBuyerOptions() {
  return useQuery({
    queryKey: ['purchase-order-buyer-options'],
    queryFn: fetchPurchaseOrderBuyerOptions,
    staleTime: 60_000,
  })
}

export function usePurchaseOrderSkuOptions(params: { q: string; vendorId?: string }) {
  return useQuery({
    queryKey: ['purchase-order-sku-options', params],
    queryFn: () => fetchPurchaseOrderSkuOptions({ ...params, pageSize: 50 }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreatePurchaseOrderPayload) => createPurchaseOrder(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.setQueryData(['purchase-order', data.id], data)
    },
  })
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ poId, payload }: { poId: string; payload: UpdatePurchaseOrderPayload }) =>
      updatePurchaseOrder(poId, payload),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order-history', variables.poId] })
      queryClient.setQueryData(['purchase-order', data.id], data)
    },
  })
}

function usePoTransitionMutation(
  mutationFn: (variables: { poId: string; payload?: SubmitPurchaseOrderPayload; reason?: string }) => Promise<unknown>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order-history', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order-receipts', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
    },
  })
}

export function useSubmitPurchaseOrder() {
  return usePoTransitionMutation(({ poId, payload }) => submitPurchaseOrder(poId, payload))
}

export function useConfirmPurchaseOrder() {
  return usePoTransitionMutation(({ poId }) => confirmPurchaseOrder(poId))
}

export function useCancelPurchaseOrder() {
  return usePoTransitionMutation(({ poId, reason }) => cancelPurchaseOrder(poId, reason))
}

export function useClosePurchaseOrder() {
  return usePoTransitionMutation(({ poId }) => closePurchaseOrder(poId))
}

export function useReceivePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ poId, payload }: { poId: string; payload: ReceivePurchaseOrderPayload }) =>
      receivePurchaseOrder(poId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order-history', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order-receipts', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
    },
  })
}

export function useReceivePurchaseOrderFull() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ poId, payload }: { poId: string; payload: ReceivePurchaseOrderFullPayload }) =>
      receivePurchaseOrderFull(poId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order-history', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order-receipts', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
    },
  })
}

export function useDuplicatePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ poId, payload }: { poId: string; payload?: DuplicatePurchaseOrderPayload }) =>
      duplicatePurchaseOrder(poId, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.setQueryData(['purchase-order', data.id], data)
    },
  })
}

export function useReplicatePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ poId, payload }: { poId: string; payload: ReplicatePurchaseOrderPayload }) =>
      replicatePurchaseOrder(poId, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      for (const po of data.created) {
        queryClient.setQueryData(['purchase-order', po.id], po)
      }
    },
  })
}

export function useCombinePurchaseOrders() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CombinePurchaseOrdersPayload) => combinePurchaseOrders(payload),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      const sourcePoIds = variables.sourcePoIds ?? (variables.sourcePoId ? [variables.sourcePoId] : [])
      for (const sourcePoId of sourcePoIds) {
        queryClient.invalidateQueries({ queryKey: ['purchase-order', sourcePoId] })
        queryClient.invalidateQueries({ queryKey: ['purchase-order-history', sourcePoId] })
      }
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.intoPoId] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order-history', variables.intoPoId] })
      queryClient.setQueryData(['purchase-order', data.id], data)
    },
  })
}

export function usePurchaseOrderReceipts(poId: string | undefined) {
  return useQuery({
    queryKey: ['purchase-order-receipts', poId],
    queryFn: () => fetchPurchaseOrderReceipts(poId!),
    enabled: !!poId,
  })
}

export function useTransferOrders(params: TransferOrderListParams) {
  return useQuery({
    queryKey: ['transfer-orders', params],
    queryFn: () => fetchTransferOrders(params),
    placeholderData: (prev) => prev,
  })
}

export function usePurchaseOrderOverdueExceptions() {
  return useQuery({
    queryKey: ['purchase-order-overdue-exceptions'],
    queryFn: fetchPurchaseOrderOverdueExceptions,
    staleTime: 60_000,
  })
}
