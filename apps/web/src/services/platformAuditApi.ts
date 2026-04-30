const API_BASE = '/api/v1/platform/audit';

export interface PlatformAuditEvent {
  id: string;
  eventType: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceLabel: string | null;
  actorUserId: string | null;
  actorUser: PlatformAuditUserRef | null;
  actorSessionId: string | null;
  outcome: string;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  metadataJson: unknown;
  createdAt: string;
}

export interface PlatformAuditUserRef {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
}

export interface PlatformAuditResourceOption {
  resourceType: string;
  resourceId: string;
  label: string;
}

export interface PlatformAuditOptions {
  eventTypes: string[];
  resourceTypes: string[];
  outcomes: string[];
  actors: PlatformAuditUserRef[];
  resources: PlatformAuditResourceOption[];
}

export interface PlatformAuditFilters {
  actorUserId?: string;
  eventType?: string;
  outcome?: string;
  resourceType?: string;
  resourceId?: string;
  limit?: number;
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function queryString(filters: PlatformAuditFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value == null || value === '') return;
    params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const platformAuditApi = {
  list: (filters: PlatformAuditFilters = {}) =>
    request<{ events: PlatformAuditEvent[] }>(queryString(filters)),
  options: () => request<{ options: PlatformAuditOptions }>('/_meta/options'),
  get: (id: string) => request<{ event: PlatformAuditEvent }>(`/${id}`),
};
