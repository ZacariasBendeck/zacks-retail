import { PrismaClient } from '../../prismaClient';
import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware';
import { PERMISSIONS } from '../../services/employees/permissions';
import {
  TemplateConflictError,
  TemplateForbiddenError,
  TemplateNotFoundError,
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  touchTemplate,
  updateTemplate,
  type ViewerContext,
} from '../../services/reports/reportTemplatesService';
import {
  createTemplateSchema,
  listTemplatesQuerySchema,
  updateTemplateSchema,
} from './schemas';
import { recordPlatformAuditEvent } from '../../services/platformAuditService';

// Map service errors → HTTP responses. Kept in one place so every route uses
// the same shape.
function handleServiceError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof TemplateNotFoundError) {
    res.status(404).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof TemplateForbiddenError) {
    res.status(403).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof TemplateConflictError) {
    res.status(409).json({ error: { code: err.code, message: err.message } });
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

function templateAuditSnapshot(template: {
  id: string;
  reportType: string;
  title: string;
  visibility: string;
  lastUsedAt: Date | null;
}) {
  return {
    id: template.id,
    reportType: template.reportType,
    title: template.title,
    visibility: template.visibility,
    lastUsedAt: template.lastUsedAt?.toISOString() ?? null,
  };
}

async function recordReportTemplateAudit(
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
    resourceType: 'report.template',
    resourceId: input.resourceId,
    actorUserId: req.user!.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? null,
    beforeJson: input.beforeJson,
    afterJson: input.afterJson,
    metadataJson: { module: 'reports' },
  });
}

export function createReportTemplatesRoutes(prisma: PrismaClient): Router {
  const router = Router();

  // All template routes require authentication. Ownership + visibility are
  // enforced inside the service.
  router.use(requireAuth);

  // GET /  ?scope=mine|all&reportType=<known>
  router.get('/', async (req, res, next) => {
    try {
      const parsed = listTemplatesQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID_QUERY', message: parsed.error.message } });
        return;
      }
      const templates = await listTemplates(prisma, viewerFrom(req), parsed.data);
      res.json({ templates });
    } catch (err) {
      next(err);
    }
  });

  // POST /  body: { reportType, title, paramsJson, visibility? }
  router.post('/', async (req, res, next) => {
    try {
      const parsed = createTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
        return;
      }
      const template = await createTemplate(prisma, {
        ownerId: req.user!.id,
        reportType: parsed.data.reportType,
        title: parsed.data.title,
        paramsJson: parsed.data.paramsJson,
        visibility: parsed.data.visibility,
      });
      await recordReportTemplateAudit(prisma, req, {
        eventType: 'reports.template_created',
        action: 'CREATE_REPORT_TEMPLATE',
        resourceId: template.id,
        afterJson: templateAuditSnapshot(template),
      });
      res.status(201).json({ template });
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  // GET /:id  — visibility-checked, returns full detail incl. paramsJson
  router.get('/:id', async (req, res, next) => {
    try {
      const template = await getTemplate(prisma, viewerFrom(req), req.params.id);
      res.json({ template });
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  // PATCH /:id  — owner only
  router.patch('/:id', async (req, res, next) => {
    try {
      const parsed = updateTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
        return;
      }
      const before = await getTemplate(prisma, viewerFrom(req), req.params.id);
      const template = await updateTemplate(prisma, viewerFrom(req), req.params.id, parsed.data);
      await recordReportTemplateAudit(prisma, req, {
        eventType: 'reports.template_updated',
        action: 'UPDATE_REPORT_TEMPLATE',
        resourceId: template.id,
        beforeJson: templateAuditSnapshot(before),
        afterJson: templateAuditSnapshot(template),
      });
      res.json({ template });
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  // DELETE /:id  — owner OR REPORTS_ADMIN
  router.delete('/:id', async (req, res, next) => {
    try {
      const before = await getTemplate(prisma, viewerFrom(req), req.params.id);
      await deleteTemplate(prisma, viewerFrom(req), req.params.id);
      await recordReportTemplateAudit(prisma, req, {
        eventType: 'reports.template_deleted',
        action: 'DELETE_REPORT_TEMPLATE',
        resourceId: req.params.id,
        beforeJson: templateAuditSnapshot(before),
      });
      res.status(204).end();
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  // POST /:id/touch  — bumps lastUsedAt; visibility-checked
  router.post('/:id/touch', async (req, res, next) => {
    try {
      const before = await getTemplate(prisma, viewerFrom(req), req.params.id);
      await touchTemplate(prisma, viewerFrom(req), req.params.id);
      const template = await getTemplate(prisma, viewerFrom(req), req.params.id);
      await recordReportTemplateAudit(prisma, req, {
        eventType: 'reports.template_used',
        action: 'TOUCH_REPORT_TEMPLATE',
        resourceId: req.params.id,
        beforeJson: templateAuditSnapshot(before),
        afterJson: templateAuditSnapshot(template),
      });
      res.status(204).end();
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  return router;
}


