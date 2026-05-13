import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '../prismaClient';
import { requirePermission } from '../middleware/authMiddleware';
import { PERMISSIONS } from '../services/identityAccess/permissions';
import {
  getPlatformAuditOptions,
  getPlatformAuditEvent,
  listPlatformAuditEvents,
} from '../services/platformAuditService';

const auditQuery = z.object({
  actorUserId: z.string().uuid().optional(),
  eventType: z.string().trim().min(1).optional(),
  outcome: z.enum(['SUCCESS', 'FAILURE']).optional(),
  resourceType: z.string().trim().min(1).optional(),
  resourceId: z.string().trim().min(1).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

export function createPlatformAuditRoutes(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/_meta/options', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (_req, res, next) => {
    try {
      const options = await getPlatformAuditOptions(prisma);
      res.json({ options });
    } catch (err) {
      next(err);
    }
  });

  router.get('/', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const parsed = auditQuery.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_QUERY', message: parsed.error.message } });
      }
      const events = await listPlatformAuditEvents(prisma, parsed.data);
      res.json({ events });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const event = await getPlatformAuditEvent(prisma, id);
      if (!event) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      res.json({ event });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
