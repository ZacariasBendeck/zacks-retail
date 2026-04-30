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

export function attachUser(prisma: PrismaClient) {
  return async function (req: Request, _res: Response, next: NextFunction) {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (!sid) return next();
    const session = await findActiveSession(prisma, sid);
    if (!session) return next();
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });
    if (!user || !user.active) return next();
    req.user = user;
    req.sessionId = session.id;
    req.permissions = await getEffectivePermissions(prisma, user.id);
    next();
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


