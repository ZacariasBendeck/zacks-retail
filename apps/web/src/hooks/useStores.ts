import { useQuery } from '@tanstack/react-query'
import { fetchStores } from '../services/storeApi'

export function useStores() {
  return useQuery({
    queryKey: ['stores'],
    queryFn: fetchStores,
    staleTime: 5 * 60_000,
  })
}
