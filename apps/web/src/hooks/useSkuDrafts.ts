import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  SkuLifecycleRow,
  CreateDraftInput,
  UpdateDraftInput,
  FinalizeDraftInput,
} from '../types/skuLifecycle'

const BASE = '/api/v1/products/sku-drafts'

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message = (body as { error?: { message?: string } })?.error?.message ?? `Request failed: ${res.status}`
    const code = (body as { error?: { code?: string } })?.error?.code
    const err = new Error(message) as Error & { httpStatus?: number; apiCode?: string }
    err.httpStatus = res.status
    err.apiCode = code
    throw err
  }
  return res.json() as Promise<T>
}

export function useSkuDraftsList() {
  return useQuery({
    queryKey: ['sku-drafts', 'list'],
    queryFn: () => apiJson<SkuLifecycleRow[]>(`${BASE}/drafts`),
    staleTime: 30 * 1000,
  })
}

export function useSkuDraft(id: string | null | undefined) {
  return useQuery({
    queryKey: ['sku-drafts', 'detail', id],
    queryFn: () => apiJson<SkuLifecycleRow>(`${BASE}/${id!}`),
    enabled: !!id,
  })
}

/**
 * Look up a SKU by its final (RICS) code. Returns the full app.sku row —
 * covers both app-created SKUs and RICS SKUs mirrored by sync:rics. Used by
 * the inline lookup on the SKU form + the SKU Lookup modal.
 *
 * 404 is surfaced as null (not an exception) so consumers can treat "unknown
 * code" as a normal outcome.
 */
export async function fetchSkuDraftByCode(code: string): Promise<SkuLifecycleRow | null> {
  const res = await fetch(`${BASE}/by-code/${encodeURIComponent(code)}`)
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message =
      (body as { error?: { message?: string } })?.error?.message ?? `Request failed: ${res.status}`
    throw new Error(message)
  }
  return res.json() as Promise<SkuLifecycleRow>
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['sku-drafts'] })
}

export function useCreateSkuDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDraftInput) =>
      apiJson<SkuLifecycleRow>(BASE, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useUpdateSkuDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateDraftInput }) =>
      apiJson<SkuLifecycleRow>(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useFinalizeSkuDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FinalizeDraftInput }) =>
      apiJson<SkuLifecycleRow>(`${BASE}/${id}/finalize`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useDiscontinueSkuDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiJson<SkuLifecycleRow>(`${BASE}/${id}/discontinue`, { method: 'POST' }),
    onSuccess: () => invalidateAll(qc),
  })
}
