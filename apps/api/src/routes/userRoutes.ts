import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { createUser, updateUser, deleteUser } from '../services/employees/userService';
import { requirePermission } from '../middleware/authMiddleware';
import { PERMISSIONS } from '../services/employees/permissions';

function sanitize(u: any) {
  const { passwordHash, ...rest } = u;
  return rest;
}

export function createUserRoutes(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/', requirePermission(PERMISSIONS.EMPLOYEES_VIEW), async (_req, res, next) => {
    try {
      const users = await prisma.user.findMany({
        include: { role: true },
        orderBy: { createdAt: 'asc' },
      });
      res.json({ users: users.map(sanitize) });
    } catch (err) {
      next(err);
    }
  });

  // Roles list — needed by the frontend create/edit forms.
  // Defined before /:id so the regex doesn't capture "_meta".
  router.get('/_meta/roles', requirePermission(PERMISSIONS.EMPLOYEES_VIEW), async (_req, res, next) => {
    try {
      const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
      res.json({ roles });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', requirePermission(PERMISSIONS.EMPLOYEES_VIEW), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const user = await prisma.user.findUnique({
        where: { id },
        include: { role: true },
      });
      if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      res.json({ user: sanitize(user) });
    } catch (err) {
      next(err);
    }
  });

  const createBody = z.object({
    email: z.string().email(),
    displayName: z.string().min(1),
    password: z.string().min(8),
    roleId: z.string().uuid(),
    ricsUserId: z.string().optional().nullable(),
    salespersonCode: z.string().optional().nullable(),
    active: z.boolean().optional(),
  });

  router.post('/', requirePermission(PERMISSIONS.EMPLOYEES_MANAGE), async (req, res, next) => {
    try {
      const parsed = createBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }
      const user = await createUser(prisma, parsed.data);
      const withRole = await prisma.user.findUnique({
        where: { id: user.id },
        include: { role: true },
      });
      res.status(201).json({ user: sanitize(withRole) });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Email already in use' } });
      }
      next(err);
    }
  });

  const patchBody = z.object({
    email: z.string().email().optional(),
    displayName: z.string().min(1).optional(),
    roleId: z.string().uuid().optional(),
    active: z.boolean().optional(),
    ricsUserId: z.string().nullable().optional(),
    salespersonCode: z.string().nullable().optional(),
  });

  router.patch('/:id', requirePermission(PERMISSIONS.EMPLOYEES_MANAGE), async (req, res, next) => {
    try {
      const parsed = patchBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }
      const id = String(req.params.id);
      await updateUser(prisma, id, parsed.data);
      const withRole = await prisma.user.findUnique({
        where: { id },
        include: { role: true },
      });
      res.json({ user: sanitize(withRole) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requirePermission(PERMISSIONS.EMPLOYEES_MANAGE), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      if (req.user?.id === id) {
        return res.status(400).json({ error: { code: 'CANNOT_DELETE_SELF' } });
      }
      await deleteUser(prisma, id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
