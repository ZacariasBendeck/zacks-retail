import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addGoodsInTransitRecord,
  addImportCharge,
  addImportContainer,
  addImportInvoiceLine,
  addImportShipmentLine,
  addImportSupplierInvoice,
  applyImportInvoiceMatchSuggestions,
  approveImportShipmentLineInvoiceMatch,
  allocateImportLandedCost,
  createGoodsInTransitForShipment,
  createImportPurchaseOrderDraft,
  createImportShipment,
  fetchImportLiquidationReadiness,
  fetchImportInvoiceMatchSuggestions,
  fetchImportOtbCommitments,
  fetchImportPayables,
  fetchImportPurchaseOrderLinking,
  fetchImportReceivingHandoff,
  fetchImportShipment,
  fetchImportShipmentAuditEvents,
  fetchImportShipmentLineCandidates,
  fetchImportShipments,
  importWorkbook,
  linkImportInvoiceLineToSku,
  linkImportInvoiceLineToPurchaseOrderLine,
  markImportPayablePaid,
  markImportPayablesSent,
  matchImportShipmentLineInvoice,
  previewImportWorkbook,
  recordImportVerificationCheck,
  receiveImportShipmentEstimated,
  receiveImportShipmentFinal,
  removeImportShipmentLine,
  stageImportPayables,
  updateGoodsInTransitRecord,
  updateImportCharge,
  updateImportContainer,
  updateImportInvoiceLine,
  updateImportShipmentLine,
  updateImportShipmentStatus,
  updateImportSuggestedPriceStatus,
  updateImportSupplierInvoice,
  voidImportPayable,
} from '../services/importManagementApi'
import type {
  AllocateImportLandedCostPayload,
  AddImportShipmentLinePayload,
  ApplyImportInvoiceMatchSuggestionsPayload,
  CreateGoodsInTransitForShipmentPayload,
  CreateGoodsInTransitRecordPayload,
  CreateImportChargePayload,
  CreateImportContainerPayload,
  CreateImportInvoiceLinePayload,
  CreateImportPurchaseOrderDraftPayload,
  CreateImportShipmentPayload,
  CreateImportSupplierInvoicePayload,
  ImportOtbCommitmentsParams,
  ImportShipmentDetail,
  ImportWorkbookOptionsPayload,
  ImportShipmentListParams,
  MatchImportShipmentLineInvoicePayload,
  ApproveImportShipmentLineInvoiceMatchPayload,
  LinkImportInvoiceLineToPoPayload,
  LinkImportInvoiceLineToSkuPayload,
  MarkImportPayablePaidPayload,
  MarkImportPayablesSentPayload,
  RecordImportVerificationCheckPayload,
  ReceiveImportShipmentPayload,
  UpdateGoodsInTransitRecordPayload,
  UpdateImportChargePayload,
  UpdateImportContainerPayload,
  UpdateImportInvoiceLinePayload,
  UpdateImportShipmentLinePayload,
  UpdateImportShipmentStatusPayload,
  UpdateImportSuggestedPriceStatusPayload,
  UpdateImportSupplierInvoicePayload,
  VoidImportPayablePayload,
} from '../types/importManagement'

export function useImportShipments(params: ImportShipmentListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['import-shipments', params],
    queryFn: ({ signal }) => fetchImportShipments(params, signal),
    enabled: options.enabled ?? true,
    placeholderData: (prev) => prev,
  })
}

export function useImportOtbCommitments(
  params: ImportOtbCommitmentsParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['import-otb-commitments', params],
    queryFn: ({ signal }) => fetchImportOtbCommitments(params, signal),
    enabled: options.enabled ?? true,
    placeholderData: (prev) => prev,
  })
}

export function useImportShipment(shipmentId: string | null) {
  return useQuery({
    queryKey: ['import-shipment', shipmentId],
    queryFn: ({ signal }) => fetchImportShipment(shipmentId!, signal),
    enabled: !!shipmentId,
  })
}

export function useImportLiquidationReadiness(shipmentId: string | null) {
  return useQuery({
    queryKey: ['import-liquidation-readiness', shipmentId],
    queryFn: ({ signal }) => fetchImportLiquidationReadiness(shipmentId!, signal),
    enabled: !!shipmentId,
  })
}

export function useImportPayables(shipmentId: string | null) {
  return useQuery({
    queryKey: ['import-payables', shipmentId],
    queryFn: ({ signal }) => fetchImportPayables(shipmentId!, signal),
    enabled: !!shipmentId,
  })
}

export function useImportShipmentAuditEvents(shipmentId: string | null) {
  return useQuery({
    queryKey: ['import-shipment-audit-events', shipmentId],
    queryFn: ({ signal }) => fetchImportShipmentAuditEvents(shipmentId!, signal),
    enabled: !!shipmentId,
  })
}

export function useImportReceivingHandoff(shipmentId: string | null) {
  return useQuery({
    queryKey: ['import-receiving-handoff', shipmentId],
    queryFn: ({ signal }) => fetchImportReceivingHandoff(shipmentId!, signal),
    enabled: !!shipmentId,
  })
}

export function useImportPurchaseOrderLinking(shipmentId: string | null) {
  return useQuery({
    queryKey: ['import-po-linking', shipmentId],
    queryFn: ({ signal }) => fetchImportPurchaseOrderLinking(shipmentId!, signal),
    enabled: !!shipmentId,
  })
}

export function useImportShipmentLineCandidates(
  shipmentId: string | null,
  params: {
    q?: string;
    vendorCode?: string;
    buyer?: string;
    sourceCurrency?: string;
    incotermCode?: string;
    poStatus?: string;
  } = {},
) {
  return useQuery({
    queryKey: ['import-shipment-line-candidates', shipmentId, params],
    queryFn: ({ signal }) => fetchImportShipmentLineCandidates(shipmentId!, params, signal),
    enabled: !!shipmentId,
    placeholderData: (prev) => prev,
  })
}

export function useImportInvoiceMatchSuggestions(shipmentId: string | null) {
  return useQuery({
    queryKey: ['import-invoice-match-suggestions', shipmentId],
    queryFn: ({ signal }) => fetchImportInvoiceMatchSuggestions(shipmentId!, signal),
    enabled: !!shipmentId,
  })
}

export function useCreateImportShipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateImportShipmentPayload) => createImportShipment(payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.setQueryData(['import-shipment', data.id], data)
      qc.invalidateQueries({ queryKey: ['import-shipment-audit-events', data.id] })
    },
  })
}

function isImportShipmentDetail(value: unknown): value is ImportShipmentDetail {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { id?: unknown }).id === 'string' &&
    Array.isArray((value as { shipmentLines?: unknown }).shipmentLines),
  )
}

function useShipmentMutation<TPayload>(
  mutationFn: (variables: { shipmentId: string; payload: TPayload }) => Promise<unknown>,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-shipment-audit-events', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-shipment-line-candidates', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-invoice-match-suggestions', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-liquidation-readiness', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-payables', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', variables.shipmentId] })
      if (isImportShipmentDetail(data)) {
        qc.setQueryData(['import-shipment', data.id], data)
      }
    },
  })
}

export function useUpdateImportShipmentStatus() {
  return useShipmentMutation<UpdateImportShipmentStatusPayload>(({ shipmentId, payload }) =>
    updateImportShipmentStatus(shipmentId, payload),
  )
}

export function useAddImportSupplierInvoice() {
  return useShipmentMutation<CreateImportSupplierInvoicePayload>(({ shipmentId, payload }) =>
    addImportSupplierInvoice(shipmentId, payload),
  )
}

export function useAddImportShipmentLine() {
  return useShipmentMutation<AddImportShipmentLinePayload>(({ shipmentId, payload }) =>
    addImportShipmentLine(shipmentId, payload),
  )
}

export function useUpdateImportShipmentLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ shipmentLineId, payload }: { shipmentLineId: string; payload: UpdateImportShipmentLinePayload }) =>
      updateImportShipmentLine(shipmentLineId, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', data.id] })
      qc.invalidateQueries({ queryKey: ['import-shipment-audit-events', data.id] })
      qc.invalidateQueries({ queryKey: ['import-shipment-line-candidates', data.id] })
      qc.invalidateQueries({ queryKey: ['import-invoice-match-suggestions', data.id] })
      qc.invalidateQueries({ queryKey: ['import-liquidation-readiness', data.id] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', data.id] })
      qc.setQueryData(['import-shipment', data.id], data)
    },
  })
}

export function useRemoveImportShipmentLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ shipmentLineId }: { shipmentLineId: string }) => removeImportShipmentLine(shipmentLineId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', data.id] })
      qc.invalidateQueries({ queryKey: ['import-shipment-audit-events', data.id] })
      qc.invalidateQueries({ queryKey: ['import-shipment-line-candidates', data.id] })
      qc.invalidateQueries({ queryKey: ['import-invoice-match-suggestions', data.id] })
      qc.invalidateQueries({ queryKey: ['import-liquidation-readiness', data.id] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', data.id] })
      qc.setQueryData(['import-shipment', data.id], data)
    },
  })
}

export function useMatchImportShipmentLineInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (
      { shipmentLineId, payload }: { shipmentLineId: string; payload: MatchImportShipmentLineInvoicePayload },
    ) => matchImportShipmentLineInvoice(shipmentLineId, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', data.id] })
      qc.invalidateQueries({ queryKey: ['import-shipment-audit-events', data.id] })
      qc.invalidateQueries({ queryKey: ['import-invoice-match-suggestions', data.id] })
      qc.invalidateQueries({ queryKey: ['import-liquidation-readiness', data.id] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', data.id] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', data.id] })
      qc.setQueryData(['import-shipment', data.id], data)
    },
  })
}

export function useApproveImportShipmentLineInvoiceMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (
      { shipmentLineId, payload }: { shipmentLineId: string; payload: ApproveImportShipmentLineInvoiceMatchPayload },
    ) => approveImportShipmentLineInvoiceMatch(shipmentLineId, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', data.id] })
      qc.invalidateQueries({ queryKey: ['import-shipment-audit-events', data.id] })
      qc.invalidateQueries({ queryKey: ['import-invoice-match-suggestions', data.id] })
      qc.invalidateQueries({ queryKey: ['import-liquidation-readiness', data.id] })
      qc.setQueryData(['import-shipment', data.id], data)
    },
  })
}

export function useApplyImportInvoiceMatchSuggestions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (
      { shipmentId, payload }: { shipmentId: string; payload: ApplyImportInvoiceMatchSuggestionsPayload },
    ) => applyImportInvoiceMatchSuggestions(shipmentId, payload),
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-invoice-match-suggestions', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-liquidation-readiness', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', variables.shipmentId] })
      qc.setQueryData(['import-shipment', data.shipment.id], data.shipment)
    },
  })
}

export function useUpdateImportSupplierInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, payload }: { invoiceId: string; payload: UpdateImportSupplierInvoicePayload }) =>
      updateImportSupplierInvoice(invoiceId, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', data.id] })
      qc.invalidateQueries({ queryKey: ['import-shipment-audit-events', data.id] })
      qc.invalidateQueries({ queryKey: ['import-invoice-match-suggestions', data.id] })
      qc.invalidateQueries({ queryKey: ['import-liquidation-readiness', data.id] })
      qc.invalidateQueries({ queryKey: ['import-payables', data.id] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', data.id] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', data.id] })
      qc.setQueryData(['import-shipment', data.id], data)
    },
  })
}

export function useAddImportCharge() {
  return useShipmentMutation<CreateImportChargePayload>(({ shipmentId, payload }) =>
    addImportCharge(shipmentId, payload),
  )
}

export function useUpdateImportCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ chargeId, payload }: { chargeId: string; payload: UpdateImportChargePayload }) =>
      updateImportCharge(chargeId, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', data.id] })
      qc.invalidateQueries({ queryKey: ['import-shipment-audit-events', data.id] })
      qc.invalidateQueries({ queryKey: ['import-liquidation-readiness', data.id] })
      qc.invalidateQueries({ queryKey: ['import-payables', data.id] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', data.id] })
      qc.setQueryData(['import-shipment', data.id], data)
    },
  })
}

export function useAddImportContainer() {
  return useShipmentMutation<CreateImportContainerPayload>(({ shipmentId, payload }) =>
    addImportContainer(shipmentId, payload),
  )
}

export function useCreateGoodsInTransitForShipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ shipmentId, payload }: { shipmentId: string; payload: CreateGoodsInTransitForShipmentPayload }) =>
      createGoodsInTransitForShipment(shipmentId, payload),
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', variables.shipmentId] })
      qc.setQueryData(['import-shipment', data.shipment.id], data.shipment)
    },
  })
}

export function useAddGoodsInTransitRecord() {
  return useShipmentMutation<CreateGoodsInTransitRecordPayload>(({ shipmentId, payload }) =>
    addGoodsInTransitRecord(shipmentId, payload),
  )
}

export function useUpdateImportContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ containerId, payload }: { containerId: string; payload: UpdateImportContainerPayload }) =>
      updateImportContainer(containerId, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', data.id] })
      qc.invalidateQueries({ queryKey: ['import-liquidation-readiness', data.id] })
      qc.setQueryData(['import-shipment', data.id], data)
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', data.id] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', data.id] })
    },
  })
}

export function useUpdateGoodsInTransitRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ recordId, payload }: { recordId: string; payload: UpdateGoodsInTransitRecordPayload }) =>
      updateGoodsInTransitRecord(recordId, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', data.id] })
      qc.invalidateQueries({ queryKey: ['import-liquidation-readiness', data.id] })
      qc.invalidateQueries({ queryKey: ['import-payables', data.id] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', data.id] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', data.id] })
      qc.setQueryData(['import-shipment', data.id], data)
    },
  })
}

export function useUpdateImportSuggestedPriceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (
      { suggestedPriceId, payload }: { suggestedPriceId: string; payload: UpdateImportSuggestedPriceStatusPayload },
    ) => updateImportSuggestedPriceStatus(suggestedPriceId, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', data.id] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', data.id] })
      qc.setQueryData(['import-shipment', data.id], data)
    },
  })
}

export function useStageImportPayables() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ shipmentId }: { shipmentId: string }) => stageImportPayables(shipmentId),
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-payables', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', variables.shipmentId] })
      qc.setQueryData(['import-payables', variables.shipmentId], data)
    },
  })
}

export function useMarkImportPayablesSent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ shipmentId, payload }: { shipmentId: string; payload?: MarkImportPayablesSentPayload }) =>
      markImportPayablesSent(shipmentId, payload),
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-payables', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', variables.shipmentId] })
      qc.setQueryData(['import-payables', variables.shipmentId], data)
    },
  })
}

export function useMarkImportPayablePaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (
      { handoffId, payload }: { shipmentId: string; handoffId: string; payload?: MarkImportPayablePaidPayload },
    ) => markImportPayablePaid(handoffId, payload),
    onSuccess: (data, variables) => {
      const shipmentId = data.shipmentId || variables.shipmentId
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-payables', shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', shipmentId] })
      qc.setQueryData(['import-payables', shipmentId], data)
    },
  })
}

export function useVoidImportPayable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (
      { handoffId, payload }: { shipmentId: string; handoffId: string; payload: VoidImportPayablePayload },
    ) => voidImportPayable(handoffId, payload),
    onSuccess: (data, variables) => {
      const shipmentId = data.shipmentId || variables.shipmentId
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-payables', shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', shipmentId] })
      qc.setQueryData(['import-payables', shipmentId], data)
    },
  })
}

export function useRecordImportVerificationCheck() {
  return useShipmentMutation<RecordImportVerificationCheckPayload>(({ shipmentId, payload }) =>
    recordImportVerificationCheck(shipmentId, payload),
  )
}

export function useReceiveImportShipmentEstimated() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ shipmentId, payload }: { shipmentId: string; payload: ReceiveImportShipmentPayload }) =>
      receiveImportShipmentEstimated(shipmentId, payload),
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-shipment-audit-events', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-liquidation-readiness', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', variables.shipmentId] })
      qc.setQueryData(['import-receiving-handoff', variables.shipmentId], data)
    },
  })
}

export function useReceiveImportShipmentFinal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ shipmentId, payload }: { shipmentId: string; payload?: ReceiveImportShipmentPayload }) =>
      receiveImportShipmentFinal(shipmentId, payload),
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-shipment-audit-events', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-liquidation-readiness', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', variables.shipmentId] })
      qc.setQueryData(['import-receiving-handoff', variables.shipmentId], data)
    },
  })
}

export function useCreateImportPurchaseOrderDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ shipmentId, payload }: { shipmentId: string; payload: CreateImportPurchaseOrderDraftPayload }) =>
      createImportPurchaseOrderDraft(shipmentId, payload),
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', variables.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', variables.shipmentId] })
      qc.setQueryData(['import-po-linking', variables.shipmentId], data)
    },
  })
}

export function useLinkImportInvoiceLineToPurchaseOrderLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (
      { invoiceLineId, payload }: { invoiceLineId: string; payload: LinkImportInvoiceLineToPoPayload },
    ) => linkImportInvoiceLineToPurchaseOrderLine(invoiceLineId, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', data.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-invoice-match-suggestions', data.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', data.shipmentId] })
      qc.setQueryData(['import-po-linking', data.shipmentId], data)
    },
  })
}

export function useLinkImportInvoiceLineToSku() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (
      { invoiceLineId, payload }: { invoiceLineId: string; payload: LinkImportInvoiceLineToSkuPayload },
    ) => linkImportInvoiceLineToSku(invoiceLineId, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', data.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-invoice-match-suggestions', data.shipmentId] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', data.shipmentId] })
      qc.setQueryData(['import-po-linking', data.shipmentId], data)
    },
  })
}

export function useAllocateImportLandedCost() {
  return useShipmentMutation<AllocateImportLandedCostPayload>(({ shipmentId, payload }) =>
    allocateImportLandedCost(shipmentId, payload),
  )
}

export function useAddImportInvoiceLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, payload }: { invoiceId: string; payload: CreateImportInvoiceLinePayload }) =>
      addImportInvoiceLine(invoiceId, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', data.id] })
      qc.invalidateQueries({ queryKey: ['import-invoice-match-suggestions', data.id] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', data.id] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', data.id] })
      qc.setQueryData(['import-shipment', data.id], data)
    },
  })
}

export function useUpdateImportInvoiceLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceLineId, payload }: { invoiceLineId: string; payload: UpdateImportInvoiceLinePayload }) =>
      updateImportInvoiceLine(invoiceLineId, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.invalidateQueries({ queryKey: ['import-shipment', data.id] })
      qc.invalidateQueries({ queryKey: ['import-liquidation-readiness', data.id] })
      qc.invalidateQueries({ queryKey: ['import-invoice-match-suggestions', data.id] })
      qc.invalidateQueries({ queryKey: ['import-payables', data.id] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', data.id] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', data.id] })
      qc.setQueryData(['import-shipment', data.id], data)
    },
  })
}

export function usePreviewImportWorkbook() {
  return useMutation({
    mutationFn: ({ file, payload }: { file: File; payload?: ImportWorkbookOptionsPayload }) =>
      previewImportWorkbook(file, payload),
  })
}

export function useImportWorkbook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, payload }: { file: File; payload?: ImportWorkbookOptionsPayload }) =>
      importWorkbook(file, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['import-shipments'] })
      qc.invalidateQueries({ queryKey: ['import-otb-commitments'] })
      qc.setQueryData(['import-shipment', data.shipment.id], data.shipment)
      qc.invalidateQueries({ queryKey: ['import-shipment-audit-events', data.shipment.id] })
      qc.invalidateQueries({ queryKey: ['import-invoice-match-suggestions', data.shipment.id] })
      qc.invalidateQueries({ queryKey: ['import-payables', data.shipment.id] })
      qc.invalidateQueries({ queryKey: ['import-receiving-handoff', data.shipment.id] })
      qc.invalidateQueries({ queryKey: ['import-po-linking', data.shipment.id] })
    },
  })
}
