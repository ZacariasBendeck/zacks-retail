import { Router } from 'express';
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
        path: '/',
      });
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
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: { id: role!.id, name: role!.name },
        },
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
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAuth, async (req, res) => {
    const user = req.user!;
    const role = await prisma.role.findUnique({ where: { id: user.roleId } });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: { id: role!.id, name: role!.name },
      },
      permissions: Array.from(req.permissions ?? []),
    });
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


