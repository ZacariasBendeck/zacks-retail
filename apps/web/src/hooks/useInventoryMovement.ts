import { useQuery } from '@tanstack/react-query'
import {
  fetchMovementReconciliation,
  fetchMovementTimeline,
} from '../services/inventoryMovementApi'
import type {
  MovementReconciliationParams,
  MovementTimelineParams,
} from '../types/inventoryMovement'

export function useMovementTimeline(params: MovementTimelineParams) {
  return useQuery({
    queryKey: ['movement-timeline', params],
    queryFn: () => fetchMovementTimeline(params),
    placeholderData: (prev) => prev,
  })
}

export function useMovementReconciliation(params: MovementReconciliationParams) {
  return useQuery({
    queryKey: ['movement-reconciliation', params],
    queryFn: () => fetchMovementReconciliation(params),
    placeholderData: (prev) => prev,
  })
}
