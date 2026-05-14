import pino from 'pino';

export const SENSITIVE_LOG_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'passwd',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'api_key',
  'x-api-key',
] as const;

export const PINO_REDACTION_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'request.headers.authorization',
  'request.headers.cookie',
  'request.headers["set-cookie"]',
  'request.headers["x-api-key"]',
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',
  'headers["x-api-key"]',
  '*.password',
  '*.passwd',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.apiKey',
  '*.api_key',
];

const VALID_LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

function logLevel(): string {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw && VALID_LEVELS.has(raw)) return raw;
  return process.env.NODE_ENV === 'test' ? 'silent' : 'info';
}

function isSensitiveLogKey(key: string): boolean {
  const normalized = key.replace(/[_-]/g, '').toLowerCase();
  return SENSITIVE_LOG_KEYS.some((sensitive) => {
    const sensitiveNormalized = sensitive.replace(/[_-]/g, '').toLowerCase();
    return normalized === sensitiveNormalized || normalized.endsWith(sensitiveNormalized);
  });
}

export function redactForLog(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= 6) return '[MaxDepth]';
  if (Array.isArray(value)) return value.map((item) => redactForLog(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveLogKey(key) ? '[redacted]' : redactForLog(child, depth + 1);
  }
  return out;
}

export const logger = pino({
  level: logLevel(),
  base: {
    service: 'zacks-retail-api',
  },
  redact: {
    paths: PINO_REDACTION_PATHS,
    censor: '[redacted]',
  },
});
