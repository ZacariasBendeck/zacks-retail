import { Router, type IRouter, type Request, type Response } from 'express';
import { requirePermission } from '../../middleware/authMiddleware';
import { PERMISSIONS } from '../../services/employees/permissions';
import {
  getMigrationJob,
  listMigrationActions,
  startMigrationJob,
} from '../../services/operations/migrationDayService';

const router: IRouter = Router();

router.use(requirePermission(PERMISSIONS.EMPLOYEES_MANAGE));

router.get('/definition', (_req: Request, res: Response) => {
  res.json({
    actions: listMigrationActions(),
    sequence: [
      'check-mdb-folder',
      'check-mdb-table-coverage',
      'check-preflight',
      'export-bundle',
      'check-bundle',
      'manual-upload',
      'load-bundle',
      'post-load-checks',
      'manual-operator-spot-checks',
    ],
  });
});

router.post('/jobs', (req: Request, res: Response) => {
  const actionId = typeof req.body?.actionId === 'string' ? req.body.actionId : '';
  if (!actionId) {
    res.status(400).json({ error: { code: 'INVALID_ACTION', message: 'actionId is required.' } });
    return;
  }

  try {
    const job = startMigrationJob(actionId, req.body?.config ?? {});
    res.status(202).json(job);
  } catch (error) {
    res.status(400).json({
      error: {
        code: 'ACTION_START_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

router.get('/jobs/:jobId', (req: Request, res: Response) => {
  const job = getMigrationJob(String(req.params.jobId ?? ''));
  if (!job) {
    res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'Migration job not found.' } });
    return;
  }
  res.json(job);
});

export default router;
