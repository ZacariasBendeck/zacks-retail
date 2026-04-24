import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '../prismaClient';
import { authenticate, changePassword } from '../services/employees/userService';
import { createSession, revokeSession } from '../services/employees/sessionService';
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
      const user = await authenticate(prisma, parsed.data.email, parsed.data.password);
      if (!user) {
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
        return res.status(400).json({
          error: { code: 'WRONG_PASSWORD', message: 'Old password does not match' },
        });
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}


