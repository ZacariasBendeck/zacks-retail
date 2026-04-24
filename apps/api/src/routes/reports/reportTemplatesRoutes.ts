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
      const template = await updateTemplate(prisma, viewerFrom(req), req.params.id, parsed.data);
      res.json({ template });
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  // DELETE /:id  — owner OR REPORTS_ADMIN
  router.delete('/:id', async (req, res, next) => {
    try {
      await deleteTemplate(prisma, viewerFrom(req), req.params.id);
      res.status(204).end();
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  // POST /:id/touch  — bumps lastUsedAt; visibility-checked
  router.post('/:id/touch', async (req, res, next) => {
    try {
      await touchTemplate(prisma, viewerFrom(req), req.params.id);
      res.status(204).end();
    } catch (err) {
      handleServiceError(err, res, next);
    }
  });

  return router;
}


