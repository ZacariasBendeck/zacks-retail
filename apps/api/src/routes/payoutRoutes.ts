import { Router, Request, Response, IRouter } from 'express';
import * as payoutService from '../services/payoutService';
import { createPayoutSchema, validate } from '../middleware/salesPosValidation';

const router: IRouter = Router();

router.post('/', validate(createPayoutSchema), (req: Request, res: Response): void => {
  try {
    const payout = payoutService.createPayout(req.body);
    res.status(201).json(payout);
  } catch (err: any) {
    const code = err?.message || 'INTERNAL_ERROR';
    const map: Record<string, number> = {
      SHIFT_NOT_FOUND: 404,
      SHIFT_NOT_OPEN: 409,
      PAYOUT_CATEGORY_NOT_FOUND: 404,
      PAYOUT_CATEGORY_STORE_MISMATCH: 400,
      PAYOUT_AMOUNT_INVALID: 400,
    };
    res.status(map[code] ?? 500).json({ error: { code, message: err?.message ?? 'Unexpected error' } });
  }
});

router.get('/', (req: Request, res: Response): void => {
  const shiftId = typeof req.query.shiftId === 'string' ? req.query.shiftId : null;
  if (!shiftId) {
    res.status(400).json({ error: { code: 'SHIFT_ID_REQUIRED', message: 'shiftId query parameter is required.' } });
    return;
  }
  const payouts = payoutService.listPayoutsForShift(shiftId);
  res.json({ payouts });
});

export default router;
