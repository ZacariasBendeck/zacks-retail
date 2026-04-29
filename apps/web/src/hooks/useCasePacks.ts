import { useQuery } from '@tanstack/react-query'
import { fetchCasePackByCode, fetchCasePacks, type CasePackSummary } from '../services/casePackApi'

export function useCasePacks(params: { sizeTypeCode?: number } = {}) {
  return useQuery<CasePackSummary[]>({
    queryKey: ['case-packs', params],
    queryFn: () => fetchCasePacks(params),
    staleTime: 5 * 60_000,
  })
}

export function useCasePack(code: string | null) {
  return useQuery({
    queryKey: ['case-packs', code],
    queryFn: () => fetchCasePackByCode(code!),
    enabled: Boolean(code),
    staleTime: 5 * 60_000,
  })
}
