const API_BASE = '/api/v1/auth';

export interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: { id: string; name: string };
  };
  permissions: string[];
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

export const authApi = {
  login: (email: string, password: string) =>
    request<{ user: MeResponse['user'] }>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>('/logout', { method: 'POST' }),
  me: () => request<MeResponse>('/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<void>('/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
};
