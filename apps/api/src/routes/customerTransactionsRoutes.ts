import { Router, Request, Response, IRouter } from 'express';
import * as svc from '../services/customerTransactionsService';

const router: IRouter = Router();

function handleErr(res: Response, err: unknown): void {
  const msg = err instanceof Error ? err.message : 'INTERNAL_ERROR';
  const map: Record<string, number> = {
    CUSTOMER_NOT_FOUND: 404,
    SPECIAL_ORDER_NOT_FOUND: 404,
    SPECIAL_ORDER_NOT_PICKUP_READY: 409,
    SPECIAL_ORDER_NOT_REFUNDABLE: 409,
    SPECIAL_ORDER_HAS_UNRESOLVED_DRAFT_SKUS: 409,
    AT_LEAST_ONE_LINE_REQUIRED: 400,
    LINE_SKU_OR_DESCRIPTION_REQUIRED: 400,
    LAYAWAY_NOT_FOUND: 404,
    LAYAWAY_NOT_ACTIVE: 409,
    LAYAWAY_NOT_REFUNDABLE: 409,
    PAYMENT_AMOUNT_INVALID: 400,
    PAYMENT_OVERPAYMENT: 400,
    MIN_LAYAWAY_DEPOSIT_NOT_MET: 400,
    GIFT_CERT_NOT_FOUND: 404,
    GIFT_CERT_NOT_ACTIVE: 409,
    GIFT_CERT_INSUFFICIENT_BALANCE: 400,
    AMOUNT_MUST_BE_POSITIVE: 400,
    CERTIFICATE_NUMBER_REQUIRED: 400,
  };
  const status = map[msg] ?? 500;
  res.status(status).json({ error: { code: msg, message: msg } });
}

// --- Special Orders --------------------------------------------------------

router.post('/special-orders', (req: Request, res: Response): void => {
  try {
    res.status(201).json(svc.createSpecialOrder(req.body));
  } catch (e) { handleErr(res, e); }
});

router.get('/special-orders/customer/:customerId', (req: Request, res: Response): void => {
  res.json({ data: svc.listSpecialOrdersForCustomer(req.params.customerId as string) });
});

router.get('/special-orders/:id', (req: Request, res: Response): void => {
  const so = svc.getSpecialOrder(req.params.id as string);
  if (!so) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; }
  res.json(so);
});

router.post('/special-orders/:id/pickup', (req: Request, res: Response): void => {
  try {
    res.json(svc.pickupSpecialOrder(req.params.id as string, req.body.pickupTicketId));
  } catch (e) { handleErr(res, e); }
});

router.post('/special-orders/:id/refund', (req: Request, res: Response): void => {
  try {
    res.json(svc.refundSpecialOrder(req.params.id as string, req.body.refundTicketId));
  } catch (e) { handleErr(res, e); }
});

router.patch('/special-orders/lines/:lineId/resolve-sku', (req: Request, res: Response): void => {
  svc.resolveSpecialOrderDraftSku(req.params.lineId as string, req.body.skuId);
  res.status(204).send();
});

// --- Layaways --------------------------------------------------------------

router.post('/layaways', (req: Request, res: Response): void => {
  try { res.status(201).json(svc.createLayaway(req.body)); }
  catch (e) { handleErr(res, e); }
});

router.get('/layaways/customer/:customerId', (req: Request, res: Response): void => {
  res.json({ data: svc.listLayawaysForCustomer(req.params.customerId as string) });
});

router.get('/layaways/:id', (req: Request, res: Response): void => {
  const l = svc.getLayaway(req.params.id as string);
  if (!l) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; }
  res.json(l);
});

router.post('/layaways/:id/payments', (req: Request, res: Response): void => {
  try { res.json(svc.recordLayawayPayment(req.params.id as string, req.body)); }
  catch (e) { handleErr(res, e); }
});

router.post('/layaways/:id/refund', (req: Request, res: Response): void => {
  try { res.json(svc.refundLayaway(req.params.id as string, req.body.refundTicketId)); }
  catch (e) { handleErr(res, e); }
});

// --- Gift Certificates -----------------------------------------------------

router.post('/gift-certificates/issue', (req: Request, res: Response): void => {
  try { res.status(201).json(svc.issueGiftCertificate(req.body)); }
  catch (e) { handleErr(res, e); }
});

router.post('/gift-certificates/backfill', (req: Request, res: Response): void => {
  try { res.status(201).json(svc.backfillGiftCertificate(req.body)); }
  catch (e) { handleErr(res, e); }
});

router.get('/gift-certificates/:id', (req: Request, res: Response): void => {
  const c = svc.getGiftCertificate(req.params.id as string);
  if (!c) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; }
  res.json(c);
});

router.get('/gift-certificates/by-no/:certificateNo', (req: Request, res: Response): void => {
  const seq = typeof req.query.sequence === 'string' ? req.query.sequence : '';
  const c = svc.findGiftCertificate(req.params.certificateNo as string, seq);
  if (!c) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; }
  res.json(c);
});

router.post('/gift-certificates/:id/redeem', (req: Request, res: Response): void => {
  try {
    res.json(svc.redeemGiftCertificate({
      certId: req.params.id as string,
      amount: req.body.amount,
      ticketId: req.body.ticketId,
      storeId: req.body.storeId,
      customerId: req.body.customerId,
      enteredBy: req.body.enteredBy,
    }));
  } catch (e) { handleErr(res, e); }
});

router.get('/gift-certificates/:id/transactions', (req: Request, res: Response): void => {
  res.json({ data: svc.listGiftCertificateTransactions(req.params.id as string) });
});

// --- House Charges ---------------------------------------------------------

router.post('/house-charges', (req: Request, res: Response): void => {
  try { res.status(201).json(svc.recordHouseCharge(req.body)); }
  catch (e) { handleErr(res, e); }
});

router.get('/house-charges/customer/:customerId/balance', (req: Request, res: Response): void => {
  res.json(svc.getHouseChargeBalance(req.params.customerId as string));
});

router.get('/house-charges/customer/:customerId', (req: Request, res: Response): void => {
  res.json({ data: svc.listHouseChargeTransactions(req.params.customerId as string) });
});

export default router;
