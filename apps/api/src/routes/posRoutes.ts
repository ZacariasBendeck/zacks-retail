import { Router, type IRouter, type Request, type Response } from 'express';
import { z } from 'zod';
import { requirePermission } from '../middleware/authMiddleware';
import { PERMISSIONS } from '../services/employees/permissions';
import {
  SalesPasswordTokenError,
  consumeEmployeeSalesOverrideToken,
  type EmployeeSalesPasswordScope,
} from '../services/employees/salesPasswordBridgeService';
import { prisma } from '../db/prisma';
import {
  PosServiceError,
  addTicketLine,
  closeShift,
  completeTicket,
  createPayout,
  getClosePreview,
  getPosBootstrap,
  getPosTicket,
  listCompletedTickets,
  listReclaimableTickets,
  lookupProductForPos,
  openShift,
  patchTicketHeader,
  reclaimTicket,
  removeTicketLine,
  reprintTicket,
  requiresManagerOverride,
  rotateTicketLinePrice,
  updateTicketLine,
  voidDraftTicket,
} from '../services/salesPos/posService';

const router: IRouter = Router();

const optionalTrimmedString = z.string().trim().min(1).optional().nullable();
const moneySchema = z.coerce.number().finite();
const nullableMoneySchema = moneySchema.optional().nullable();
const uuidSchema = z.string().uuid();

const bootstrapQuerySchema = z.object({
  storeId: z.coerce.number().int().positive().optional(),
  registerCode: z.string().trim().min(1).optional(),
});

const lookupQuerySchema = z.object({
  code: z.string().trim().min(1),
});

const openShiftBody = z.object({
  storeId: z.coerce.number().int().positive(),
  registerCode: z.string().trim().min(1).optional(),
  openingCashFloat: moneySchema.optional(),
});

const ticketHeaderPatchBody = z.object({
  cashierUserId: uuidSchema.optional(),
  cashierName: optionalTrimmedString,
  customerId: uuidSchema.optional().nullable(),
  customerAccountNumber: optionalTrimmedString,
  customerName: optionalTrimmedString,
  headerDiscountPct: nullableMoneySchema,
  promotionCode: optionalTrimmedString,
  shipToState: optionalTrimmedString,
  transactionType: z.string().trim().min(1).optional(),
  comment: optionalTrimmedString,
  otherCharges: moneySchema.optional(),
});

const addLineBody = z.object({
  code: z.string().trim().min(1),
  quantity: z.coerce.number().int().optional(),
  columnLabel: optionalTrimmedString,
  rowLabel: optionalTrimmedString,
  unitPrice: moneySchema.optional(),
  priceMode: z.enum(['RETAIL', 'MARKDOWN1', 'MARKDOWN2', 'LIST', 'MANUAL']).optional(),
  discountPct: nullableMoneySchema,
  discountAmount: nullableMoneySchema,
  taxable: z.boolean().optional(),
  secondaryTaxRate: moneySchema.optional(),
  salespersonUserId: uuidSchema.optional().nullable(),
  salespersonCode: optionalTrimmedString,
  salespersonName: optionalTrimmedString,
  familyMemberId: uuidSchema.optional().nullable(),
  returnCode: z.coerce.number().int().optional().nullable(),
  comment: optionalTrimmedString,
});

const updateLineBody = z.object({
  quantity: z.coerce.number().int().optional(),
  columnLabel: optionalTrimmedString,
  rowLabel: optionalTrimmedString,
  unitPrice: moneySchema.optional(),
  priceMode: z.enum(['RETAIL', 'MARKDOWN1', 'MARKDOWN2', 'LIST', 'MANUAL']).optional(),
  discountPct: nullableMoneySchema,
  discountAmount: nullableMoneySchema,
  taxable: z.boolean().optional(),
  secondaryTaxRate: moneySchema.optional(),
  salespersonUserId: uuidSchema.optional().nullable(),
  salespersonCode: optionalTrimmedString,
  salespersonName: optionalTrimmedString,
  familyMemberId: uuidSchema.optional().nullable(),
  returnCode: z.coerce.number().int().optional().nullable(),
  comment: optionalTrimmedString,
});

const payoutBody = z.object({
  shiftId: uuidSchema,
  categoryId: uuidSchema,
  amount: moneySchema,
  note: optionalTrimmedString,
  overrideToken: z.string().min(10).optional(),
});

const closeShiftBody = z.object({
  actualCashTotal: moneySchema,
  notes: optionalTrimmedString,
  countedTenders: z
    .array(
      z.object({
        tenderTypeId: uuidSchema,
        amount: moneySchema,
      }),
    )
    .optional(),
  overrideToken: z.string().min(10).optional(),
});

const simpleOverrideBody = z.object({
  overrideToken: z.string().min(10).optional(),
});

const completeTicketBody = z.object({
  tenders: z
    .array(
      z.object({
        tenderTypeId: uuidSchema,
        amount: moneySchema,
        accountNumber: optionalTrimmedString,
        reference: optionalTrimmedString,
      }),
    )
    .min(1)
    .max(4),
  comment: optionalTrimmedString,
  promotionCode: optionalTrimmedString,
  otherCharges: moneySchema.optional(),
  overrideToken: z.string().min(10).optional(),
});

function sendError(res: Response, err: unknown): boolean {
  if (err instanceof PosServiceError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof SalesPasswordTokenError) {
    const statusByCode: Record<string, number> = {
      OVERRIDE_TOKEN_NOT_FOUND: 404,
      OVERRIDE_TOKEN_ALREADY_CONSUMED: 409,
      OVERRIDE_TOKEN_EXPIRED: 410,
      OVERRIDE_TOKEN_SCOPE_MISMATCH: 409,
      OVERRIDE_TOKEN_TICKET_MISMATCH: 409,
      OVERRIDE_TOKEN_ACTION_MISMATCH: 409,
    };
    res.status(statusByCode[err.code] ?? 400).json({
      error: { code: err.code, message: err.message },
    });
    return true;
  }
  return false;
}

function parseBody<T>(schema: z.ZodSchema<T>, req: Request, res: Response): T | null {
  const parsed = schema.safeParse(req.body);
  if (parsed.success) return parsed.data;
  res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
  return null;
}

function parseQuery<T>(schema: z.ZodSchema<T>, req: Request, res: Response): T | null {
  const parsed = schema.safeParse(req.query);
  if (parsed.success) return parsed.data;
  res.status(400).json({ error: { code: 'INVALID_QUERY', message: parsed.error.message } });
  return null;
}

async function consumeOverrideIfRequired(
  req: Request,
  res: Response,
  args: {
    required: boolean;
    scope: EmployeeSalesPasswordScope;
    overrideToken?: string;
    ticketId?: string;
    action: string;
  },
): Promise<boolean> {
  if (!args.required) return true;
  if (!args.overrideToken) {
    res.status(409).json({
      error: {
        code: 'OVERRIDE_REQUIRED',
        message: 'Manager override required for this POS action.',
      },
    });
    return false;
  }

  try {
    await consumeEmployeeSalesOverrideToken(prisma, {
      overrideToken: args.overrideToken,
      scope: args.scope,
      invokingUserId: req.user!.id,
      ticketId: args.ticketId,
      action: args.action,
      ipAddress: req.ip,
    });
    return true;
  } catch (err) {
    if (sendError(res, err)) return false;
    throw err;
  }
}

router.use(requirePermission(PERMISSIONS.SALES_POS_OPERATE));

router.get('/bootstrap', async (req: Request, res: Response) => {
  const query = parseQuery(bootstrapQuerySchema, req, res);
  if (!query) return;

  try {
    const data = await getPosBootstrap(prisma, {
      requestedStoreId: query.storeId ?? null,
      requestedRegisterCode: query.registerCode ?? null,
      currentUser: {
        id: req.user!.id,
        displayName: req.user!.displayName,
        salespersonCode: req.user!.salespersonCode ?? null,
        permissions: Array.from(req.permissions ?? []),
        homeStoreId: req.user!.homeStoreId ?? null,
      },
    });
    res.json(data);
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.get('/catalog/lookup', async (req: Request, res: Response) => {
  const query = parseQuery(lookupQuerySchema, req, res);
  if (!query) return;

  try {
    const data = await lookupProductForPos(prisma, query.code);
    res.json(data);
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.post('/shifts/open', async (req: Request, res: Response) => {
  const body = parseBody(openShiftBody, req, res);
  if (!body) return;

  try {
    const data = await openShift(prisma, {
      storeId: body.storeId,
      registerCode: body.registerCode ?? null,
      openingCashFloat: body.openingCashFloat ?? 0,
      currentUser: {
        id: req.user!.id,
        displayName: req.user!.displayName,
        salespersonCode: req.user!.salespersonCode ?? null,
        permissions: Array.from(req.permissions ?? []),
        homeStoreId: req.user!.homeStoreId ?? null,
      },
    });
    res.status(201).json(data);
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.get('/shifts/:shiftId/close-preview', async (req: Request, res: Response) => {
  try {
    const data = await getClosePreview(prisma, String(req.params.shiftId));
    res.json(data);
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.post('/shifts/:shiftId/close', async (req: Request, res: Response) => {
  const body = parseBody(closeShiftBody, req, res);
  if (!body) return;

  const allow = await consumeOverrideIfRequired(req, res, {
    required: true,
    scope: 'CLOSE_BATCH',
    overrideToken: body.overrideToken,
    action: 'close-shift',
  });
  if (!allow) return;

  try {
    const shift = await closeShift(prisma, {
      shiftId: String(req.params.shiftId),
      input: {
        actualCashTotal: body.actualCashTotal,
        notes: body.notes ?? null,
        countedTenders: body.countedTenders,
      },
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
    });
    res.json({ shift });
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.get('/shifts/:shiftId/reclaimable-tickets', async (req: Request, res: Response) => {
  try {
    const tickets = await listReclaimableTickets(prisma, String(req.params.shiftId));
    res.json({ tickets });
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.get('/shifts/:shiftId/completed-tickets', async (req: Request, res: Response) => {
  try {
    const tickets = await listCompletedTickets(prisma, String(req.params.shiftId));
    res.json({ tickets });
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.get('/tickets/:ticketId', async (req: Request, res: Response) => {
  try {
    const ticket = await getPosTicket(prisma, String(req.params.ticketId));
    res.json({ ticket });
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.patch('/tickets/:ticketId/header', async (req: Request, res: Response) => {
  const body = parseBody(ticketHeaderPatchBody, req, res);
  if (!body) return;

  try {
    const ticket = await patchTicketHeader(prisma, {
      ticketId: String(req.params.ticketId),
      patch: {
        cashierUserId: body.cashierUserId,
        cashierName: body.cashierName ?? undefined,
        customerId: body.customerId ?? undefined,
        customerAccountNumber: body.customerAccountNumber ?? undefined,
        customerName: body.customerName ?? undefined,
        headerDiscountPct: body.headerDiscountPct ?? undefined,
        promotionCode: body.promotionCode ?? undefined,
        shipToState: body.shipToState ?? undefined,
        transactionType: body.transactionType,
        comment: body.comment ?? undefined,
        otherCharges: body.otherCharges,
      },
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
    });
    res.json({ ticket });
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.post('/tickets/:ticketId/lines', async (req: Request, res: Response) => {
  const body = parseBody(addLineBody, req, res);
  if (!body) return;

  try {
    const ticket = await addTicketLine(prisma, {
      ticketId: String(req.params.ticketId),
      input: {
        code: body.code,
        quantity: body.quantity,
        columnLabel: body.columnLabel ?? undefined,
        rowLabel: body.rowLabel ?? undefined,
        unitPrice: body.unitPrice,
        priceMode: body.priceMode,
        discountPct: body.discountPct ?? undefined,
        discountAmount: body.discountAmount ?? undefined,
        taxable: body.taxable,
        secondaryTaxRate: body.secondaryTaxRate,
        salespersonUserId: body.salespersonUserId ?? undefined,
        salespersonCode: body.salespersonCode ?? undefined,
        salespersonName: body.salespersonName ?? undefined,
        familyMemberId: body.familyMemberId ?? undefined,
        returnCode: body.returnCode ?? undefined,
        comment: body.comment ?? undefined,
      },
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
    });
    res.status(201).json({ ticket });
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.patch('/tickets/:ticketId/lines/:lineId', async (req: Request, res: Response) => {
  const body = parseBody(updateLineBody, req, res);
  if (!body) return;

  try {
    const ticket = await updateTicketLine(prisma, {
      ticketId: String(req.params.ticketId),
      lineId: String(req.params.lineId),
      input: {
        quantity: body.quantity,
        columnLabel: body.columnLabel ?? undefined,
        rowLabel: body.rowLabel ?? undefined,
        unitPrice: body.unitPrice,
        priceMode: body.priceMode,
        discountPct: body.discountPct ?? undefined,
        discountAmount: body.discountAmount ?? undefined,
        taxable: body.taxable,
        secondaryTaxRate: body.secondaryTaxRate,
        salespersonUserId: body.salespersonUserId ?? undefined,
        salespersonCode: body.salespersonCode ?? undefined,
        salespersonName: body.salespersonName ?? undefined,
        familyMemberId: body.familyMemberId ?? undefined,
        returnCode: body.returnCode ?? undefined,
        comment: body.comment ?? undefined,
      },
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
    });
    res.json({ ticket });
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.post('/tickets/:ticketId/lines/:lineId/rotate-price', async (req: Request, res: Response) => {
  try {
    const ticket = await rotateTicketLinePrice(prisma, {
      ticketId: String(req.params.ticketId),
      lineId: String(req.params.lineId),
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
    });
    res.json({ ticket });
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.delete('/tickets/:ticketId/lines/:lineId', async (req: Request, res: Response) => {
  try {
    const ticket = await removeTicketLine(prisma, {
      ticketId: String(req.params.ticketId),
      lineId: String(req.params.lineId),
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
    });
    res.json({ ticket });
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.post('/tickets/:ticketId/void', async (req: Request, res: Response) => {
  const body = parseBody(simpleOverrideBody, req, res);
  if (!body) return;

  const allow = await consumeOverrideIfRequired(req, res, {
    required: true,
    scope: 'VOID',
    overrideToken: body.overrideToken,
    ticketId: String(req.params.ticketId),
    action: 'void-ticket',
  });
  if (!allow) return;

  try {
    const ticket = await voidDraftTicket(prisma, {
      ticketId: String(req.params.ticketId),
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
    });
    res.json({ ticket });
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.post('/tickets/:ticketId/reclaim', async (req: Request, res: Response) => {
  try {
    const ticket = await reclaimTicket(prisma, {
      ticketId: String(req.params.ticketId),
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
    });
    res.json({ ticket });
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.post('/tickets/:ticketId/complete', async (req: Request, res: Response) => {
  const body = parseBody(completeTicketBody, req, res);
  if (!body) return;

  try {
    const existingTicket = await getPosTicket(prisma, String(req.params.ticketId));
    const hasReturnLine = existingTicket.lines.some((line) => line.quantity < 0);
    const overrideNeeded = requiresManagerOverride({
      permissions: Array.from(req.permissions ?? []),
      action: 'REFUND',
      ticket: existingTicket,
    }) && hasReturnLine;

    const allow = await consumeOverrideIfRequired(req, res, {
      required: overrideNeeded,
      scope: 'REFUND',
      overrideToken: body.overrideToken,
      ticketId: existingTicket.id,
      action: 'complete-ticket',
    });
    if (!allow) return;

    const result = await completeTicket(prisma, {
      ticketId: String(req.params.ticketId),
      input: {
        tenders: body.tenders,
        comment: body.comment ?? null,
        promotionCode: body.promotionCode ?? null,
        otherCharges: body.otherCharges,
      },
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      actorSalespersonCode: req.user!.salespersonCode ?? null,
    });
    res.json(result);
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.post('/tickets/:ticketId/reprint', async (req: Request, res: Response) => {
  const body = parseBody(simpleOverrideBody, req, res);
  if (!body) return;

  const overrideNeeded = requiresManagerOverride({
    permissions: Array.from(req.permissions ?? []),
    action: 'VOID',
  });

  const allow = await consumeOverrideIfRequired(req, res, {
    required: overrideNeeded,
    scope: 'REPRINT',
    overrideToken: body.overrideToken,
    ticketId: String(req.params.ticketId),
    action: 'reprint-ticket',
  });
  if (!allow) return;

  try {
    const result = await reprintTicket(prisma, {
      ticketId: String(req.params.ticketId),
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
    });
    res.json(result);
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

router.post('/payouts', async (req: Request, res: Response) => {
  const body = parseBody(payoutBody, req, res);
  if (!body) return;

  const allow = await consumeOverrideIfRequired(req, res, {
    required: true,
    scope: 'PAY_OUT',
    overrideToken: body.overrideToken,
    action: 'create-payout',
  });
  if (!allow) return;

  try {
    const result = await createPayout(prisma, {
      input: {
        shiftId: body.shiftId,
        categoryId: body.categoryId,
        amount: body.amount,
        note: body.note ?? null,
      },
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
    });
    res.status(201).json(result);
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

export default router;
