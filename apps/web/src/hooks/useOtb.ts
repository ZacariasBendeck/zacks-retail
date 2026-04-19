import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createOtbMonthlyPlan,
  deleteOtbMonthlyPlan,
  fetchOtbBudgets,
  fetchOtbLines,
  fetchOtbMonthlyPlans,
  fetchOtbSummary,
  updateOtbMonthlyPlan,
} from '../services/otbApi'
import type {
  CreateOtbMonthlyPlanPayload,
  OtbBudgetListParams,
  OtbLineParams,
  OtbMonthlyPlanParams,
  OtbSummaryParams,
  UpdateOtbMonthlyPlanPayload,
} from '../types/otb'

export function useOtbSummary(params: OtbSummaryParams) {
  return useQuery({
    queryKey: ['otb-summary', params],
    queryFn: () => fetchOtbSummary(params),
    staleTime: 60_000,
  })
}

export function useOtbLines(params: OtbLineParams) {
  return useQuery({
    queryKey: ['otb-lines', params],
    queryFn: () => fetchOtbLines(params),
    placeholderData: (prev) => prev,
  })
}

export function useOtbBudgets(params: OtbBudgetListParams) {
  return useQuery({
    queryKey: ['otb-budgets', params],
    queryFn: () => fetchOtbBudgets(params),
    placeholderData: (prev) => prev,
  })
}

export function useOtbMonthlyPlans(params: OtbMonthlyPlanParams) {
  return useQuery({
    queryKey: ['otb-monthly-plans', params],
    queryFn: () => fetchOtbMonthlyPlans(params),
    placeholderData: (prev) => prev,
  })
}

export function useCreateOtbMonthlyPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateOtbMonthlyPlanPayload) => createOtbMonthlyPlan(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['otb-monthly-plans'] })
      queryClient.invalidateQueries({ queryKey: ['otb-summary'] })
      queryClient.invalidateQueries({ queryKey: ['otb-lines'] })
    },
  })
}

export function useUpdateOtbMonthlyPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, payload }: { planId: string; payload: UpdateOtbMonthlyPlanPayload }) =>
      updateOtbMonthlyPlan(planId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['otb-monthly-plans'] })
      queryClient.invalidateQueries({ queryKey: ['otb-summary'] })
      queryClient.invalidateQueries({ queryKey: ['otb-lines'] })
    },
  })
}

export function useDeleteOtbMonthlyPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (planId: string) => deleteOtbMonthlyPlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['otb-monthly-plans'] })
      queryClient.invalidateQueries({ queryKey: ['otb-summary'] })
      queryClient.invalidateQueries({ queryKey: ['otb-lines'] })
    },
  })
}
