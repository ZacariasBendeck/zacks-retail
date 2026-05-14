import type { NextFunction, Request, Response } from 'express';
import pinoHttp from 'pino-http';
import type { PrismaClient } from '../prismaClient';
import { logger } from './logger';
import {
  createRequestContext,
  getRequestContext,
  requestDurationMs,
  runWithRequestContext,
  setRequestActor,
  type RequestContext,
} from './requestContext';
import { recordPlatformRequestTrace } from '../services/platformRequestTraceService';

function boolEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export function requestSlowThresholdMs(): number {
  const raw = Number(process.env.REQUEST_SLOW_MS ?? 1_000);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1_000;
}

function routeLabel(req: Request): string | null {
  const routePath = req.route?.path;
  const path = typeof routePath === 'string' ? routePath : null;
  if (path) return `${req.baseUrl ?? ''}${path}`;
  return req.baseUrl || null;
}

function responseError(res: Response): { code: string | null; message: string | null } {
  const raw = res.locals.requestError;
  if (!raw || typeof raw !== 'object') return { code: null, message: null };
  const record = raw as { code?: unknown; message?: unknown };
  return {
    code: typeof record.code === 'string' ? record.code : null,
    message: typeof record.message === 'string' ? record.message : null,
  };
}

function shouldPersistTrace(context: RequestContext, res: Response, durationMs: number): boolean {
  return boolEnv('REQUEST_TRACE_PERSIST_ALL') || res.statusCode >= 500 || durationMs >= requestSlowThresholdMs();
}

async function persistRequestTrace(
  prisma: PrismaClient,
  req: Request,
  res: Response,
  context: RequestContext,
): Promise<void> {
  const durationMs = requestDurationMs(context);
  if (!shouldPersistTrace(context, res, durationMs)) return;

  const error = responseError(res);
  await recordPlatformRequestTrace(prisma, {
    traceId: context.traceId,
    requestId: context.requestId,
    method: req.method,
    route: routeLabel(req),
    originalUrl: req.originalUrl || req.url,
    statusCode: res.statusCode,
    durationMs,
    actorUserId: context.actorUserId ?? null,
    actorSessionId: context.sessionId ?? null,
    errorCode: error.code,
    errorMessage: error.message,
    timingSteps: context.timings,
    metadataJson: {
      slowThresholdMs: requestSlowThresholdMs(),
    },
  });
}

const httpLogger = pinoHttp({
  logger,
  quietReqLogger: true,
  genReqId: (_req: Request, res: Response): string => {
    const context = res.locals.requestContext as RequestContext | undefined;
    return context?.requestId ?? getRequestContext()?.requestId ?? 'unknown';
  },
  customLogLevel: (_req: Request, res: Response, err?: Error) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: () => 'request completed',
  customErrorMessage: () => 'request failed',
  customSuccessObject: (req: Request, res: Response, value: Record<string, unknown>) => {
    const context = res.locals.requestContext as RequestContext | undefined;
    const durationMs = context ? requestDurationMs(context) : undefined;
    return {
      ...value,
      event: 'http.request.completed',
      requestId: context?.requestId,
      traceId: context?.traceId,
      actorUserId: context?.actorUserId ?? undefined,
      sessionId: context?.sessionId ?? undefined,
      route: routeLabel(req),
      slow: durationMs != null ? durationMs >= requestSlowThresholdMs() : undefined,
    };
  },
  customErrorObject: (req: Request, res: Response, err: Error, value: Record<string, unknown>) => {
    const context = res.locals.requestContext as RequestContext | undefined;
    return {
      ...value,
      event: 'http.request.failed',
      requestId: context?.requestId,
      traceId: context?.traceId,
      actorUserId: context?.actorUserId ?? undefined,
      sessionId: context?.sessionId ?? undefined,
      route: routeLabel(req),
      err,
    };
  },
} as any);

export function requestLoggingMiddleware(prisma: PrismaClient) {
  return function requestLogging(req: Request, res: Response, next: NextFunction): void {
    const context = createRequestContext(req);
    res.locals.requestContext = context;
    res.setHeader('X-Request-Id', context.requestId);
    res.setHeader('X-Trace-Id', context.traceId);

    runWithRequestContext(context, () => {
      res.on('finish', () => {
        void persistRequestTrace(prisma, req, res, context);
      });
      httpLogger(req, res);
      next();
    });
  };
}

export function enrichRequestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  setRequestActor({
    actorUserId: req.user?.id ?? null,
    sessionId: req.sessionId ?? null,
  });
  next();
}
