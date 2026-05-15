import React, { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { App as AntApp, ConfigProvider, Select } from 'antd';
import type { ConfigProviderProps, SelectProps } from 'antd';
import enUS from 'antd/locale/en_US';
import esES from 'antd/locale/es_ES';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import i18next, { type i18n as I18nInstance } from 'i18next';
import { I18nextProvider, initReactI18next, useTranslation as useReactTranslation } from 'react-i18next';
import {
  FALLBACK_LOCALE,
  LANGUAGE_STORAGE_KEY,
  LOCALE_LABELS,
  type SupportedLocale,
  browserLanguages,
  normalizeLocale,
  readStoredLocale,
  resolvePreferredLocale,
  writeStoredLocale,
} from './locales';
import {
  bundledResourcesForApp,
  createResourceBackend,
  translateBundledKey,
  type FrontendApp,
  namespacesForApp,
} from './resources';

interface I18nLocaleContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => Promise<void>;
}

const I18nLocaleContext = createContext<I18nLocaleContextValue | null>(null);

export interface AppI18nProviderProps {
  app: FrontendApp;
  children: React.ReactNode;
  theme?: ConfigProviderProps['theme'];
  initialLocale?: string | null;
  fallback?: React.ReactNode;
}

export function AppI18nProvider({
  app,
  children,
  theme,
  initialLocale,
  fallback = null,
}: AppI18nProviderProps) {
  const initial = useMemo(
    () =>
      resolvePreferredLocale({
        userPreference: initialLocale,
        storedPreference: readStoredLocale(),
        navigatorLanguages: browserLanguages(),
      }),
    [initialLocale],
  );
  const [locale, setLocaleState] = useState<SupportedLocale>(initial);
  const [{ instance: i18n, initPromise }] = useState(() => createI18nInstance(app, initial));
  const [ready, setReady] = useState(false);
  const lastInitialLocaleRef = React.useRef(initialLocale);

  const setLocale = useCallback(
    async (nextLocale: SupportedLocale) => {
      const normalized = normalizeLocale(nextLocale) ?? FALLBACK_LOCALE;
      writeStoredLocale(normalized);
      setLocaleState(normalized);
      await i18n.changeLanguage(normalized);
    },
    [i18n],
  );

  useEffect(() => {
    if (initialLocale === lastInitialLocaleRef.current) return;
    lastInitialLocaleRef.current = initialLocale;
    const normalized = normalizeLocale(initialLocale);
    if (normalized && normalized !== locale) {
      void setLocale(normalized);
    }
  }, [initialLocale, locale, setLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    dayjs.locale(locale === 'es-HN' ? 'es' : 'en');
  }, [locale]);

  useEffect(() => {
    let active = true;
    initPromise
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [initPromise]);

  const contextValue = useMemo<I18nLocaleContextValue>(
    () => ({ locale, setLocale }),
    [locale, setLocale],
  );

  return (
    <I18nLocaleContext.Provider value={contextValue}>
      <I18nextProvider i18n={i18n}>
        <ConfigProvider locale={locale === 'es-HN' ? esES : enUS} theme={theme}>
          <AntApp>
            {ready ? <Suspense fallback={fallback}>{children}</Suspense> : fallback}
          </AntApp>
        </ConfigProvider>
      </I18nextProvider>
    </I18nLocaleContext.Provider>
  );
}

export function useI18nLocale(): I18nLocaleContextValue {
  const ctx = useContext(I18nLocaleContext);
  if (!ctx) throw new Error('useI18nLocale must be used inside AppI18nProvider');
  return ctx;
}

export function useTranslation(namespaces?: string | readonly string[], options?: Record<string, unknown>): any {
  const result = useReactTranslation(namespaces as any, options as any);
  const localeContext = useContext(I18nLocaleContext);
  const locale = localeContext?.locale ?? normalizeLocale(result.i18n.language) ?? FALLBACK_LOCALE;

  const t = useCallback(
    (key: string, translationOptions?: Record<string, unknown>) => {
      const translated = result.t(key as any, translationOptions as any);
      if (!isMissingTranslation(key, translated)) return translated;
      return translateBundledKey(key, namespaces, locale, translationOptions) ?? translated;
    },
    [locale, namespaces, result],
  );

  return { ...result, t };
}

export interface LanguageSelectorProps {
  size?: SelectProps['size'];
  variant?: SelectProps['variant'];
  style?: React.CSSProperties;
  onLocaleChange?: (locale: SupportedLocale) => Promise<void> | void;
}

export function LanguageSelector({
  size = 'small',
  variant,
  style,
  onLocaleChange,
}: LanguageSelectorProps) {
  const { locale, setLocale } = useI18nLocale();
  const selectorLabel = locale === 'es-HN' ? 'Idioma' : 'Language';

  return (
    <Select<SupportedLocale>
      aria-label={selectorLabel}
      size={size}
      variant={variant}
      value={locale}
      style={{ minWidth: 124, ...style }}
      options={[
        { value: 'en-US', label: LOCALE_LABELS['en-US'] },
        { value: 'es-HN', label: LOCALE_LABELS['es-HN'] },
      ]}
      onChange={async (nextLocale) => {
        await setLocale(nextLocale);
        await onLocaleChange?.(nextLocale);
      }}
    />
  );
}

export async function initGlobalI18nForTests(
  app: FrontendApp,
  initialLocale: SupportedLocale = FALLBACK_LOCALE,
): Promise<void> {
  const namespaces = namespacesForApp(app);
  const resources = bundledResourcesForApp(app);
  if (i18next.isInitialized) {
    for (const locale of ['en-US', 'es-HN'] as const) {
      for (const namespace of namespaces) {
        const bundle = resources[locale][namespace];
        if (bundle) i18next.addResourceBundle(locale, namespace, bundle, true, true);
      }
    }
    await i18next.loadNamespaces(namespaces);
    await i18next.changeLanguage(initialLocale);
    return;
  }

  await i18next
    .use(initReactI18next)
    .init({
      lng: initialLocale,
      fallbackLng: FALLBACK_LOCALE,
      supportedLngs: ['en-US', 'es-HN'],
      nonExplicitSupportedLngs: true,
      ns: namespaces,
      defaultNS: 'common',
      fallbackNS: 'common',
      resources,
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });
}

function createI18nInstance(app: FrontendApp, initialLocale: SupportedLocale): {
  instance: I18nInstance;
  initPromise: Promise<unknown>;
} {
  const instance = i18next.createInstance();
  const namespaces = namespacesForApp(app);
  const initPromise = instance
    .use(createResourceBackend())
    .use(initReactI18next)
    .init({
      lng: initialLocale,
      fallbackLng: FALLBACK_LOCALE,
      supportedLngs: ['en-US', 'es-HN'],
      nonExplicitSupportedLngs: true,
      ns: namespaces,
      defaultNS: 'common',
      fallbackNS: 'common',
      resources: bundledResourcesForApp(app),
      partialBundledLanguages: true,
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: true,
      },
    });
  return { instance, initPromise };
}

export { LANGUAGE_STORAGE_KEY };

function isMissingTranslation(key: string, translated: unknown): boolean {
  if (typeof translated !== 'string') return false;
  const keyWithoutNamespace = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
  return (
    translated === key ||
    translated === keyWithoutNamespace ||
    translated.startsWith(`${keyWithoutNamespace}_`) ||
    translated.startsWith(`${keyWithoutNamespace}.`) ||
    translated.startsWith(`${keyWithoutNamespace} `)
  );
}
