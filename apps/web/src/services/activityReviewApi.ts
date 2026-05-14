const API_BASE = '/api/v1/activity-review'

export type ActivityReviewRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export type ActivityReviewStatus = 'UNREVIEWED' | 'REVIEWED' | 'FLAGGED' | 'NO_ISSUE'
export type ActivityReviewBulkReviewMode = 'IDS' | 'FILTER'

export interface ActivityReviewEvent {
  id: string
  occurredAt: string
  module: string
  action: string
  actionLabel: string
  category: string
  riskLevel: ActivityReviewRiskLevel
  outcome: string
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  resourceType: string
  resourceId: string | null
  resourceLabel: string | null
  storeId: string | null
  registerId: string | null
  ipAddress: string | null
  userAgent: string | null
  reason: string | null
  beforeJson: unknown
  afterJson: unknown
  metadataJson: unknown
  reviewStatus: ActivityReviewStatus
  reviewedByUserId: string | null
  reviewedAt: string | null
  reviewNote: string | null
}

export interface ActivityReviewUserSummary {
  actorUserId: string | null
  actorName: string
  actorEmail: string | null
  lastActivityAt: string
  totalEvents: number
  todayEvents: number
  thisWeekEvents: number
  highRiskEvents: number
  failedEvents: number
  flaggedEvents: number
  modules: string[]
  categories: Record<string, number>
}

export interface ActivityReviewFilters {
  actorUserId?: string
  module?: string
  category?: string
  resourceType?: string
  storeId?: string
  outcome?: string
  riskLevel?: ActivityReviewRiskLevel
  reviewStatus?: ActivityReviewStatus
  search?: string
  createdFrom?: string
  createdTo?: string
  limit?: number
}

export interface ActivityReviewBulkSkippedEvent {
  id: string
  occurredAt: string
  actionLabel: string
  module: string
  outcome: string
  riskLevel: ActivityReviewRiskLevel
  reviewStatus: ActivityReviewStatus
}

export interface ActivityReviewBulkReviewResult {
  status: Exclude<ActivityReviewStatus, 'UNREVIEWED'>
  updatedCount: number
  skippedCount: number
  skippedEvents: ActivityReviewBulkSkippedEvent[]
  hasMore: boolean
}

export type ActivityReviewBulkReviewInput =
  | {
      mode: 'IDS'
      eventIds: string[]
      status: Exclude<ActivityReviewStatus, 'UNREVIEWED'>
      reviewNote: string
    }
  | {
      mode: 'FILTER'
      filters: ActivityReviewFilters
      status: Exclude<ActivityReviewStatus, 'UNREVIEWED'>
      reviewNote: string
    }

export class ActivityReviewApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ActivityReviewApiError'
    this.status = status
    this.code = code
  }
}

function queryString(filters: ActivityReviewFilters): string {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value == null || value === '') return
    params.set(key, String(value))
  })
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    let code: string | undefined
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      code = body?.error?.code
      if (body?.error?.message) message = body.error.message
    } catch {
      // Keep the generic status message if the response was not JSON.
    }
    throw new ActivityReviewApiError(message, res.status, code)
  }
  return res.json() as Promise<T>
}

export const activityReviewApi = {
  listEvents: (filters: ActivityReviewFilters = {}) =>
    request<{ events: ActivityReviewEvent[] }>(`/events${queryString(filters)}`),
  getSummary: (filters: ActivityReviewFilters = {}) =>
    request<{ summary: ActivityReviewUserSummary[] }>(`/summary${queryString(filters)}`),
  getEvent: (id: string) => request<{ event: ActivityReviewEvent }>(`/events/${id}`),
  updateReview: (id: string, input: { status: Exclude<ActivityReviewStatus, 'UNREVIEWED'>; reviewNote?: string | null }) =>
    request<{ event: ActivityReviewEvent }>(`/events/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  bulkReview: (input: ActivityReviewBulkReviewInput) =>
    request<ActivityReviewBulkReviewResult>('/events/bulk-review', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  eventsCsvUrl: (filters: ActivityReviewFilters = {}) => `${API_BASE}/events.csv${queryString(filters)}`,
}
