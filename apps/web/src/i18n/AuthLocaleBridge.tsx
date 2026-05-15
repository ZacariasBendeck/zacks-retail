import { useEffect } from 'react';
import { normalizeLocale } from '@benlow-rics/i18n';
import { useI18nLocale } from '@benlow-rics/i18n/react';
import { useAuth } from '../auth/useAuth';

export function AuthLocaleBridge() {
  const { user, loading } = useAuth();
  const { locale, setLocale } = useI18nLocale();

  useEffect(() => {
    if (loading) return;
    const preferredLocale = normalizeLocale(user?.preferredLocale);
    if (!preferredLocale || preferredLocale === locale) return;
    void setLocale(preferredLocale);
  }, [loading, locale, setLocale, user?.preferredLocale]);

  return null;
}
