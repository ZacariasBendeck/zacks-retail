// Client for /api/v1/reports/runs — frozen snapshots of report runs.
// Companion to reportTemplatesApi.ts; same error / request conventions.
// Spec: docs/dev/plans/2026-04-22-report-templates-and-runs.md Phase 1.1.

import { REPORT_TYPES, type ReportType, type TemplateVisibility, type TemplateListScope } from './reportTemplatesApi'

const API_BASE = '/api/v1/reports/runs'

export { REPORT_TYPES }
export type { ReportType, TemplateVisibility as RunVisibility, TemplateListScope as RunListScope }

// Envelope-only summary — the list endpoint returns 50 of these. The full
// resultJson is only fetched when the operator opens a specific snapshot.
export interface RunSummary {
  id: string
  userId: string
  userDisplayName: string
  reportType: ReportType
  sourceTemplateId: string | null
  title: string | null
  visibility: TemplateVisibility
  rowCount: number
  resultSizeBytes: number
  reportTypeVersion: number
  createdAt: string
}

export type RunDetail = RunSummary & {
  paramsJson: Record<string, unknown>
  resultJson: unknown
}

export interface CreateRunInput {
  reportType: ReportType
  title?: string
  paramsJson: Record<string, unknown>
  resultJson: unknown
  visibility?: TemplateVisibility
  sourceTemplateId?: string
}

export interface UpdateRunInput {
  title?: string
  visibility?: TemplateVisibility
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json()
}

export const reportRunsApi = {
  list(args: {
    scope: TemplateListScope
    reportType?: ReportType
    sourceTemplateId?: string
    limit?: number
    offset?: number
  }) {
    const params = new URLSearchParams({ scope: args.scope })
    if (args.reportType) params.set('reportType', args.reportType)
    if (args.sourceTemplateId) params.set('sourceTemplateId', args.sourceTemplateId)
    if (args.limit != null) params.set('limit', String(args.limit))
    if (args.offset != null) params.set('offset', String(args.offset))
    return request<{ runs: RunSummary[]; total: number }>(`/?${params}`)
  },
  create(input: CreateRunInput) {
    return request<{ run: RunDetail }>('/', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  get(id: string) {
    return request<{ run: RunDetail }>(`/${id}`)
  },
  update(id: string, patch: UpdateRunInput) {
    return request<{ run: RunDetail }>(`/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  delete(id: string) {
    return request<void>(`/${id}`, { method: 'DELETE' })
  },
}
