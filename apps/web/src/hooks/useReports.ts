import { useQuery } from '@tanstack/react-query'
import {
  fetchOnHandByDepartment,
  fetchOnHandDrillDown,
  fetchSalesPerformanceByDepartment,
  fetchSalesPerformanceDrillDown,
  fetchTurnoverByDepartment,
  fetchTurnoverDrillDown,
} from '../services/reportApi'

export function useOnHandByDepartment() {
  return useQuery({
    queryKey: ['report-on-hand-departments'],
    queryFn: fetchOnHandByDepartment,
  })
}

export function useOnHandDrillDown(department: string, category?: number) {
  return useQuery({
    queryKey: ['report-on-hand-drilldown', department, category],
    queryFn: () => fetchOnHandDrillDown(department, category),
    enabled: !!department,
  })
}

export function useSalesPerformanceByDepartment(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['report-sales-departments', startDate, endDate],
    queryFn: () => fetchSalesPerformanceByDepartment(startDate, endDate),
    enabled: !!startDate && !!endDate,
  })
}

export function useSalesPerformanceDrillDown(
  startDate: string,
  endDate: string,
  department: string,
  category?: number,
) {
  return useQuery({
    queryKey: ['report-sales-drilldown', startDate, endDate, department, category],
    queryFn: () => fetchSalesPerformanceDrillDown(startDate, endDate, department, category),
    enabled: !!startDate && !!endDate && !!department,
  })
}

export function useTurnoverByDepartment(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['report-turnover-departments', startDate, endDate],
    queryFn: () => fetchTurnoverByDepartment(startDate, endDate),
  })
}

export function useTurnoverDrillDown(
  department: string,
  startDate?: string,
  endDate?: string,
  category?: number,
) {
  return useQuery({
    queryKey: ['report-turnover-drilldown', department, startDate, endDate, category],
    queryFn: () => fetchTurnoverDrillDown(department, startDate, endDate, category),
    enabled: !!department,
  })
}
