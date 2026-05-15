import { Response, Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '../prismaClient';
import { authenticate, changePassword } from '../services/identityAccess/userService';
import { createSession, revokeOtherUserSessions, revokeSession } from '../services/identityAccess/sessionService';
import {
  countRecentFailedLoginEvents,
  recordIdentityAudit,
  recordLoginEvent,
  recordSessionEvent,
} from '../services/identityAccess/securityAuditService';
import { requireAuth, SESSION_COOKIE } from '../middleware/authMiddleware';

const ROOT_SESSION_COOKIE_PATH = '/';
const LEGACY_SESSION_COOKIE_PATHS = ['/api/v1/auth', '/api/v1', '/api'];
const SUPPORTED_LOCALES = ['en-US', 'es-HN'] as const;

function userPayload(user: {
  id: string;
  email: string;
  displayName: string;
  preferredLocale?: string | null;
}, role: { id: string; name: string }) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    preferredLocale: user.preferredLocale ?? null,
    role: { id: role.id, name: role.name },
  };
}

function clearSessionCookies(res: Response, paths: string[]): void {
  for (const path of paths) {
    res.clearCookie(SESSION_COOKIE, {
      path,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
}

export function createAuthRoutes(prisma: PrismaClient): Router {
  const router = Router();

  const loginBody = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  router.post('/login', async (req, res, next) => {
    try {
      const parsed = loginBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }
      const recentFailures = await countRecentFailedLoginEvents(prisma, {
        email: parsed.data.email,
        windowMinutes: 15,
      });
      if (recentFailures >= 5) {
        await recordLoginEvent(prisma, {
          email: parsed.data.email,
          outcome: 'FAILURE',
          reason: 'THROTTLED',
          req,
        });
        return res.status(429).json({
          error: { code: 'LOGIN_THROTTLED', message: 'Too many failed login attempts. Try again later.' },
        });
      }
      const user = await authenticate(prisma, parsed.data.email, parsed.data.password);
      if (!user) {
        await recordLoginEvent(prisma, {
          email: parsed.data.email,
          outcome: 'FAILURE',
          reason: 'INVALID_CREDENTIALS',
          req,
        });
        return res.status(401).json({
          error: { code: 'INVALID_CREDENTIALS', message: 'Email or password incorrect' },
        });
      }
      const session = await createSession(prisma, user.id);
      res.cookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        expires: session.expiresAt,
        path: ROOT_SESSION_COOKIE_PATH,
      });
      clearSessionCookies(res, LEGACY_SESSION_COOKIE_PATHS);
      const role = await prisma.role.findUnique({ where: { id: user.roleId } });
      await recordLoginEvent(prisma, {
        email: user.email,
        userId: user.id,
        roleId: user.roleId,
        outcome: 'SUCCESS',
        req,
      });
      await recordSessionEvent(prisma, {
        sessionId: session.id,
        userId: user.id,
        eventType: 'LOGIN',
        req,
      });
      res.json({
        user: userPayload(user, role!),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      if (req.sessionId) {
        await revokeSession(prisma, req.sessionId);
        await recordSessionEvent(prisma, {
          sessionId: req.sessionId,
          userId: req.user?.id,
          eventType: 'LOGOUT',
          req,
        });
        await recordIdentityAudit(prisma, {
          actorUserId: req.user?.id,
          actorSessionId: req.sessionId,
          eventType: 'identity.session.logout',
          action: 'LOGOUT',
          resourceType: 'identity.session',
          resourceId: req.sessionId,
          req,
        });
      }
      clearSessionCookies(res, [ROOT_SESSION_COOKIE_PATH, ...LEGACY_SESSION_COOKIE_PATHS]);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAuth, async (req, res) => {
    const user = req.user!;
    const role = await prisma.role.findUnique({ where: { id: user.roleId } });
    res.json({
      user: userPayload(user, role!),
      permissions: Array.from(req.permissions ?? []),
    });
  });

  const preferencesBody = z.object({
    preferredLocale: z.enum(SUPPORTED_LOCALES).nullable(),
  });

  router.patch('/me/preferences', requireAuth, async (req, res, next) => {
    try {
      const parsed = preferencesBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }
      const before = req.user!;
      const updated = await prisma.user.update({
        where: { id: before.id },
        data: { preferredLocale: parsed.data.preferredLocale },
      });
      const role = await prisma.role.findUnique({ where: { id: updated.roleId } });
      await recordIdentityAudit(prisma, {
        actorUserId: req.user!.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.user_preferences.updated',
        action: 'UPDATE_USER_PREFERENCES',
        resourceType: 'identity.user',
        resourceId: req.user!.id,
        beforeJson: { preferredLocale: before.preferredLocale ?? null },
        afterJson: { preferredLocale: updated.preferredLocale ?? null },
        req,
      });
      res.json({ user: userPayload(updated, role!) });
    } catch (err) {
      next(err);
    }
  });

  const changePasswordBody = z.object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(8),
  });

  router.post('/change-password', requireAuth, async (req, res, next) => {
    try {
      const parsed = changePasswordBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }
      const result = await changePassword(
        prisma,
        req.user!.id,
        parsed.data.oldPassword,
        parsed.data.newPassword,
      );
      if (!result.ok) {
        await recordIdentityAudit(prisma, {
          actorUserId: req.user!.id,
          actorSessionId: req.sessionId,
          eventType: 'identity.password_change.failure',
          action: 'CHANGE_PASSWORD',
          resourceType: 'identity.user',
          resourceId: req.user!.id,
          outcome: 'FAILURE',
          reason: 'WRONG_PASSWORD',
          req,
        });
        return res.status(400).json({
          error: { code: 'WRONG_PASSWORD', message: 'Old password does not match' },
        });
      }
      const revokedCount = await revokeOtherUserSessions(prisma, req.user!.id, req.sessionId);
      if (revokedCount > 0) {
        await recordSessionEvent(prisma, {
          sessionId: req.sessionId,
          userId: req.user!.id,
          eventType: 'PASSWORD_CHANGE_REVOKE_OTHERS',
          reason: `revoked ${revokedCount} other session${revokedCount === 1 ? '' : 's'}`,
          req,
        });
      }
      await recordIdentityAudit(prisma, {
        actorUserId: req.user!.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.password_change.success',
        action: 'CHANGE_PASSWORD',
        resourceType: 'identity.user',
        resourceId: req.user!.id,
        metadataJson: { otherSessionsRevoked: revokedCount },
        req,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}


