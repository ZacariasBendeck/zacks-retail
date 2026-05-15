export const SUPPORTED_LOCALES = ['en-US', 'es-HN'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const FALLBACK_LOCALE: SupportedLocale = 'en-US';
export const DEFAULT_SPANISH_LOCALE: SupportedLocale = 'es-HN';
export const LANGUAGE_STORAGE_KEY = 'zacks-retail.locale';

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  'en-US': 'English',
  'es-HN': 'Espa\u00f1ol',
};

export function normalizeLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace('_', '-').toLowerCase();
  if (!normalized) return null;

  if (normalized === 'en' || normalized.startsWith('en-')) return 'en-US';
  if (normalized === 'es' || normalized.startsWith('es-')) return 'es-HN';
  return null;
}

export function readStoredLocale(storage: Storage | undefined = browserStorage()): SupportedLocale | null {
  try {
    return normalizeLocale(storage?.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: SupportedLocale, storage: Storage | undefined = browserStorage()): void {
  try {
    storage?.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable in private browsing or restricted test contexts.
  }
}

export interface ResolveLocaleInput {
  userPreference?: string | null;
  storedPreference?: string | null;
  navigatorLanguages?: readonly string[];
}

export function resolvePreferredLocale(input: ResolveLocaleInput = {}): SupportedLocale {
  const userLocale = normalizeLocale(input.userPreference);
  if (userLocale) return userLocale;

  const storedLocale = normalizeLocale(input.storedPreference);
  if (storedLocale) return storedLocale;

  for (const language of input.navigatorLanguages ?? []) {
    const browserLocale = normalizeLocale(language);
    if (browserLocale) return browserLocale;
  }

  return FALLBACK_LOCALE;
}

export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

function browserStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}
