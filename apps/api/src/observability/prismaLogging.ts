import { logger } from './logger';
import { getRequestContext } from './requestContext';

interface QueryEvent {
  query: string;
  params: string;
  duration: number;
  target?: string;
}

interface PrismaClientWithQueryEvents {
  $on(event: 'query', callback: (event: QueryEvent) => void): void;
}

const registeredClients = new WeakSet<object>();

function slowQueryThresholdMs(): number {
  const raw = Number(process.env.PRISMA_SLOW_QUERY_MS ?? 250);
  return Number.isFinite(raw) && raw >= 0 ? raw : 250;
}

function shouldLogParams(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.PRISMA_LOG_QUERY_PARAMS === '1';
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export function sanitizeSqlForLog(sql: string): string {
  return truncate(sql.replace(/'(?:''|[^'])*'/g, "'?'").replace(/\s+/g, ' ').trim(), 2_000);
}

function queryParamsForLog(params: string): string | undefined {
  if (!shouldLogParams()) return undefined;
  return truncate(params, 2_000);
}

export function withPrismaSlowQueryLogOption<T extends Record<string, unknown>>(options: T): T & { log: unknown[] } {
  const log = Array.isArray(options.log) ? [...options.log] : [];
  const hasQueryEvent = log.some((entry) => {
    return (
      typeof entry === 'object' &&
      entry != null &&
      (entry as { level?: unknown; emit?: unknown }).level === 'query' &&
      (entry as { level?: unknown; emit?: unknown }).emit === 'event'
    );
  });

  return {
    ...options,
    log: hasQueryEvent ? log : [...log, { emit: 'event', level: 'query' }],
  };
}

export function registerPrismaSlowQueryLogging(client: PrismaClientWithQueryEvents): void {
  const clientObject = client as unknown as object;
  if (registeredClients.has(clientObject)) return;
  registeredClients.add(clientObject);

  client.$on('query', (event) => {
    const thresholdMs = slowQueryThresholdMs();
    if (event.duration < thresholdMs) return;

    const context = getRequestContext();
    logger.warn(
      {
        event: 'prisma.slow_query',
        durationMs: event.duration,
        thresholdMs,
        target: event.target,
        query: sanitizeSqlForLog(event.query),
        params: queryParamsForLog(event.params),
        requestId: context?.requestId,
        traceId: context?.traceId,
      },
      'slow prisma query',
    );
  });
}
