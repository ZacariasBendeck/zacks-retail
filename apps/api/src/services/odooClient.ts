import axios, { AxiosInstance } from 'axios';

const ODOO_BASE_URL = process.env.ODOO_URL || 'http://localhost:8069';
const ODOO_API_BASE = process.env.ODOO_API_BASE || '/rics-storefront-api';
const ODOO_DB = process.env.ODOO_DB || 'odoo';
const ODOO_USER = process.env.ODOO_USER || 'admin';
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || 'admin';

let sessionId: string | null = null;

function createClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${ODOO_BASE_URL}${ODOO_API_BASE}`,
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  client.interceptors.request.use((config) => {
    if (sessionId) {
      config.headers.Cookie = `session_id=${sessionId}`;
    }
    return config;
  });

  return client;
}

export async function authenticate(): Promise<void> {
  const res = await axios.post(`${ODOO_BASE_URL}/web/session/authenticate`, {
    jsonrpc: '2.0',
    params: {
      db: ODOO_DB,
      login: ODOO_USER,
      password: ODOO_PASSWORD,
    },
  });

  const cookies = res.headers['set-cookie'];
  if (cookies) {
    for (const cookie of cookies) {
      const match = cookie.match(/session_id=([^;]+)/);
      if (match) {
        sessionId = match[1];
        return;
      }
    }
  }
  throw new Error('Failed to authenticate with Odoo');
}

const client = createClient();

async function ensureAuth(): Promise<void> {
  if (!sessionId) {
    await authenticate();
  }
}

export const odoo = {
  async get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    await ensureAuth();
    try {
      const res = await client.get(path, { params });
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 401) {
        sessionId = null;
        await ensureAuth();
        const res = await client.get(path, { params });
        return res.data;
      }
      throw err;
    }
  },

  async post<T = unknown>(path: string, data?: unknown): Promise<T> {
    await ensureAuth();
    try {
      const res = await client.post(path, data);
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 401) {
        sessionId = null;
        await ensureAuth();
        const res = await client.post(path, data);
        return res.data;
      }
      throw err;
    }
  },

  async patch<T = unknown>(path: string, data?: unknown): Promise<T> {
    await ensureAuth();
    try {
      const res = await client.patch(path, data);
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 401) {
        sessionId = null;
        await ensureAuth();
        const res = await client.patch(path, data);
        return res.data;
      }
      throw err;
    }
  },

  async delete<T = unknown>(path: string): Promise<T> {
    await ensureAuth();
    try {
      const res = await client.delete(path);
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 401) {
        sessionId = null;
        await ensureAuth();
        const res = await client.delete(path);
        return res.data;
      }
      throw err;
    }
  },
};
