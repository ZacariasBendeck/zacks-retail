import { Router, Request, Response, NextFunction, IRouter } from 'express';
import { Prisma } from '../prismaClient';
import { requirePermission } from '../middleware/authMiddleware';
import { validate, validateQuery } from '../middleware/validation';
import {
  activateSegmentVersionSchema,
  audienceMembersQuerySchema,
  buildAudienceSchema,
  createSegmentSchema,
  createSegmentVersionSchema,
  evaluateCustomerSegmentsSchema,
  listSegmentsQuerySchema,
  membersQuerySchema,
  previewSegmentVersionSchema,
  updateSegmentSchema,
  validateSegmentVersionSchema,
} from '../middleware/segmentationValidation';
import { PERMISSIONS } from '../services/employees/permissions';
import * as segmentService from '../services/segmentation/segmentService';
import * as segmentVersionService from '../services/segmentation/segmentVersionService';
import * as evaluationService from '../services/segmentation/segmentEvaluationService';
import * as membershipService from '../services/segmentation/membershipService';
import * as metricRegistryService from '../services/segmentation/metricRegistryService';
import * as audienceBuilderService from '../services/segmentation/audienceBuilderService';

const router: IRouter = Router();

function routeParam(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function handleSegmentationError(err: unknown, res: Response): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith('RULE_VALIDATION_FAILED')) {
    res.status(400).json({ error: { code: 'RULE_VALIDATION_FAILED', message: 'Segment rule is invalid.' } });
    return true;
  }
  if (message === 'SEGMENT_NOT_FOUND') {
    res.status(404).json({ error: { code: 'SEGMENT_NOT_FOUND', message: 'Segment not found.' } });
    return true;
  }
  if (message === 'SEGMENT_VERSION_NOT_FOUND') {
    res.status(404).json({ error: { code: 'SEGMENT_VERSION_NOT_FOUND', message: 'Segment version not found.' } });
    return true;
  }
  if (message === 'SEGMENT_VERSION_INVALID') {
    res.status(400).json({ error: { code: 'SEGMENT_VERSION_INVALID', message: 'Segment version is invalid.' } });
    return true;
  }
  if (message === 'SEGMENT_ALREADY_ACTIVE') {
    res.status(409).json({ error: { code: 'SEGMENT_ALREADY_ACTIVE', message: 'Segment cannot be archived while it has an active version.' } });
    return true;
  }
  if (message === 'EVALUATION_ALREADY_RUNNING') {
    res.status(409).json({ error: { code: 'EVALUATION_ALREADY_RUNNING', message: 'Segment evaluation is already running.' } });
    return true;
  }
  if (message.startsWith('AUDIENCE_BUILD_FAILED')) {
    res.status(400).json({ error: { code: 'AUDIENCE_BUILD_FAILED', message } });
    return true;
  }
  return false;
}

router.get(
  '/segment-metrics',
  requirePermission(PERMISSIONS.SEGMENTATION_READ),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await metricRegistryService.listMetrics();
      res.json({ items });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/customer-segments',
  requirePermission(PERMISSIONS.SEGMENTATION_WRITE),
  validate(createSegmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const segment = await segmentService.createSegment({ ...req.body, actorUserId: req.user?.id ?? null });
      res.status(201).json(segment);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        res.status(409).json({ error: { code: 'SEGMENT_KEY_CONFLICT', message: 'Segment key already exists.' } });
        return;
      }
      next(error);
    }
  },
);

router.get(
  '/customer-segments',
  requirePermission(PERMISSIONS.SEGMENTATION_READ),
  validateQuery(listSegmentsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await segmentService.listSegments((req as any).validatedQuery);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/customer-segments/:segmentId',
  requirePermission(PERMISSIONS.SEGMENTATION_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const segment = await segmentService.getSegment(routeParam(req, 'segmentId'));
      if (!segment) {
        res.status(404).json({ error: { code: 'SEGMENT_NOT_FOUND', message: 'Segment not found.' } });
        return;
      }
      res.json(segment);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/customer-segments/:segmentId',
  requirePermission(PERMISSIONS.SEGMENTATION_WRITE),
  validate(updateSegmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const segment = await segmentService.updateSegment(routeParam(req, 'segmentId'), {
        ...req.body,
        actorUserId: req.user?.id ?? null,
      });
      if (!segment) {
        res.status(404).json({ error: { code: 'SEGMENT_NOT_FOUND', message: 'Segment not found.' } });
        return;
      }
      res.json(segment);
    } catch (error) {
      if (handleSegmentationError(error, res)) return;
      next(error);
    }
  },
);

router.post(
  '/customer-segments/:segmentId/archive',
  requirePermission(PERMISSIONS.SEGMENTATION_WRITE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const segment = await segmentService.archiveSegment(routeParam(req, 'segmentId'), req.user?.id ?? null);
      if (!segment) {
        res.status(404).json({ error: { code: 'SEGMENT_NOT_FOUND', message: 'Segment not found.' } });
        return;
      }
      res.json(segment);
    } catch (error) {
      if (handleSegmentationError(error, res)) return;
      next(error);
    }
  },
);

router.post(
  '/customer-segments/:segmentId/versions',
  requirePermission(PERMISSIONS.SEGMENTATION_WRITE),
  validate(createSegmentVersionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const version = await segmentVersionService.createSegmentVersion({
        segmentId: routeParam(req, 'segmentId'),
        ...req.body,
        actorUserId: req.user?.id ?? null,
      });
      res.status(201).json(version);
    } catch (error) {
      if (handleSegmentationError(error, res)) return;
      next(error);
    }
  },
);

router.post(
  '/customer-segment-versions/validate',
  requirePermission(PERMISSIONS.SEGMENTATION_WRITE),
  validate(validateSegmentVersionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await segmentVersionService.validateSegmentVersionRule(req.body.ruleAst));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/customer-segment-versions/preview',
  requirePermission(PERMISSIONS.SEGMENTATION_WRITE),
  validate(previewSegmentVersionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await segmentVersionService.previewSegmentVersion(req.body.ruleAst, req.body.limit));
    } catch (error) {
      if (handleSegmentationError(error, res)) return;
      next(error);
    }
  },
);

router.post(
  '/customer-segments/:segmentId/versions/:versionId/activate',
  requirePermission(PERMISSIONS.SEGMENTATION_ACTIVATE),
  validate(activateSegmentVersionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await segmentVersionService.activateSegmentVersion({
          segmentId: routeParam(req, 'segmentId'),
          versionId: routeParam(req, 'versionId'),
          actorUserId: req.user?.id ?? null,
          evaluateImmediately: req.body.evaluateImmediately,
        }),
      );
    } catch (error) {
      if (handleSegmentationError(error, res)) return;
      next(error);
    }
  },
);

router.post(
  '/customer-segments/:segmentId/versions/:versionId/retire',
  requirePermission(PERMISSIONS.SEGMENTATION_ACTIVATE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await segmentVersionService.retireSegmentVersion({
          segmentId: routeParam(req, 'segmentId'),
          versionId: routeParam(req, 'versionId'),
          actorUserId: req.user?.id ?? null,
        }),
      );
    } catch (error) {
      if (handleSegmentationError(error, res)) return;
      next(error);
    }
  },
);

router.post(
  '/customer-segments/evaluate-active',
  requirePermission(PERMISSIONS.SEGMENTATION_EVALUATE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await evaluationService.evaluateActiveSegments(req.user?.id ?? null));
    } catch (error) {
      if (handleSegmentationError(error, res)) return;
      next(error);
    }
  },
);

router.post(
  '/customer-segments/:segmentId/evaluate',
  requirePermission(PERMISSIONS.SEGMENTATION_EVALUATE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await evaluationService.evaluateSegmentById(routeParam(req, 'segmentId'), req.user?.id ?? null));
    } catch (error) {
      if (handleSegmentationError(error, res)) return;
      next(error);
    }
  },
);

router.post(
  '/customers/:customerId/evaluate-segments',
  requirePermission(PERMISSIONS.SEGMENTATION_EVALUATE),
  validate(evaluateCustomerSegmentsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await evaluationService.evaluateCustomerSegments({
          customerId: routeParam(req, 'customerId'),
          ...req.body,
          actorUserId: req.user?.id ?? null,
        }),
      );
    } catch (error) {
      if (handleSegmentationError(error, res)) return;
      next(error);
    }
  },
);

router.get(
  '/customer-segment-evaluation-runs/:runId',
  requirePermission(PERMISSIONS.SEGMENTATION_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const run = await evaluationService.getEvaluationRun(routeParam(req, 'runId'));
      if (!run) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Evaluation run not found.' } });
        return;
      }
      res.json(run);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/customers/:customerId/segments',
  requirePermission(PERMISSIONS.SEGMENTATION_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await membershipService.getCustomerSegments(routeParam(req, 'customerId')));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/customer-segments/:segmentId/members',
  requirePermission(PERMISSIONS.SEGMENTATION_READ),
  validateQuery(membersQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = (req as any).validatedQuery;
      res.json(await membershipService.getSegmentMembers(routeParam(req, 'segmentId'), query.limit, query.offset));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/customers/:customerId/segment-history',
  requirePermission(PERMISSIONS.SEGMENTATION_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await membershipService.getCustomerSegmentHistory(routeParam(req, 'customerId')));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/activation-audiences',
  requirePermission(PERMISSIONS.SEGMENTATION_ACTIVATE),
  validate(buildAudienceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(
        await audienceBuilderService.buildActivationAudience({
          request: req.body,
          actorUserId: req.user?.id ?? null,
        }),
      );
    } catch (error) {
      if (handleSegmentationError(error, res)) return;
      next(error);
    }
  },
);

router.get(
  '/activation-audiences/:audienceId',
  requirePermission(PERMISSIONS.SEGMENTATION_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const audience = await audienceBuilderService.getAudience(routeParam(req, 'audienceId'));
      if (!audience) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Audience not found.' } });
        return;
      }
      res.json(audience);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/activation-audiences/:audienceId/members',
  requirePermission(PERMISSIONS.SEGMENTATION_READ),
  validateQuery(audienceMembersQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = (req as any).validatedQuery;
      res.json(
        await audienceBuilderService.getAudienceMembers({
          audienceId: routeParam(req, 'audienceId'),
          treatmentGroup: query.treatmentGroup,
          limit: query.limit,
          offset: query.offset,
        }),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/activation-audiences/:audienceId/export.csv',
  requirePermission(PERMISSIONS.SEGMENTATION_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const csv = await audienceBuilderService.exportAudienceMembersCsv(routeParam(req, 'audienceId'));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send(csv);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
