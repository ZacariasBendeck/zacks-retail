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
  fetchPurchaseOrderReceipts,
  fetchTransferOrders,
  fetchPurchaseOrderOverdueExceptions,
} from '../services/purchaseOrderApi'
import type {
  PoListParams,
  CreatePurchaseOrderPayload,
  UpdatePurchaseOrderPayload,
  SubmitPurchaseOrderPayload,
  ReceivePurchaseOrderPayload,
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
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
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
