import { useQuery } from '@tanstack/react-query'
import { fetchCasePackByCode, fetchCasePacks } from '../services/casePackApi'

export function useCasePacks() {
  return useQuery({
    queryKey: ['case-packs'],
    queryFn: fetchCasePacks,
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
