import { PrismaClient, User } from '../prismaClient';
import { NextFunction, Request, Response } from 'express';
import { findActiveSession } from '../services/identityAccess/sessionService';
import type { Permission } from '../services/identityAccess/permissions';
import { getEffectivePermissions } from '../services/identityAccess/effectiveAccessService';

// Extend Express Request with auth state via the global Express namespace.
declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
      permissions?: Set<string>;
    }
  }
}

export const SESSION_COOKIE = 'sid';

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractSessionCookieCandidates(req: Request): string[] {
  const candidates: string[] = [];
  const rawCookieHeader = req.get('cookie');

  if (rawCookieHeader) {
    for (const part of rawCookieHeader.split(';')) {
      const separator = part.indexOf('=');
      if (separator <= 0) continue;

      const name = part.slice(0, separator).trim();
      if (name !== SESSION_COOKIE) continue;

      const value = decodeCookieValue(part.slice(separator + 1).trim());
      if (value) candidates.push(value);
    }
  }

  const parsedCookie = req.cookies?.[SESSION_COOKIE];
  if (typeof parsedCookie === 'string') {
    candidates.push(parsedCookie);
  } else if (Array.isArray(parsedCookie)) {
    candidates.push(...parsedCookie.filter((value): value is string => typeof value === 'string'));
  }

  return Array.from(new Set(candidates)).filter((value) => SESSION_ID_PATTERN.test(value));
}

export function attachUser(prisma: PrismaClient) {
  return async function (req: Request, _res: Response, next: NextFunction) {
    try {
      const sessionIds = extractSessionCookieCandidates(req);
      if (sessionIds.length === 0) return next();

      for (const sessionId of sessionIds) {
        const session = await findActiveSession(prisma, sessionId);
        if (!session) continue;

        const user = await prisma.user.findUnique({
          where: { id: session.userId },
          include: { role: true },
        });
        if (!user || !user.active) continue;

        req.user = user;
        req.sessionId = session.id;
        req.permissions = await getEffectivePermissions(prisma, user.id);
        return next();
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
  }
  next();
}

export function requirePermission(permission: Permission) {
  return function (req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
    }
    if (!req.permissions?.has(permission)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: `Missing permission: ${permission}` },
      });
    }
    next();
  };
}


