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
import { recordPlatformAuditEvent } from '../../services/platformAuditService';

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

function runAuditSnapshot(run: {
  id: string;
  reportType: string;
  sourceTemplateId: string | null;
  title: string | null;
  visibility: string;
  rowCount: number;
  resultSizeBytes: number;
  reportTypeVersion: number;
}) {
  return {
    id: run.id,
    reportType: run.reportType,
    sourceTemplateId: run.sourceTemplateId,
    title: run.title,
    visibility: run.visibility,
    rowCount: run.rowCount,
    resultSizeBytes: run.resultSizeBytes,
    reportTypeVersion: run.reportTypeVersion,
  };
}

async function recordReportRunAudit(
  prisma: PrismaClient,
  req: Request,
  input: {
    eventType: string;
    action: string;
    resourceId: string;
    beforeJson?: unknown;
    afterJson?: unknown;
  },
): Promise<void> {
  await recordPlatformAuditEvent(prisma, {
    eventType: input.eventType,
    action: input.action,
    resourceType: 'report.run',
    resourceId: input.resourceId,
    actorUserId: req.user!.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? null,
    beforeJson: input.beforeJson,
    afterJson: input.afterJson,
    metadataJson: { module: 'reports' },
  });
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
      await recordReportRunAudit(prisma, req, {
        eventType: 'reports.run_created',
        action: 'CREATE_REPORT_RUN',
        resourceId: run.id,
        afterJson: runAuditSnapshot(run),
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
      const before = await getRun(prisma, viewerFrom(req), req.params.id);
      const run = await updateRun(prisma, viewerFrom(req), req.params.id, parsed.data);
      await recordReportRunAudit(prisma, req, {
        eventType: 'reports.run_updated',
        action: 'UPDATE_REPORT_RUN',
        resourceId: run.id,
        beforeJson: runAuditSnapshot(before),
        afterJson: runAuditSnapshot(run),
      });
      res.json({ run });
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  // DELETE /:id  — owner OR REPORTS_ADMIN
  router.delete('/:id', async (req, res, next) => {
    try {
      const before = await getRun(prisma, viewerFrom(req), req.params.id);
      await deleteRun(prisma, viewerFrom(req), req.params.id);
      await recordReportRunAudit(prisma, req, {
        eventType: 'reports.run_deleted',
        action: 'DELETE_REPORT_RUN',
        resourceId: req.params.id,
        beforeJson: runAuditSnapshot(before),
      });
      res.status(204).end();
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  return router;
}


