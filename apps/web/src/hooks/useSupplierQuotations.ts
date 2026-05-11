import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  supplierQuotationsApi,
  type SupplierQuotationInput,
  type SupplierQuotationLineInput,
  type SupplierQuotationListFilters,
  type SupplierQuotationDecisionStatus,
  type SupplierQuotationRelationType,
  type SupplierQuotationTargetType,
} from '../services/supplierQuotationsApi'

const STALE_MS = 60_000

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['supplier-quotations'] })
}

export function useSupplierQuotations(filters?: SupplierQuotationListFilters) {
  return useQuery({
    queryKey: ['supplier-quotations', 'list', filters ?? {}],
    queryFn: () => supplierQuotationsApi.list(filters),
    staleTime: STALE_MS,
  })
}

export function useSupplierQuotation(id: string | null | undefined) {
  return useQuery({
    queryKey: ['supplier-quotations', 'detail', id],
    queryFn: () => supplierQuotationsApi.get(id!),
    enabled: !!id,
    staleTime: STALE_MS,
  })
}

export function useSupplierQuotationSimilarity(lineId: string | null | undefined) {
  return useQuery({
    queryKey: ['supplier-quotations', 'similarity', lineId],
    queryFn: () => supplierQuotationsApi.similarity(lineId!),
    enabled: !!lineId,
    staleTime: 30_000,
  })
}

export function useCreateSupplierQuotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SupplierQuotationInput) => supplierQuotationsApi.create(input),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateSupplierQuotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SupplierQuotationInput }) =>
      supplierQuotationsApi.update(id, input),
    onSuccess: () => invalidate(qc),
  })
}

export function useArchiveSupplierQuotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => supplierQuotationsApi.archive(id),
    onSuccess: () => invalidate(qc),
  })
}

export function useAddSupplierQuotationLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ quotationId, input }: { quotationId: string; input: SupplierQuotationLineInput }) =>
      supplierQuotationsApi.addLine(quotationId, input),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateSupplierQuotationLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId, input }: { lineId: string; input: SupplierQuotationLineInput }) =>
      supplierQuotationsApi.updateLine(lineId, input),
    onSuccess: () => invalidate(qc),
  })
}

export function useDeleteSupplierQuotationLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (lineId: string) => supplierQuotationsApi.deleteLine(lineId),
    onSuccess: () => invalidate(qc),
  })
}

export function useDecideSupplierQuotationLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId, decisionStatus, reason }: { lineId: string; decisionStatus: SupplierQuotationDecisionStatus; reason?: string | null }) =>
      supplierQuotationsApi.decideLine(lineId, { decisionStatus, reason }),
    onSuccess: () => invalidate(qc),
  })
}

export function useAddSupplierQuotationRelation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      lineId,
      input,
    }: {
      lineId: string
      input: { relationType: SupplierQuotationRelationType; targetType: SupplierQuotationTargetType; targetId: string; note?: string | null }
    }) => supplierQuotationsApi.addRelation(lineId, input),
    onSuccess: () => invalidate(qc),
  })
}

export function useRemoveSupplierQuotationRelation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (relationId: string) => supplierQuotationsApi.removeRelation(relationId),
    onSuccess: () => invalidate(qc),
  })
}

export function useConvertSupplierQuotationToPo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (quotationId: string) => supplierQuotationsApi.convertToPo(quotationId),
    onSuccess: () => invalidate(qc),
  })
}
