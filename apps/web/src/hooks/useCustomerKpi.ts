import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchCustomerKpiFilterOptions,
  fetchCustomerKpiList,
  fetchCustomerMetrics,
  fetchCustomerMetricsSummary,
  recomputeAllCustomerMetrics,
  recomputeCustomerMetrics,
} from '../services/customerKpiApi'
import type { CustomerKpiListParams } from '../types/customerKpi'

export function useCustomerMetricsSummary() {
  return useQuery({
    queryKey: ['customer-kpi', 'summary'],
    queryFn: () => fetchCustomerMetricsSummary(),
    staleTime: 30 * 1000,
  })
}

export function useCustomerKpiList(params: CustomerKpiListParams) {
  return useQuery({
    queryKey: ['customer-kpi', 'list', params],
    queryFn: () => fetchCustomerKpiList(params),
    placeholderData: (prev) => prev,
  })
}

export function useCustomerKpiFilterOptions() {
  return useQuery({
    queryKey: ['customer-kpi', 'filter-options'],
    queryFn: () => fetchCustomerKpiFilterOptions(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCustomerMetrics(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customer-kpi', 'detail', customerId],
    queryFn: () => fetchCustomerMetrics(customerId!),
    enabled: !!customerId,
  })
}

export function useRecomputeCustomerMetrics() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (customerId: string) => recomputeCustomerMetrics(customerId),
    onSuccess: (_data, customerId) => {
      qc.invalidateQueries({ queryKey: ['customer-kpi', 'detail', customerId] })
      qc.invalidateQueries({ queryKey: ['customer-kpi', 'summary'] })
      qc.invalidateQueries({ queryKey: ['customer-kpi', 'list'] })
    },
  })
}

export function useRecomputeAllCustomerMetrics() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (batchSize?: number) => recomputeAllCustomerMetrics(batchSize),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-kpi'] })
    },
  })
}
