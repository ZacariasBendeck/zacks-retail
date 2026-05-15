import resourcesToBackend from 'i18next-resources-to-backend';
import type { SupportedLocale } from './locales';
import { FALLBACK_LOCALE, normalizeLocale } from './locales';
import enCommon from './locales/en-US/common.json';
import enAuth from './locales/en-US/auth.json';
import enShell from './locales/en-US/shell.json';
import enInquiry from './locales/en-US/inquiry.json';
import enPos from './locales/en-US/pos.json';
import enStorefront from './locales/en-US/storefront.json';
import esCommon from './locales/es-HN/common.json';
import esAuth from './locales/es-HN/auth.json';
import esShell from './locales/es-HN/shell.json';
import esInquiry from './locales/es-HN/inquiry.json';
import esPos from './locales/es-HN/pos.json';
import esStorefront from './locales/es-HN/storefront.json';

export const APP_NAMESPACES = {
  web: ['common', 'auth', 'shell', 'inquiry'],
  pos: ['common', 'pos'],
  storefront: ['common', 'storefront'],
} as const;

export type FrontendApp = keyof typeof APP_NAMESPACES;
export type AppNamespace = (typeof APP_NAMESPACES)[FrontendApp][number];

type ResourceModule = { default: Record<string, unknown> };
type ResourceLoader = () => Promise<ResourceModule>;

const resourceLoaders: Record<SupportedLocale, Record<AppNamespace, ResourceLoader>> = {
  'en-US': {
    common: () => import('./locales/en-US/common.json'),
    auth: () => import('./locales/en-US/auth.json'),
    shell: () => import('./locales/en-US/shell.json'),
    inquiry: () => import('./locales/en-US/inquiry.json'),
    pos: () => import('./locales/en-US/pos.json'),
    storefront: () => import('./locales/en-US/storefront.json'),
  },
  'es-HN': {
    common: () => import('./locales/es-HN/common.json'),
    auth: () => import('./locales/es-HN/auth.json'),
    shell: () => import('./locales/es-HN/shell.json'),
    inquiry: () => import('./locales/es-HN/inquiry.json'),
    pos: () => import('./locales/es-HN/pos.json'),
    storefront: () => import('./locales/es-HN/storefront.json'),
  },
};

const bundledResources: Record<SupportedLocale, Record<AppNamespace, Record<string, unknown>>> = {
  'en-US': {
    common: enCommon,
    auth: enAuth,
    shell: enShell,
    inquiry: enInquiry,
    pos: enPos,
    storefront: enStorefront,
  },
  'es-HN': {
    common: esCommon,
    auth: esAuth,
    shell: esShell,
    inquiry: esInquiry,
    pos: esPos,
    storefront: esStorefront,
  },
};

export function namespacesForApp(app: FrontendApp): readonly AppNamespace[] {
  return APP_NAMESPACES[app];
}

export function bundledResourcesForApp(app: FrontendApp): Record<SupportedLocale, Partial<Record<AppNamespace, Record<string, unknown>>>> {
  const namespaces = namespacesForApp(app);
  return {
    'en-US': Object.fromEntries(namespaces.map((namespace) => [namespace, bundledResources['en-US'][namespace]])),
    'es-HN': Object.fromEntries(namespaces.map((namespace) => [namespace, bundledResources['es-HN'][namespace]])),
  } as Record<SupportedLocale, Partial<Record<AppNamespace, Record<string, unknown>>>>;
}

export function createResourceBackend() {
  return resourcesToBackend(async (language: string, namespace: string) => {
    const locale = normalizeLocale(language) ?? FALLBACK_LOCALE;
    const key = namespace as AppNamespace;
    const loader = resourceLoaders[locale][key] ?? resourceLoaders[FALLBACK_LOCALE][key];
    if (!loader) {
      throw new Error(`Missing translation namespace: ${locale}/${namespace}`);
    }
    const module = await loader();
    return module.default;
  });
}

export function translateBundledKey(
  key: string,
  namespaces: string | readonly string[] | undefined,
  locale: SupportedLocale,
  options: Record<string, unknown> = {},
): string | null {
  const normalizedLocale = normalizeLocale(locale) ?? FALLBACK_LOCALE;
  const namespaceCandidates = resolveNamespaceCandidates(key, namespaces);
  const keyPath = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;

  for (const namespace of namespaceCandidates) {
    const bundle = bundledResources[normalizedLocale][namespace as AppNamespace]
      ?? bundledResources[FALLBACK_LOCALE][namespace as AppNamespace];
    const value = resolveBundledValue(bundle, keyPath, options);
    if (typeof value === 'string') return interpolate(value, options);
  }

  return null;
}

export function formatInteger(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function formatDecimal(value: number, locale: SupportedLocale, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

export function formatHnl(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'HNL',
    currencyDisplay: 'narrowSymbol',
  }).format(value);
}

function resolveNamespaceCandidates(
  key: string,
  namespaces: string | readonly string[] | undefined,
): string[] {
  if (key.includes(':')) return [key.slice(0, key.indexOf(':'))];
  if (Array.isArray(namespaces)) return [...namespaces, 'common'];
  if (typeof namespaces === 'string') return [namespaces, 'common'];
  return ['common'];
}

function resolveBundledValue(
  bundle: Record<string, unknown> | undefined,
  keyPath: string,
  options: Record<string, unknown>,
): unknown {
  if (!bundle) return undefined;
  const count = typeof options.count === 'number' ? options.count : undefined;
  if (count != null) {
    const pluralKey = `${keyPath}_${count === 1 ? 'one' : 'other'}`;
    const pluralValue = readPath(bundle, pluralKey);
    if (typeof pluralValue === 'string') return pluralValue;
  }
  return readPath(bundle, keyPath);
}

function readPath(bundle: Record<string, unknown>, keyPath: string): unknown {
  return keyPath
    .split('.')
    .reduce<unknown>((current, segment) => (
      current && typeof current === 'object'
        ? (current as Record<string, unknown>)[segment]
        : undefined
    ), bundle);
}

function interpolate(template: string, options: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => {
    const value = options[name];
    return value == null ? '' : String(value);
  });
}
