import { useQuery } from '@tanstack/react-query'
import {
  fetchOtbDashboardPlans,
  fetchOtbDashboardRows,
  fetchOtbDashboardSummary,
} from '../services/otbDashboardApi'
import type {
  OtbDashboardFilterParams,
  OtbDashboardPlansParams,
  OtbDashboardRowsParams,
} from '../types/otbDashboard'

export function useOtbDashboardPlans(params: OtbDashboardPlansParams = {}) {
  return useQuery({
    queryKey: ['otb-dashboard', 'plans', params],
    queryFn: () => fetchOtbDashboardPlans(params),
    staleTime: 60_000,
  })
}

export function useOtbDashboardSummary(params: OtbDashboardFilterParams | undefined) {
  return useQuery({
    queryKey: ['otb-dashboard', 'summary', params],
    queryFn: () => fetchOtbDashboardSummary(params!),
    enabled: Boolean(params?.planId),
    staleTime: 60_000,
  })
}

export function useOtbDashboardRows(params: OtbDashboardRowsParams | undefined) {
  return useQuery({
    queryKey: ['otb-dashboard', 'rows', params],
    queryFn: () => fetchOtbDashboardRows(params!),
    enabled: Boolean(params?.planId),
    placeholderData: (prev) => prev,
  })
}
