import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  copyOtbPlanRow,
  createOtbPlanRow,
  deleteOtbPlanRow,
  fetchOtbPlanRow,
  fetchOtbPlanRowAudit,
  fetchOtbPlanRows,
  recalculateOtbPlanRow,
  updateOtbPlanRow,
} from '../services/otbPlanRowApi'
import type {
  CreateOtbPlanRowPayload,
  OtbPlanRowListParams,
  UpdateOtbPlanRowPayload,
} from '../types/otbPlanRow'

export function useOtbPlanRows(params: OtbPlanRowListParams) {
  return useQuery({
    queryKey: ['otb-plan-rows', params],
    queryFn: () => fetchOtbPlanRows(params),
    placeholderData: (prev) => prev,
  })
}

export function useOtbPlanRow(id: string | null) {
  return useQuery({
    queryKey: ['otb-plan-row', id],
    queryFn: () => fetchOtbPlanRow(id as string),
    enabled: !!id,
  })
}

export function useOtbPlanRowAudit(id: string | null) {
  return useQuery({
    queryKey: ['otb-plan-row-audit', id],
    queryFn: () => fetchOtbPlanRowAudit(id as string),
    enabled: !!id,
  })
}

export function useCreateOtbPlanRow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateOtbPlanRowPayload) => createOtbPlanRow(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['otb-plan-rows'] }) },
  })
}

export function useUpdateOtbPlanRow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateOtbPlanRowPayload }) => updateOtbPlanRow(id, payload),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['otb-plan-rows'] })
      qc.invalidateQueries({ queryKey: ['otb-plan-row', row.id] })
      qc.invalidateQueries({ queryKey: ['otb-plan-row-audit', row.id] })
    },
  })
}

export function useDeleteOtbPlanRow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteOtbPlanRow(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['otb-plan-rows'] }) },
  })
}

export function useRecalculateOtbPlanRow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changedBy }: { id: string; changedBy?: string }) => recalculateOtbPlanRow(id, changedBy),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['otb-plan-row', row.id] })
      qc.invalidateQueries({ queryKey: ['otb-plan-row-audit', row.id] })
    },
  })
}

export function useCopyOtbPlanRow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, targetStoreId, targetCategoryId, changedBy }: { id: string; targetStoreId: string; targetCategoryId: string; changedBy?: string }) =>
      copyOtbPlanRow(id, targetStoreId, targetCategoryId, changedBy),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['otb-plan-rows'] }) },
  })
}
