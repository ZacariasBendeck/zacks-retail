import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(currentDir, '..');
const localeRoot = path.join(packageRoot, 'src', 'locales');
const sourceLocale = 'en-US';
const targetLocales = ['es-HN'];

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return [prefix];
  return entries.flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

let failed = false;
const namespaces = fs
  .readdirSync(path.join(localeRoot, sourceLocale))
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''));

for (const namespace of namespaces) {
  const sourceKeys = new Set(flattenKeys(readJson(path.join(localeRoot, sourceLocale, `${namespace}.json`))));
  for (const locale of targetLocales) {
    const targetPath = path.join(localeRoot, locale, `${namespace}.json`);
    if (!fs.existsSync(targetPath)) {
      console.error(`${locale}/${namespace}.json is missing`);
      failed = true;
      continue;
    }
    const targetKeys = new Set(flattenKeys(readJson(targetPath)));
    const missing = [...sourceKeys].filter((key) => !targetKeys.has(key));
    const extra = [...targetKeys].filter((key) => !sourceKeys.has(key));
    if (missing.length || extra.length) {
      failed = true;
      console.error(`${locale}/${namespace}.json key mismatch`);
      if (missing.length) console.error(`  Missing: ${missing.join(', ')}`);
      if (extra.length) console.error(`  Extra: ${extra.join(', ')}`);
    }
  }
}

if (failed) process.exit(1);
console.log('i18n locale keys are in parity.');
