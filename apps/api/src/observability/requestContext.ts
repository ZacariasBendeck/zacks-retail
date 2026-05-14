import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Request } from 'express';
import { redactForLog } from './logger';

export interface RequestTimingStep {
  name: string;
  ms: number;
  metadata?: unknown;
  error?: string;
}

export interface RequestContext {
  requestId: string;
  traceId: string;
  startedAt: number;
  startedAtIso: string;
  method: string;
  originalUrl: string;
  actorUserId?: string | null;
  sessionId?: string | null;
  timings: RequestTimingStep[];
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();
const TRACEPARENT_PATTERN = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}(?:-.+)?$/i;
const TRACE_ID_PATTERN = /^[\da-f]{32}$/i;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;

function nonZeroHex(value: string): boolean {
  return !/^0+$/.test(value);
}

function firstHeaderValue(value: unknown): string | null {
  if (Array.isArray(value)) return firstHeaderValue(value[0]);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function parseTraceparent(value: unknown): string | null {
  const raw = firstHeaderValue(value);
  if (!raw) return null;
  const match = raw.match(TRACEPARENT_PATTERN);
  if (!match) return null;
  const traceId = match[1].toLowerCase();
  return nonZeroHex(traceId) ? traceId : null;
}

export function normalizeTraceId(value: unknown): string | null {
  const raw = firstHeaderValue(value);
  if (!raw || !TRACE_ID_PATTERN.test(raw)) return null;
  const traceId = raw.toLowerCase();
  return nonZeroHex(traceId) ? traceId : null;
}

export function normalizeRequestId(value: unknown): string | null {
  const raw = firstHeaderValue(value);
  if (!raw || !SAFE_REQUEST_ID_PATTERN.test(raw)) return null;
  return raw;
}

export function generateTraceId(): string {
  return randomBytes(16).toString('hex');
}

export function createRequestContext(req: Request): RequestContext {
  const traceId =
    parseTraceparent(req.get('traceparent')) ??
    normalizeTraceId(req.get('x-trace-id')) ??
    generateTraceId();
  const requestId =
    normalizeRequestId(req.get('x-request-id')) ??
    normalizeRequestId(req.get('x-correlation-id')) ??
    randomUUID();

  return {
    requestId,
    traceId,
    startedAt: performance.now(),
    startedAtIso: new Date().toISOString(),
    method: req.method,
    originalUrl: req.originalUrl || req.url,
    timings: [],
  };
}

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function getTraceId(): string | null {
  return getRequestContext()?.traceId ?? null;
}

export function getRequestId(): string | null {
  return getRequestContext()?.requestId ?? null;
}

export function setRequestActor(input: {
  actorUserId?: string | null;
  sessionId?: string | null;
}): void {
  const context = getRequestContext();
  if (!context) return;
  context.actorUserId = input.actorUserId ?? null;
  context.sessionId = input.sessionId ?? null;
}

function roundedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function safeStepError(err: unknown): string {
  if (err instanceof Error) return err.name || 'Error';
  return typeof err === 'string' ? 'Error' : typeof err;
}

export function addTimingStep(step: RequestTimingStep): void {
  const context = getRequestContext();
  if (!context) return;
  context.timings.push({
    ...step,
    metadata: step.metadata === undefined ? undefined : redactForLog(step.metadata),
  });
}

export async function traceStep<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: unknown,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await fn();
    addTimingStep({ name, ms: roundedMs(startedAt), metadata });
    return result;
  } catch (err) {
    addTimingStep({
      name,
      ms: roundedMs(startedAt),
      metadata,
      error: safeStepError(err),
    });
    throw err;
  }
}

export function requestDurationMs(context: RequestContext): number {
  return Math.max(0, Math.round(performance.now() - context.startedAt));
}
