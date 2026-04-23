// Client for /api/v1/reports/templates. Report templates are reusable saved
// queries — click Run to replay with current data. See the plan at
// docs/dev/plans/2026-04-22-report-templates-and-runs.md for the full design.

const API_BASE = '/api/v1/reports/templates'

// Kebab-case values matching apps/api/src/services/reports/reportTypes.ts.
// Kept in sync by convention — both sides are one line each.
export const REPORT_TYPES = [
  'sales-analysis',
  'sales-hierarchy-drill-down',
  'best-sellers',
  'stock-status',
  'sales-by-day',
  'sales-by-time',
  'salesperson-summary',
  'sales-history-by-month',
] as const
export type ReportType = (typeof REPORT_TYPES)[number]

export type TemplateVisibility = 'private' | 'shared'
export type TemplateListScope = 'mine' | 'all'

export interface TemplateSummary {
  id: string
  ownerId: string
  ownerDisplayName: string
  reportType: ReportType
  title: string
  visibility: TemplateVisibility
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
}

export interface TemplateDetail extends TemplateSummary {
  paramsJson: Record<string, unknown>
}

export interface CreateTemplateInput {
  reportType: ReportType
  title: string
  paramsJson: Record<string, unknown>
  visibility?: TemplateVisibility
}

export interface UpdateTemplateInput {
  title?: string
  paramsJson?: Record<string, unknown>
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

export const reportTemplatesApi = {
  list(args: { scope: TemplateListScope; reportType?: ReportType }) {
    const params = new URLSearchParams({ scope: args.scope })
    if (args.reportType) params.set('reportType', args.reportType)
    return request<{ templates: TemplateSummary[] }>(`/?${params}`)
  },
  create(input: CreateTemplateInput) {
    return request<{ template: TemplateDetail }>('/', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  get(id: string) {
    return request<{ template: TemplateDetail }>(`/${id}`)
  },
  update(id: string, patch: UpdateTemplateInput) {
    return request<{ template: TemplateDetail }>(`/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  delete(id: string) {
    return request<void>(`/${id}`, { method: 'DELETE' })
  },
  touch(id: string) {
    return request<void>(`/${id}/touch`, { method: 'POST' })
  },
}
