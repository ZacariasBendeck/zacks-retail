import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../services/posApi'

// --- Catalog queries --------------------------------------------------------

export function useStores() {
  return useQuery({
    queryKey: ['pos', 'stores'],
    queryFn: () => api.fetchStores(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useRegisters(storeId?: number) {
  return useQuery({
    queryKey: ['pos', 'registers', storeId],
    queryFn: () => api.fetchRegisters(storeId),
    staleTime: 5 * 60 * 1000,
  })
}

export function useTenderTypes(storeId: number) {
  return useQuery({
    queryKey: ['pos', 'tenderTypes', storeId],
    queryFn: () => api.fetchTenderTypes(storeId),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePayoutCategories(storeId: number) {
  return useQuery({
    queryKey: ['pos', 'payoutCategories', storeId],
    queryFn: () => api.fetchPayoutCategories(storeId),
    staleTime: 5 * 60 * 1000,
  })
}

// --- Shifts ----------------------------------------------------------------

export function useOpenShifts(storeId?: number) {
  return useQuery({
    queryKey: ['pos', 'openShifts', storeId],
    queryFn: () => api.fetchOpenShifts(storeId),
  })
}

export function useShift(shiftId: string | null | undefined) {
  return useQuery({
    queryKey: ['pos', 'shift', shiftId],
    queryFn: () => api.fetchShift(shiftId!),
    enabled: !!shiftId,
  })
}

export function useCashTotals(shiftId: string | null | undefined) {
  return useQuery({
    queryKey: ['pos', 'cashTotals', shiftId],
    queryFn: () => api.fetchCashTotals(shiftId!),
    enabled: !!shiftId,
    refetchInterval: 5_000,
  })
}

export function useOpenShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.openShift,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'openShifts'] })
    },
  })
}

export function useCloseShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ shiftId, ...payload }: Parameters<typeof api.closeShift>[1] & { shiftId: string }) =>
      api.closeShift(shiftId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'openShifts'] })
      qc.invalidateQueries({ queryKey: ['pos', 'shift'] })
    },
  })
}

export function usePostShiftToInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ shiftId, postedByUserId }: { shiftId: string; postedByUserId: string }) =>
      api.postShiftToInventory(shiftId, postedByUserId),
    onSuccess: (shift) => {
      qc.invalidateQueries({ queryKey: ['pos', 'shift', shift.id] })
      qc.invalidateQueries({ queryKey: ['pos', 'openShifts'] })
    },
  })
}

// --- Tickets ----------------------------------------------------------------

export function useTicket(ticketId: string | null | undefined) {
  return useQuery({
    queryKey: ['pos', 'ticket', ticketId],
    queryFn: () => api.fetchTicket(ticketId!),
    enabled: !!ticketId,
  })
}

export function useCreateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createTicket,
    onSuccess: (ticket) => {
      qc.setQueryData(['pos', 'ticket', ticket.id], ticket)
    },
  })
}

export function useAddLine(ticketId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof api.addLine>[1]) => api.addLine(ticketId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'ticket', ticketId] })
    },
  })
}

export function useRemoveLine(ticketId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (lineId: string) => api.removeLine(ticketId, lineId),
    onSuccess: (ticket) => {
      qc.setQueryData(['pos', 'ticket', ticketId], ticket)
    },
  })
}

export function useAddTender(ticketId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { tenderTypeId: string; amount: number; accountNumber?: string }) =>
      api.addTender(ticketId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'ticket', ticketId] })
    },
  })
}

export function useEndTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ticketId: string) => api.endTicket(ticketId),
    onSuccess: (ticket) => {
      qc.setQueryData(['pos', 'ticket', ticket.id], ticket)
      qc.invalidateQueries({ queryKey: ['pos', 'cashTotals', ticket.shiftId] })
    },
  })
}

export function useVoidTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      ticketId,
      ...payload
    }: Parameters<typeof api.voidTicket>[1] & { ticketId: string }) => api.voidTicket(ticketId, payload),
    onSuccess: (ticket) => {
      qc.setQueryData(['pos', 'ticket', ticket.id], ticket)
      qc.invalidateQueries({ queryKey: ['pos', 'cashTotals', ticket.shiftId] })
    },
  })
}

export function useReprintTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      ticketId,
      ...payload
    }: Parameters<typeof api.reprintTicket>[1] & { ticketId: string }) =>
      api.reprintTicket(ticketId, payload),
    onSuccess: (ticket) => {
      qc.setQueryData(['pos', 'ticket', ticket.id], ticket)
    },
  })
}

// --- Payouts ---------------------------------------------------------------

export function usePayoutsForShift(shiftId: string | null | undefined) {
  return useQuery({
    queryKey: ['pos', 'payouts', shiftId],
    queryFn: () => api.fetchPayoutsForShift(shiftId!),
    enabled: !!shiftId,
  })
}

export function useCreatePayout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createPayout,
    onSuccess: (payout) => {
      qc.invalidateQueries({ queryKey: ['pos', 'payouts', payout.shiftId] })
      qc.invalidateQueries({ queryKey: ['pos', 'cashTotals', payout.shiftId] })
    },
  })
}
