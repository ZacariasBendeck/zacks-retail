import { Router, Request, Response, IRouter } from 'express';
import * as shiftService from '../services/shiftService';
import * as posReportService from '../services/posReportService';
import {
  openShiftSchema,
  closeShiftSchema,
  countMoneySchema,
  postShiftSchema,
  validate,
} from '../middleware/salesPosValidation';

const router: IRouter = Router();

router.post('/', validate(openShiftSchema), (req: Request, res: Response): void => {
  try {
    const shift = shiftService.openShift(req.body);
    res.status(201).json(shift);
  } catch (err: any) {
    sendPosError(res, err);
  }
});

router.get('/', (req: Request, res: Response): void => {
  const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
  const shifts = shiftService.listOpenShifts(storeId);
  res.json({ shifts });
});

router.get('/:id', (req: Request, res: Response): void => {
  const shift = shiftService.getShift((req.params.id as string));
  if (!shift) {
    res.status(404).json({ error: { code: 'SHIFT_NOT_FOUND', message: 'Shift not found.' } });
    return;
  }
  res.json(shift);
});

router.get('/:id/cash-totals', (req: Request, res: Response): void => {
  try {
    const totals = shiftService.computeCashTotals((req.params.id as string));
    res.json(totals);
  } catch (err: any) {
    sendPosError(res, err);
  }
});

router.post('/:id/count-money', validate(countMoneySchema), (req: Request, res: Response): void => {
  try {
    const counts = shiftService.submitTenderCounts((req.params.id as string), req.body.counts);
    res.status(200).json({ counts });
  } catch (err: any) {
    sendPosError(res, err);
  }
});

router.post('/:id/close', validate(closeShiftSchema), (req: Request, res: Response): void => {
  try {
    const shift = shiftService.closeShift((req.params.id as string), req.body);
    res.json(shift);
  } catch (err: any) {
    sendPosError(res, err);
  }
});

router.post('/:id/post', validate(postShiftSchema), (req: Request, res: Response): void => {
  try {
    const shift = shiftService.postShiftToInventory((req.params.id as string), req.body.postedByUserId);
    res.json(shift);
  } catch (err: any) {
    sendPosError(res, err);
  }
});

router.get('/:id/sales-journal', (req: Request, res: Response): void => {
  const journal = posReportService.salesJournalForShift((req.params.id as string));
  res.json(journal);
});

function sendPosError(res: Response, err: any): void {
  const code = err?.message || 'INTERNAL_ERROR';
  const statusMap: Record<string, number> = {
    SHIFT_NOT_FOUND: 404,
    SHIFT_ALREADY_OPEN: 409,
    SHIFT_ALREADY_CLOSED: 409,
    SHIFT_NOT_OPEN: 409,
    SHIFT_NOT_CLOSED: 409,
    SHIFT_NOT_COUNTABLE: 409,
    SHIFT_VOIDED: 409,
    SHIFT_NOT_BATCH_MODE: 409,
    SHIFT_ALREADY_POSTED: 409,
    REGISTER_NOT_FOUND: 404,
    REGISTER_INACTIVE: 409,
    REGISTER_STORE_MISMATCH: 400,
    MANAGER_PASSWORD_REQUIRED: 401,
    MANAGER_PASSWORD_INVALID: 401,
    TENDER_TYPE_NOT_FOUND: 404,
  };
  const status = statusMap[code] ?? 500;
  res.status(status).json({ error: { code, message: err?.message ?? 'Unexpected error' } });
}

export default router;
