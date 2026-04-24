import { PrismaClient } from '../../prismaClient';
import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware';
import { PERMISSIONS } from '../../services/employees/permissions';
import {
  RunForbiddenError,
  RunInvalidPayloadError,
  RunNotFoundError,
  createRun,
  deleteRun,
  getRun,
  listRuns,
  updateRun,
  type ViewerContext,
} from '../../services/reports/reportRunsService';
import {
  createRunSchema,
  listRunsQuerySchema,
  updateRunSchema,
} from './schemas';

// Matches the templates pattern — one error mapper keeps every handler
// consistent and lets the service throw rich errors instead of leaking
// HTTP concerns.
function handleServiceError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof RunNotFoundError) {
    res.status(404).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof RunForbiddenError) {
    res.status(403).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof RunInvalidPayloadError) {
    res.status(400).json({ error: { code: err.code, message: err.message } });
    return;
  }
  next(err);
}

function viewerFrom(req: Request): ViewerContext {
  return {
    id: req.user!.id,
    isAdmin: req.permissions?.has(PERMISSIONS.REPORTS_ADMIN) ?? false,
  };
}

export function createReportRunsRoutes(prisma: PrismaClient): Router {
  const router = Router();

  // Every runs route requires auth. Ownership + visibility live in the
  // service layer so the routes stay thin.
  router.use(requireAuth);

  // GET /  ?scope=mine|all&reportType=<known>&sourceTemplateId=<uuid>&limit=50&offset=0
  // Returns envelope summaries only. The full resultJson is not included —
  // fetch each run individually via GET /:id for that.
  router.get('/', async (req, res, next) => {
    try {
      const parsed = listRunsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID_QUERY', message: parsed.error.message } });
        return;
      }
      const result = await listRuns(prisma, viewerFrom(req), parsed.data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /  body: { reportType, title?, paramsJson, resultJson, visibility?, sourceTemplateId? }
  // Envelope columns (rowCount, resultSizeBytes, reportTypeVersion) are
  // computed server-side — anything the client sends for them is ignored.
  router.post('/', async (req, res, next) => {
    try {
      const parsed = createRunSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
        return;
      }
      const run = await createRun(prisma, {
        userId: req.user!.id,
        reportType: parsed.data.reportType,
        title: parsed.data.title,
        paramsJson: parsed.data.paramsJson,
        resultJson: parsed.data.resultJson,
        visibility: parsed.data.visibility,
        sourceTemplateId: parsed.data.sourceTemplateId,
      });
      res.status(201).json({ run });
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  // GET /:id  — visibility-checked, returns full detail including resultJson
  router.get('/:id', async (req, res, next) => {
    try {
      const run = await getRun(prisma, viewerFrom(req), req.params.id);
      res.json({ run });
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  // PATCH /:id  — owner only; may update title + visibility (not params/result)
  router.patch('/:id', async (req, res, next) => {
    try {
      const parsed = updateRunSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
        return;
      }
      const run = await updateRun(prisma, viewerFrom(req), req.params.id, parsed.data);
      res.json({ run });
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  // DELETE /:id  — owner OR REPORTS_ADMIN
  router.delete('/:id', async (req, res, next) => {
    try {
      await deleteRun(prisma, viewerFrom(req), req.params.id);
      res.status(204).end();
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  return router;
}


