import { Router, Request, Response, IRouter } from 'express';
import * as ticketService from '../services/ticketService';
import {
  createTicketSchema,
  updateTicketHeaderSchema,
  addLineSchema,
  addTenderSchema,
  endTicketSchema,
  voidTicketSchema,
  reclaimTicketSchema,
  continueTicketSchema,
  taxOverrideSchema,
  reprintSchema,
  validate,
} from '../middleware/salesPosValidation';

const router: IRouter = Router();

router.post('/', validate(createTicketSchema), (req: Request, res: Response): void => {
  try {
    const ticket = ticketService.createTicket(req.body);
    res.status(201).json(ticket);
  } catch (err: any) {
    sendTicketError(res, err);
  }
});

router.get('/:id', (req: Request, res: Response): void => {
  const ticket = ticketService.getTicket((req.params.id as string));
  if (!ticket) {
    res.status(404).json({ error: { code: 'TICKET_NOT_FOUND', message: 'Ticket not found.' } });
    return;
  }
  res.json(ticket);
});

router.patch('/:id/header', validate(updateTicketHeaderSchema), (req: Request, res: Response): void => {
  try {
    const ticket = ticketService.updateTicketHeader((req.params.id as string), req.body);
    res.json(ticket);
  } catch (err: any) {
    sendTicketError(res, err);
  }
});

router.post('/:id/lines', validate(addLineSchema), (req: Request, res: Response): void => {
  try {
    const line = ticketService.addLine((req.params.id as string), req.body);
    res.status(201).json(line);
  } catch (err: any) {
    sendTicketError(res, err);
  }
});

router.delete('/:id/lines/:lineId', (req: Request, res: Response): void => {
  try {
    const ticket = ticketService.removeLine((req.params.id as string), (req.params.lineId as string));
    res.json(ticket);
  } catch (err: any) {
    sendTicketError(res, err);
  }
});

router.post('/:id/lines/:lineId/reverse', (req: Request, res: Response): void => {
  try {
    const line = ticketService.reverseLine((req.params.id as string), (req.params.lineId as string));
    res.json(line);
  } catch (err: any) {
    sendTicketError(res, err);
  }
});

router.post('/:id/tenders', validate(addTenderSchema), (req: Request, res: Response): void => {
  try {
    const tender = ticketService.addTender((req.params.id as string), req.body);
    res.status(201).json(tender);
  } catch (err: any) {
    sendTicketError(res, err);
  }
});

router.post('/:id/end', validate(endTicketSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const ticket = await ticketService.endTicket((req.params.id as string), req.body);
    res.json(ticket);
  } catch (err: any) {
    sendTicketError(res, err);
  }
});

router.post('/:id/void', validate(voidTicketSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const ticket = await ticketService.voidTicket((req.params.id as string), req.body);
    res.json(ticket);
  } catch (err: any) {
    sendTicketError(res, err);
  }
});

router.post('/:id/reclaim', validate(reclaimTicketSchema), (req: Request, res: Response): void => {
  try {
    const ticket = ticketService.reclaimTicket((req.params.id as string), req.body.actorUserId);
    res.status(201).json(ticket);
  } catch (err: any) {
    sendTicketError(res, err);
  }
});

router.post('/:id/continue', validate(continueTicketSchema), (req: Request, res: Response): void => {
  try {
    const child = ticketService.continueTicket((req.params.id as string), req.body);
    res.status(201).json(child);
  } catch (err: any) {
    sendTicketError(res, err);
  }
});

router.post('/:id/tax-override', validate(taxOverrideSchema), (req: Request, res: Response): void => {
  try {
    const ticket = ticketService.overrideTicketTax(
      (req.params.id as string),
      req.body.newTaxTotal,
      req.body.reason,
      req.body.actorUserId
    );
    res.json(ticket);
  } catch (err: any) {
    sendTicketError(res, err);
  }
});

router.post('/:id/reprint', validate(reprintSchema), (req: Request, res: Response): void => {
  try {
    const ticket = ticketService.recordReprint((req.params.id as string), req.body);
    res.json(ticket);
  } catch (err: any) {
    sendTicketError(res, err);
  }
});

function sendTicketError(res: Response, err: any): void {
  const code = err?.message || 'INTERNAL_ERROR';
  const statusMap: Record<string, number> = {
    TICKET_NOT_FOUND: 404,
    TICKET_VOIDED: 409,
    TICKET_ALREADY_ENDED: 409,
    TICKET_ALREADY_VOIDED: 409,
    TICKET_NOT_VOIDED: 409,
    TICKET_HAS_NO_LINES: 400,
    CANNOT_RECLAIM_ENDED_TICKET: 409,
    CANNOT_RECLAIM_CONTINUATION_CHAIN: 409,
    CANNOT_REPRINT_DRAFT_TICKET: 409,
    INSUFFICIENT_TENDER: 400,
    MAX_SPLIT_TENDERS_EXCEEDED: 400,
    SHIFT_NOT_FOUND: 404,
    SHIFT_NOT_OPEN: 409,
    PARENT_TICKET_NOT_FOUND: 404,
    PARENT_TICKET_VOIDED: 409,
    PARENT_TICKET_ALREADY_ENDED: 409,
    CONTINUATION_TENDER_NOT_CONFIGURED: 500,
    SKU_NOT_FOUND: 404,
    SKU_REQUIRED: 400,
    SKU_SIZE_MISMATCH: 400,
    QUANTITY_ZERO_NOT_ALLOWED: 400,
    RETURN_CODE_REQUIRED: 400,
    LINE_NOT_FOUND: 404,
    TENDER_TYPE_NOT_FOUND: 404,
    ACCOUNT_NUMBER_REQUIRED: 400,
    ACCOUNT_NUMBER_REQUIRED_FOR_STORE_CREDIT: 400,
    TICKET_PASSWORD_REQUIRED: 401,
    TICKET_PASSWORD_INVALID: 401,
  };
  const status = statusMap[code] ?? 500;
  res.status(status).json({ error: { code, message: err?.message ?? 'Unexpected error' } });
}

export default router;
