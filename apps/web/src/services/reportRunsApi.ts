// Client for /api/v1/reports/runs — frozen snapshots of report runs.
// Companion to reportTemplatesApi.ts; same error / request conventions.
// Spec: docs/dev/plans/2026-04-22-report-templates-and-runs.md Phase 1.1.

import dayjs from 'dayjs'
import { REPORT_TYPES, type ReportType, type TemplateVisibility, type TemplateListScope } from './reportTemplatesApi'

const API_BASE = '/api/v1/reports/runs'

export { REPORT_TYPES }
export type { ReportType, TemplateVisibility as RunVisibility, TemplateListScope as RunListScope }

/**
 * Human-friendly labels for every report type, keyed by the API slug. Used
 * by the runs / templates list columns AND by the default-title generator
 * below so a snapshot saved without a title reads like a real report name.
 */
export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  'sales-analysis': 'Sales Analysis',
  'sales-hierarchy-drill-down': 'Sales Hierarchy Drill-Down',
  'sales-pivot': 'Sales Pivot',
  'best-sellers': 'Best Sellers',
  'stock-status': 'Stock Status',
  'sales-by-day': 'Sales by Day',
  'sales-by-time': 'Sales by Time',
  'salesperson-summary': 'Salesperson Summary',
  'sales-history-by-month': 'Sales History by Month',
  'balancing-transfer': 'Balancing Transfer',
}

/**
 * Default title when the operator saves a snapshot without typing one.
 * Without a descriptor: `{Report name} — YYYY-MM-DD HH:mm`.
 * With a descriptor: `{Report name} — {descriptor} — YYYY-MM-DD HH:mm`,
 * where the descriptor is a brief summary of the dimensions / report type
 * and the criteria that were applied. The descriptor is trimmed (with an
 * ellipsis) to keep the whole string within the backend's 100-char title cap.
 */
export function defaultSnapshotTitle(
  reportType: ReportType,
  descriptor?: string,
  now: dayjs.Dayjs = dayjs(),
): string {
  const label = REPORT_TYPE_LABELS[reportType] ?? reportType
  const ts = now.format('YYYY-MM-DD HH:mm')
  const desc = descriptor?.trim() ?? ''
  if (!desc) return `${label} — ${ts}`
  // Backend caps title at 100 chars. Reserve label, two " — " separators,
  // and the timestamp; the descriptor gets whatever's left, ellipsised if
  // needed so the timestamp tail always survives.
  const reserved = label.length + 3 + 3 + ts.length
  const maxDesc = Math.max(0, 100 - reserved)
  const trimmed =
    desc.length > maxDesc ? `${desc.slice(0, Math.max(0, maxDesc - 1))}…` : desc
  return `${label} — ${trimmed} — ${ts}`
}

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
