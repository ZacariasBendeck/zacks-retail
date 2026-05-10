import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../prismaClient';
import { requirePermission } from '../middleware/authMiddleware';
import { PERMISSIONS } from '../services/identityAccess/permissions';
import {
  activityReviewEventsCsv,
  getActivityReviewEvent,
  getActivityReviewSummary,
  listActivityReviewEvents,
  updateActivityReviewEventReview,
} from '../services/activityReviewService';

const activityReviewQuery = z.object({
  actorUserId: z.string().uuid().optional(),
  module: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  resourceType: z.string().trim().min(1).optional(),
  storeId: z.string().trim().min(1).optional(),
  outcome: z.enum(['SUCCESS', 'FAILURE']).optional(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  reviewStatus: z.enum(['UNREVIEWED', 'REVIEWED', 'FLAGGED', 'NO_ISSUE']).optional(),
  search: z.string().trim().optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const reviewBody = z.object({
  status: z.enum(['REVIEWED', 'FLAGGED', 'NO_ISSUE']),
  reviewNote: z.string().trim().max(2000).optional().nullable(),
});

export function createActivityReviewRoutes(prisma: PrismaClient): Router {
  const router = Router();
  router.use(requirePermission(PERMISSIONS.ACTIVITY_REVIEW_VIEW));

  router.get('/summary', async (req, res, next) => {
    try {
      const parsed = activityReviewQuery.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_QUERY', message: parsed.error.message } });
      }
      const summary = await getActivityReviewSummary(prisma, parsed.data);
      res.json({ summary });
    } catch (err) {
      next(err);
    }
  });

  router.get('/events.csv', async (req, res, next) => {
    try {
      const parsed = activityReviewQuery.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_QUERY', message: parsed.error.message } });
      }
      const events = await listActivityReviewEvents(prisma, parsed.data);
      res.type('text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="activity-review-events.csv"');
      res.send(activityReviewEventsCsv(events));
    } catch (err) {
      next(err);
    }
  });

  router.get('/events', async (req, res, next) => {
    try {
      const parsed = activityReviewQuery.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_QUERY', message: parsed.error.message } });
      }
      const events = await listActivityReviewEvents(prisma, parsed.data);
      res.json({ events });
    } catch (err) {
      next(err);
    }
  });

  router.get('/events/:id', async (req, res, next) => {
    try {
      const event = await getActivityReviewEvent(prisma, String(req.params.id));
      if (!event) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      res.json({ event });
    } catch (err) {
      next(err);
    }
  });

  router.post('/events/:id/review', async (req, res, next) => {
    try {
      const parsed = reviewBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }

      const event = await updateActivityReviewEventReview(prisma, {
        auditEventId: String(req.params.id),
        status: parsed.data.status,
        reviewNote: parsed.data.reviewNote ?? null,
        reviewedByUserId: req.user?.id ?? null,
        actorSessionId: req.sessionId ?? null,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      if (!event) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      res.json({ event });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
