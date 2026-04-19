const API_BASE = '/api/v1/users';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  roleId: string;
  role: { id: string; name: string; permissions: string[] };
  ricsUserId: string | null;
  salespersonCode: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  password: string;
  roleId: string;
  ricsUserId?: string | null;
  salespersonCode?: string | null;
  active?: boolean;
}

export interface UpdateUserInput {
  email?: string;
  displayName?: string;
  roleId?: string;
  active?: boolean;
  ricsUserId?: string | null;
  salespersonCode?: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export const userApi = {
  list: () => request<{ users: AdminUser[] }>(''),
  get: (id: string) => request<{ user: AdminUser }>(`/${id}`),
  create: (input: CreateUserInput) =>
    request<{ user: AdminUser }>('', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: UpdateUserInput) =>
    request<{ user: AdminUser }>(`/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/${id}`, { method: 'DELETE' }),
  listRoles: () => request<{ roles: Role[] }>('/_meta/roles'),
};
