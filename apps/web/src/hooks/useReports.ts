import { useQuery } from '@tanstack/react-query'
import { fetchOnHandByDepartment, fetchOnHandDrillDown } from '../services/reportApi'

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
