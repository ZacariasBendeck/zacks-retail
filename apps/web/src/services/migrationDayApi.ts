export type MigrationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type MigrationLogStream = 'stdout' | 'stderr' | 'system'
export type MigrationActionGroup = 'sequence' | 'individual' | 'check'

export interface MigrationLogLine {
  at: string
  stream: MigrationLogStream
  text: string
}

export interface MigrationJobSnapshot {
  id: string
  actionId: string
  actionLabel: string
  status: MigrationJobStatus
  startedAt: string
  finishedAt: string | null
  exitCode: number | null
  durationMs: number | null
  logs: MigrationLogLine[]
  result: unknown
  error: string | null
}

export interface MigrationActionConfig {
  mdbDir?: string
  bundleDir?: string
  customerCsvPath?: string
  mailListNamesCsvPath?: string
  inventoryHistoryAsOf?: string
  skipInventoryHistory?: boolean
  skipCustomers?: boolean
  skipTickets?: boolean
  skipSalesHistory?: boolean
  skipSegmentationDefaults?: boolean
  strictFull?: boolean
}

export interface MigrationActionDefinition {
  id: string
  label: string
  group: MigrationActionGroup
  description: string
  requiresMdbDir?: boolean
  requiresBundle: boolean
  requiresAttributeSnapshot?: boolean
  requiresLegacyManifest?: boolean
  requiresCustomerFiles?: boolean
  requiresTicketFiles?: boolean
}

export interface MigrationDefinition {
  actions: MigrationActionDefinition[]
  sequence: string[]
}

export class MigrationDayApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'MigrationDayApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
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
    throw new MigrationDayApiError(message, res.status, code)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const migrationDayApi = {
  getDefinition: () => request<MigrationDefinition>('/api/v1/operations/migration-day/definition'),

  startJob: (actionId: string, config: MigrationActionConfig) =>
    request<MigrationJobSnapshot>('/api/v1/operations/migration-day/jobs', {
      method: 'POST',
      body: JSON.stringify({ actionId, config }),
    }),

  getJob: (jobId: string) =>
    request<MigrationJobSnapshot>(`/api/v1/operations/migration-day/jobs/${encodeURIComponent(jobId)}`),
}
