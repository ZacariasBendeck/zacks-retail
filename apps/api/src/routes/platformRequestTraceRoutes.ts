import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../prismaClient';
import { requirePermission } from '../middleware/authMiddleware';
import { PERMISSIONS } from '../services/identityAccess/permissions';
import {
  getPlatformRequestTrace,
  listPlatformRequestTraces,
} from '../services/platformRequestTraceService';

const requestTraceQuery = z.object({
  traceId: z.string().trim().min(1).optional(),
  requestId: z.string().trim().min(1).optional(),
  method: z.string().trim().min(1).optional(),
  route: z.string().trim().min(1).optional(),
  statusMin: z.coerce.number().int().min(100).max(599).optional(),
  minDurationMs: z.coerce.number().int().min(0).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export function createPlatformRequestTraceRoutes(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const parsed = requestTraceQuery.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_QUERY', message: parsed.error.message } });
      }
      const traces = await listPlatformRequestTraces(prisma, parsed.data);
      res.json({ traces });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const trace = await getPlatformRequestTrace(prisma, String(req.params.id));
      if (!trace) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      res.json({ trace });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
