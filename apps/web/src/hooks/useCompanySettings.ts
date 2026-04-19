import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchOtbEntryMethod, setOtbEntryMethod } from '../services/companySettingsApi'
import type { OtbEntryMethod } from '../types/otbPlanRow'

export function useOtbEntryMethod() {
  return useQuery({
    queryKey: ['company-settings', 'otb-entry-method'],
    queryFn: fetchOtbEntryMethod,
    staleTime: 60_000,
  })
}

export function useSetOtbEntryMethod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ value, changedBy }: { value: OtbEntryMethod; changedBy?: string }) => setOtbEntryMethod(value, changedBy),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company-settings', 'otb-entry-method'] }) },
  })
}
