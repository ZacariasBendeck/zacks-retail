import { createContext, ReactNode, useCallback, useEffect, useState } from 'react';
import type { SupportedLocale } from '@benlow-rics/i18n';
import { authApi, MeResponse } from '../services/authApi';

export interface AuthState {
  user: MeResponse['user'] | null;
  permissions: Set<string>;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updatePreferences: (input: { preferredLocale: SupportedLocale | null }) => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse['user'] | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me.user);
      setPermissions(new Set(me.permissions));
    } catch {
      setUser(null);
      setPermissions(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    await authApi.login(email, password);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setPermissions(new Set());
  }, []);

  const updatePreferences = useCallback(async (input: { preferredLocale: SupportedLocale | null }) => {
    const result = await authApi.updatePreferences(input);
    setUser(result.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, refresh, updatePreferences }}>
      {children}
    </AuthContext.Provider>
  );
}
