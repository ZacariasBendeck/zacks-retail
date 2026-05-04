import { Router, type IRouter, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  addImportCharge,
  addGoodsInTransitRecord,
  addImportShipmentLine,
  applyImportInvoiceMatchSuggestions,
  approveImportShipmentLineInvoiceMatch,
  addImportContainer,
  addImportInvoiceLine,
  addImportSupplierInvoice,
  allocateImportLandedCost,
  createGoodsInTransitForShipment,
  createImportPurchaseOrderDraft,
  createImportShipment,
  getImportShipmentById,
  getImportShipmentReport,
  getImportLiquidationReadiness,
  getImportPurchaseOrderLinking,
  getImportReceivingHandoff,
  isImportManagementServiceError,
  linkImportInvoiceLineToPurchaseOrderLine,
  linkImportInvoiceLineToSku,
  listImportShipmentAuditEvents,
  listImportShipmentLineCandidates,
  listImportInvoiceMatchSuggestions,
  listImportOtbCommitments,
  listImportPayables,
  listImportShipments,
  markImportPayablePaid,
  markImportPayablesSent,
  matchImportShipmentLineInvoice,
  recordImportVerificationCheck,
  receiveImportShipmentEstimated,
  receiveImportShipmentFinal,
  removeImportShipmentLine,
  stageImportPayables,
  updateGoodsInTransitRecord,
  updateImportCharge,
  updateImportContainer,
  updateImportInvoiceLine,
  updateImportShipmentLine,
  updateImportShipmentStatus,
  updateImportSuggestedPriceStatus,
  updateImportSupplierInvoice,
  voidImportPayable,
} from '../services/importManagementService';
import {
  importWorkbook,
  isImportWorkbookServiceError,
  parseImportWorkbook,
} from '../services/importWorkbookService';
import type { ImportShipmentReport, ImportShipmentReportKey, ImportShipmentStatus } from '../models/importManagement';
import { PERMISSIONS } from '../services/employees/permissions';
import { sendXlsx, XLSX_NUMFMT } from '../utils/xlsxExport';

const router: IRouter = Router();

const workbookUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isXlsx =
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/octet-stream';
    if (!isXlsx) {
      cb(new Error('Only .xlsx workbook uploads are allowed.'));
      return;
    }
    cb(null, true);
  },
});

const sourceCurrencySchema = z.enum(['CNY', 'USD', 'HNL']);
const importInvoiceLineCostRoleSchema = z.enum([
  'FINISHED_GOOD',
  'MATERIAL',
  'CONVERSION',
  'ACCESSORY_COMPONENT',
  'RECEIPT_ACCESSORY',
  'EXPENSE',
]);
const importInvoiceLineReceiptPolicySchema = z.enum([
  'RECEIVE_TO_STOCK',
  'ROLL_TO_OUTPUT',
  'EXPENSE_ONLY',
  'IGNORE',
]);
const containerTypeSchema = z.enum(['CONTAINER', 'LOOSE_CARGO', 'CARTON_GROUP']);
const containerStatusSchema = z.enum(['PLANNED', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED', 'CANCELLED']);
const goodsInTransitStatusSchema = z.enum([
  'PENDING',
  'OWNED',
  'IN_TRANSIT',
  'RECEIVING_ESTIMATED',
  'RECEIVED_FINAL',
  'CLOSED',
  'CANCELLED',
]);
const chargeCostTreatmentSchema = z.enum(['ALLOCATE_TO_LANDED', 'INCLUDED_IN_COMMERCIAL_PRICE', 'EXCLUDE_FROM_LANDED']);
const shipmentLineStatusSchema = z.enum(['EXPECTED', 'MATCHED', 'CANCELLED']);
const purchaseOrderStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED']);
const shipmentStatusSchema = z.enum([
  'DRAFT',
  'REVIEWING_COSTS',
  'APPROVED_ESTIMATE',
  'IN_TRANSIT',
  'RECEIVING_ESTIMATED',
  'FINAL_LIQUIDATION',
  'RECEIVED_FINAL',
  'CLOSED',
  'CANCELLED',
]);
const suggestedPriceStatusSchema = z.enum(['SUGGESTED', 'APPROVED', 'REJECTED', 'POSTED']);
const verificationCheckStatusSchema = z.enum(['PENDING', 'PASS', 'WARN', 'FAIL']);
const importShipmentReportKeySchema = z.enum([
  'shipment-liquidation',
  'goods-in-transit',
  'expected-po-shipment',
  'landed-cost-allocation',
  'suggested-pricing-review',
  'ap-handoff',
]);
const reportFormatQuerySchema = z.object({
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
});

const moneySchema = z.object({
  sourceAmount: z.coerce.number().nonnegative(),
  sourceCurrency: sourceCurrencySchema,
  fxRate: z.coerce.number().positive(),
  fxDate: z.string().min(1),
  hnlAmount: z.coerce.number().nonnegative().optional(),
});

const createShipmentSchema = z.object({
  shipmentNumber: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(1),
  buyer: z.string().trim().optional().nullable(),
  originPort: z.string().trim().optional().nullable(),
  destinationPort: z.string().trim().optional().nullable(),
  carrier: z.string().trim().optional().nullable(),
  freightForwarder: z.string().trim().optional().nullable(),
  customsPolicyNumber: z.string().trim().optional().nullable(),
  blNumber: z.string().trim().optional().nullable(),
  expectedDepartureAt: z.string().optional().nullable(),
  expectedArrivalAt: z.string().optional().nullable(),
  actualArrivalAt: z.string().optional().nullable(),
  sourceWorkbookName: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const createSupplierInvoiceSchema = moneySchema.extend({
  invoiceNumber: z.string().trim().min(1),
  supplierCode: z.string().trim().optional().nullable(),
  supplierName: z.string().trim().min(1),
  invoiceDate: z.string().optional().nullable(),
  invoiceGroup: z.enum(['TAXABLE', 'NON_TAXABLE', 'MIXED']).optional(),
  invoiceKind: z.enum(['MERCHANDISE', 'FABRIC', 'CMT', 'ACCESSORY', 'OTHER']).optional(),
  notes: z.string().trim().optional().nullable(),
});
const updateSupplierInvoiceSchema = createSupplierInvoiceSchema;

const createInvoiceLineSchema = z.object({
  skuId: z.string().uuid().optional().nullable(),
  purchaseOrderLineId: z.string().uuid().optional().nullable(),
  lineNumber: z.coerce.number().int().positive().optional().nullable(),
  itemCode: z.string().trim().optional().nullable(),
  styleCode: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  materialMeters: z.coerce.number().nonnegative().optional().nullable(),
  cartonCount: z.coerce.number().nonnegative().optional().nullable(),
  weightKg: z.coerce.number().nonnegative().optional().nullable(),
  volumeCbm: z.coerce.number().nonnegative().optional().nullable(),
  quantity: z.coerce.number().positive(),
  unitOfMeasure: z.string().trim().optional().nullable(),
  sourceUnitCost: z.coerce.number().nonnegative().optional().nullable(),
  sourceAmount: z.coerce.number().nonnegative().optional(),
  sourceCurrency: sourceCurrencySchema.optional(),
  fxRate: z.coerce.number().positive().optional(),
  fxDate: z.string().optional(),
  hnlAmount: z.coerce.number().nonnegative().optional(),
  costRole: importInvoiceLineCostRoleSchema.optional(),
  receiptPolicy: importInvoiceLineReceiptPolicySchema.optional(),
  allocationGroupKey: z.string().trim().optional().nullable(),
  taxable: z.boolean().optional(),
});
const updateInvoiceLineSchema = createInvoiceLineSchema;

const createChargeSchema = moneySchema.extend({
  chargeType: z.enum(['FREIGHT', 'INSURANCE', 'DUTY', 'TAX', 'CUSTOMS_AGENCY', 'LOCAL_FREIGHT', 'OTHER']),
  counterparty: z.string().trim().optional().nullable(),
  documentNumber: z.string().trim().optional().nullable(),
  allocationBasis: z.literal('PRODUCT_COST_SHARE').optional(),
  costTreatment: chargeCostTreatmentSchema.optional(),
  taxable: z.boolean().optional(),
  estimated: z.boolean().optional(),
  final: z.boolean().optional(),
  notes: z.string().trim().optional().nullable(),
});
const updateChargeSchema = createChargeSchema;

const createContainerSchema = z.object({
  containerNumber: z.string().trim().optional().nullable(),
  containerType: containerTypeSchema.optional(),
  sealNumber: z.string().trim().optional().nullable(),
  cargoGroup: z.string().trim().optional().nullable(),
  status: containerStatusSchema.optional(),
  expectedArrivalAt: z.string().optional().nullable(),
  actualArrivalAt: z.string().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const updateContainerSchema = createContainerSchema.partial();

const createGoodsInTransitSchema = z.object({
  containerId: z.string().uuid().optional().nullable(),
  invoiceLineId: z.string().uuid().optional().nullable(),
  shipmentLineId: z.string().uuid().optional().nullable(),
  status: goodsInTransitStatusSchema.optional(),
  ownershipTransferAt: z.string().optional().nullable(),
  expectedReceiptAt: z.string().optional().nullable(),
  receivedAt: z.string().optional().nullable(),
  quantityInTransit: z.coerce.number().nonnegative().optional().nullable(),
  auditReason: z.string().trim().optional().nullable(),
});

const bulkGoodsInTransitSchema = z.object({
  containerId: z.string().uuid().optional().nullable(),
  status: goodsInTransitStatusSchema.optional(),
  ownershipTransferAt: z.string().optional().nullable(),
  expectedReceiptAt: z.string().optional().nullable(),
  auditReason: z.string().trim().optional().nullable(),
});

const updateGoodsInTransitSchema = z.object({
  containerId: z.string().uuid().optional().nullable(),
  shipmentLineId: z.string().uuid().optional().nullable(),
  status: goodsInTransitStatusSchema.optional(),
  ownershipTransferAt: z.string().optional().nullable(),
  expectedReceiptAt: z.string().optional().nullable(),
  receivedAt: z.string().optional().nullable(),
  quantityInTransit: z.coerce.number().nonnegative().optional().nullable(),
  auditReason: z.string().trim().optional().nullable(),
});

const statusUpdateSchema = z.object({
  status: shipmentStatusSchema,
  auditReason: z.string().trim().optional().nullable(),
  changedBy: z.string().trim().optional().nullable(),
});

const poUnitCostSourceSchema = z.enum(['BASE', 'LANDED']);

const optionalUuid = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().uuid().optional().nullable(),
);

const shipmentLineCandidateQuerySchema = z.object({
  q: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().optional(),
  ),
  vendorCode: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().optional(),
  ),
  buyer: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().optional(),
  ),
  sourceCurrency: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    sourceCurrencySchema.optional(),
  ),
  incotermCode: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().optional(),
  ),
  poStatus: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    purchaseOrderStatusSchema.optional(),
  ),
});

const addImportShipmentLineSchema = z.object({
  purchaseOrderLineId: z.string().uuid(),
  containerId: optionalUuid,
  expectedQuantity: z.coerce.number().positive().optional().nullable(),
  estimatedLandedUnitCostHnl: z.coerce.number().nonnegative().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const updateImportShipmentLineSchema = z.object({
  containerId: optionalUuid,
  expectedQuantity: z.coerce.number().positive().optional().nullable(),
  estimatedLandedUnitCostHnl: z.coerce.number().nonnegative().optional().nullable(),
  status: shipmentLineStatusSchema.optional(),
  notes: z.string().trim().optional().nullable(),
});

const matchShipmentLineInvoiceSchema = z.object({
  invoiceLineId: optionalUuid,
});

const approveShipmentLineInvoiceMatchSchema = z.object({
  approved: z.boolean(),
  approvedBy: z.string().trim().optional().nullable(),
  reason: z.string().trim().optional().nullable(),
});

const applyInvoiceMatchSuggestionsSchema = z.object({
  minScore: z.coerce.number().min(0).max(100).optional().nullable(),
  allowWarnings: z.boolean().optional(),
  shipmentLineIds: z.array(z.string().uuid()).optional().nullable(),
});

const createPurchaseOrderDraftSchema = z.object({
  vendorCode: z.string().trim().min(1).max(4),
  supplierInvoiceId: optionalUuid,
  poNumber: z.string().trim().max(32).optional().nullable(),
  billToStoreId: z.coerce.number().int().positive().optional().nullable(),
  shipToStoreId: z.coerce.number().int().positive().optional().nullable(),
  buyer: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  unitCostSource: poUnitCostSourceSchema.optional(),
  createdBy: z.string().trim().optional().nullable(),
});

const linkPurchaseOrderLineSchema = z.object({
  purchaseOrderLineId: optionalUuid,
});

const linkSkuSchema = z.object({
  skuId: optionalUuid,
  skuCode: z.string().trim().optional().nullable(),
});

const allocationSchema = z.object({
  markupFactor: z.coerce.number().positive().optional().nullable(),
});

const suggestedPriceStatusUpdateSchema = z.object({
  approvalStatus: suggestedPriceStatusSchema,
  changedBy: z.string().trim().optional().nullable(),
});

const markPayablesSentSchema = z.object({
  apReference: z.string().trim().optional().nullable(),
  changedBy: z.string().trim().optional().nullable(),
});

const markPayablePaidSchema = z.object({
  paymentReference: z.string().trim().optional().nullable(),
  paidAt: z.string().optional().nullable(),
  changedBy: z.string().trim().optional().nullable(),
});

const voidPayableSchema = z.object({
  reason: z.string().trim().min(1),
  changedBy: z.string().trim().optional().nullable(),
});

const recordVerificationCheckSchema = z.object({
  checkCode: z.string().trim().min(1).max(96),
  status: verificationCheckStatusSchema,
  expectedHnlAmount: z.coerce.number().nullable().optional(),
  actualHnlAmount: z.coerce.number().nullable().optional(),
  varianceHnlAmount: z.coerce.number().nullable().optional(),
  message: z.string().trim().optional().nullable(),
});

const receiveImportShipmentSchema = z.object({
  locationId: z.string().trim().optional().nullable(),
  receivedAt: z.string().optional().nullable(),
  auditReason: z.string().trim().optional().nullable(),
  changedBy: z.string().trim().optional().nullable(),
  containerId: optionalUuid,
  shipmentLineIds: z.array(z.string().uuid()).optional().nullable(),
  goodsInTransitRecordIds: z.array(z.string().uuid()).optional().nullable(),
});

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);
const optionalNumber = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().positive().optional(),
);

const workbookOptionsSchema = z.object({
  defaultFxRate: optionalNumber,
  defaultFxDate: optionalString,
  shipmentNumber: optionalString,
  displayName: optionalString,
  sourceCurrency: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    sourceCurrencySchema.optional(),
  ),
  markupFactor: optionalNumber,
});

const monthKeySchema = z.string()
  .regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM.')
  .refine((value) => {
    const month = Number(value.slice(5, 7));
    return month >= 1 && month <= 12;
  }, 'Month must be between 01 and 12.');
const otbCommitmentsQuerySchema = z.object({
  buyer: optionalString,
  monthFrom: monthKeySchema.optional(),
  monthTo: monthKeySchema.optional(),
  departmentNumber: z.coerce.number().int().positive().optional(),
  categoryNumber: z.coerce.number().int().positive().optional(),
}).refine(
  (value) => !value.monthFrom || !value.monthTo || value.monthFrom <= value.monthTo,
  { path: ['monthFrom'], message: 'monthFrom must be before or equal to monthTo.' },
);

function actorFromRequest(req: Request): string | null {
  const user = (req as Request & { user?: { id?: string; email?: string; displayName?: string } }).user;
  return user?.displayName?.trim() || user?.email?.trim() || user?.id || null;
}

function requireRequestPermission(req: Request, res: Response, permission: string): boolean {
  if (!req.user) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
    return false;
  }
  if (!req.permissions?.has(permission)) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: `Missing permission: ${permission}`,
      },
    });
    return false;
  }
  return true;
}

function requireEstimatedReceivingPermission(req: Request, res: Response): boolean {
  return requireRequestPermission(req, res, PERMISSIONS.IMPORT_MANAGEMENT_RECEIVE_ESTIMATED);
}

function requireFinalLiquidationPermission(req: Request, res: Response): boolean {
  return requireRequestPermission(req, res, PERMISSIONS.IMPORT_MANAGEMENT_FINAL_LIQUIDATION);
}

function requireCostOverridePermission(req: Request, res: Response): boolean {
  return requireRequestPermission(req, res, PERMISSIONS.IMPORT_MANAGEMENT_COST_OVERRIDE);
}

function requireMismatchApprovalPermission(req: Request, res: Response): boolean {
  return requireRequestPermission(req, res, PERMISSIONS.IMPORT_MANAGEMENT_APPROVE_MISMATCH);
}

function isFinalLiquidationStatus(status: ImportShipmentStatus): boolean {
  return ['FINAL_LIQUIDATION', 'RECEIVED_FINAL', 'CLOSED'].includes(status);
}

function touchesImportCost(payload: Record<string, unknown>, fields: string[]): boolean {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(payload, field));
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.errors[0]?.message ?? 'Invalid input.' } });
    return;
  }
  if (isImportManagementServiceError(err)) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (isImportWorkbookServiceError(err)) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
}

function escapeCsv(value: unknown): string {
  if (value == null) return '';
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function sendImportReportCsv(res: Response, report: ImportShipmentReport): void {
  const header = report.columns.map((column) => escapeCsv(column.header)).join(',');
  const rows = report.rows.map((row) =>
    report.columns.map((column) => escapeCsv(row[column.key])).join(','),
  );
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${report.filenameBase}.csv"`);
  res.send([header, ...rows].join('\n'));
}

async function sendImportReportXlsx(res: Response, report: ImportShipmentReport): Promise<void> {
  await sendXlsx(res, {
    filename: `${report.filenameBase}.xlsx`,
    sheets: [{
      name: report.sheetName,
      columns: report.columns.map((column) => ({
        header: column.header,
        key: column.key,
        width: column.width,
        numFmt: column.numFmt ? XLSX_NUMFMT[column.numFmt] : undefined,
      })),
      rows: report.rows,
    }],
  });
}

router.post('/workbooks/preview', workbookUpload.single('workbook'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: { code: 'MISSING_WORKBOOK', message: 'Upload an .xlsx workbook.' } });
      return;
    }
    const payload = workbookOptionsSchema.parse(req.body ?? {});
    const result = await parseImportWorkbook(req.file.buffer, req.file.originalname, payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});
const auditEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

router.post('/workbooks/import', workbookUpload.single('workbook'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: { code: 'MISSING_WORKBOOK', message: 'Upload an .xlsx workbook.' } });
      return;
    }
    if (!requireCostOverridePermission(req, res)) return;
    const payload = workbookOptionsSchema.parse(req.body ?? {});
    const result = await importWorkbook(req.file.buffer, req.file.originalname, payload, actorFromRequest(req));
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/shipments', async (req: Request, res: Response) => {
  try {
    const rawPage = Number(req.query.page ?? 1);
    const rawPageSize = Number(req.query.pageSize ?? 25);
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const status = statusRaw ? shipmentStatusSchema.parse(statusRaw) : undefined;
    const result = await listImportShipments({
      page: Number.isFinite(rawPage) ? rawPage : 1,
      pageSize: Number.isFinite(rawPageSize) ? rawPageSize : 25,
      status: status as ImportShipmentStatus | undefined,
      q,
    });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/otb-commitments', async (req: Request, res: Response) => {
  try {
    const payload = otbCommitmentsQuerySchema.parse(req.query ?? {});
    const result = await listImportOtbCommitments(payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments', async (req: Request, res: Response) => {
  try {
    const payload = createShipmentSchema.parse(req.body);
    const result = await createImportShipment(payload, actorFromRequest(req));
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/shipments/:shipmentId', async (req: Request, res: Response) => {
  try {
    const result = await getImportShipmentById(String(req.params.shipmentId ?? ''));
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Import shipment not found.' } });
      return;
    }
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/shipments/:shipmentId/liquidation-readiness', async (req: Request, res: Response) => {
  try {
    const result = await getImportLiquidationReadiness(String(req.params.shipmentId ?? ''));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/shipments/:shipmentId/payables', async (req: Request, res: Response) => {
  try {
    const result = await listImportPayables(String(req.params.shipmentId ?? ''));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/shipments/:shipmentId/audit-events', async (req: Request, res: Response) => {
  try {
    const payload = auditEventsQuerySchema.parse(req.query ?? {});
    const events = await listImportShipmentAuditEvents(String(req.params.shipmentId ?? ''), payload.limit);
    res.json({ events });
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/shipments/:shipmentId/reports/:reportKey', async (req: Request, res: Response) => {
  try {
    const reportKey = importShipmentReportKeySchema.parse(req.params.reportKey) as ImportShipmentReportKey;
    const { format } = reportFormatQuerySchema.parse(req.query ?? {});
    const report = await getImportShipmentReport(String(req.params.shipmentId ?? ''), reportKey);
    if (format === 'csv') {
      sendImportReportCsv(res, report);
      return;
    }
    if (format === 'xlsx') {
      await sendImportReportXlsx(res, report);
      return;
    }
    res.json(report);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/shipments/:shipmentId/receiving-handoff', async (req: Request, res: Response) => {
  try {
    const result = await getImportReceivingHandoff(String(req.params.shipmentId ?? ''));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/shipments/:shipmentId/po-line-candidates', async (req: Request, res: Response) => {
  try {
    const payload = shipmentLineCandidateQuerySchema.parse(req.query ?? {});
    const result = await listImportShipmentLineCandidates(String(req.params.shipmentId ?? ''), payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/shipments/:shipmentId/invoice-match-suggestions', async (req: Request, res: Response) => {
  try {
    const result = await listImportInvoiceMatchSuggestions(String(req.params.shipmentId ?? ''));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/invoice-match-suggestions/apply', async (req: Request, res: Response) => {
  try {
    const payload = applyInvoiceMatchSuggestionsSchema.parse(req.body ?? {});
    const result = await applyImportInvoiceMatchSuggestions(String(req.params.shipmentId ?? ''), payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/shipment-lines', async (req: Request, res: Response) => {
  try {
    const payload = addImportShipmentLineSchema.parse(req.body ?? {});
    if (
      touchesImportCost(payload as unknown as Record<string, unknown>, ['estimatedLandedUnitCostHnl']) &&
      !requireCostOverridePermission(req, res)
    ) return;
    const result = await addImportShipmentLine(String(req.params.shipmentId ?? ''), payload);
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/shipment-lines/:shipmentLineId', async (req: Request, res: Response) => {
  try {
    const payload = updateImportShipmentLineSchema.parse(req.body ?? {});
    if (
      touchesImportCost(payload as unknown as Record<string, unknown>, ['estimatedLandedUnitCostHnl']) &&
      !requireCostOverridePermission(req, res)
    ) return;
    const result = await updateImportShipmentLine(String(req.params.shipmentLineId ?? ''), payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.delete('/shipment-lines/:shipmentLineId', async (req: Request, res: Response) => {
  try {
    const result = await removeImportShipmentLine(String(req.params.shipmentLineId ?? ''));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/shipment-lines/:shipmentLineId/invoice-line', async (req: Request, res: Response) => {
  try {
    const payload = matchShipmentLineInvoiceSchema.parse(req.body ?? {});
    const result = await matchImportShipmentLineInvoice(String(req.params.shipmentLineId ?? ''), payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/shipment-lines/:shipmentLineId/invoice-match-approval', async (req: Request, res: Response) => {
  try {
    if (!requireMismatchApprovalPermission(req, res)) return;
    const payload = approveShipmentLineInvoiceMatchSchema.parse(req.body ?? {});
    const result = await approveImportShipmentLineInvoiceMatch(
      String(req.params.shipmentLineId ?? ''),
      payload,
      actorFromRequest(req),
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/shipments/:shipmentId/purchase-order-linking', async (req: Request, res: Response) => {
  try {
    const result = await getImportPurchaseOrderLinking(String(req.params.shipmentId ?? ''));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/purchase-order-draft', async (req: Request, res: Response) => {
  try {
    const payload = createPurchaseOrderDraftSchema.parse(req.body ?? {});
    const result = await createImportPurchaseOrderDraft(
      String(req.params.shipmentId ?? ''),
      payload,
      actorFromRequest(req),
    );
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/invoice-lines/:invoiceLineId/purchase-order-line', async (req: Request, res: Response) => {
  try {
    const payload = linkPurchaseOrderLineSchema.parse(req.body ?? {});
    const result = await linkImportInvoiceLineToPurchaseOrderLine(String(req.params.invoiceLineId ?? ''), payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/invoice-lines/:invoiceLineId/sku', async (req: Request, res: Response) => {
  try {
    const payload = linkSkuSchema.parse(req.body ?? {});
    const result = await linkImportInvoiceLineToSku(String(req.params.invoiceLineId ?? ''), payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/receiving-handoff/receive-estimated', async (req: Request, res: Response) => {
  try {
    if (!requireEstimatedReceivingPermission(req, res)) return;
    const payload = receiveImportShipmentSchema.parse(req.body ?? {});
    const result = await receiveImportShipmentEstimated(String(req.params.shipmentId ?? ''), payload, actorFromRequest(req));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/receiving-handoff/receive-final', async (req: Request, res: Response) => {
  try {
    if (!requireFinalLiquidationPermission(req, res)) return;
    const payload = receiveImportShipmentSchema.parse(req.body ?? {});
    const result = await receiveImportShipmentFinal(String(req.params.shipmentId ?? ''), payload, actorFromRequest(req));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/payables/stage', async (req: Request, res: Response) => {
  try {
    const result = await stageImportPayables(String(req.params.shipmentId ?? ''), actorFromRequest(req));
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/payables/mark-sent', async (req: Request, res: Response) => {
  try {
    const payload = markPayablesSentSchema.parse(req.body ?? {});
    const result = await markImportPayablesSent(String(req.params.shipmentId ?? ''), payload, actorFromRequest(req));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/payables/:handoffId/mark-paid', async (req: Request, res: Response) => {
  try {
    const payload = markPayablePaidSchema.parse(req.body ?? {});
    const result = await markImportPayablePaid(String(req.params.handoffId ?? ''), payload, actorFromRequest(req));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/payables/:handoffId/void', async (req: Request, res: Response) => {
  try {
    const payload = voidPayableSchema.parse(req.body ?? {});
    const result = await voidImportPayable(String(req.params.handoffId ?? ''), payload, actorFromRequest(req));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/verification-checks', async (req: Request, res: Response) => {
  try {
    const payload = recordVerificationCheckSchema.parse(req.body ?? {});
    const result = await recordImportVerificationCheck(String(req.params.shipmentId ?? ''), payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/shipments/:shipmentId/status', async (req: Request, res: Response) => {
  try {
    const payload = statusUpdateSchema.parse(req.body);
    if (payload.status === 'RECEIVING_ESTIMATED' && !requireEstimatedReceivingPermission(req, res)) return;
    if (isFinalLiquidationStatus(payload.status as ImportShipmentStatus) && !requireFinalLiquidationPermission(req, res)) return;
    const result = await updateImportShipmentStatus(String(req.params.shipmentId ?? ''), payload, actorFromRequest(req));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/supplier-invoices', async (req: Request, res: Response) => {
  try {
    const payload = createSupplierInvoiceSchema.parse(req.body);
    if (!requireCostOverridePermission(req, res)) return;
    const result = await addImportSupplierInvoice(String(req.params.shipmentId ?? ''), payload);
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/supplier-invoices/:invoiceId/lines', async (req: Request, res: Response) => {
  try {
    const payload = createInvoiceLineSchema.parse(req.body);
    if (!requireCostOverridePermission(req, res)) return;
    const result = await addImportInvoiceLine(String(req.params.invoiceId ?? ''), payload);
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/supplier-invoices/:invoiceId', async (req: Request, res: Response) => {
  try {
    const payload = updateSupplierInvoiceSchema.parse(req.body);
    if (!requireCostOverridePermission(req, res)) return;
    const result = await updateImportSupplierInvoice(String(req.params.invoiceId ?? ''), payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/invoice-lines/:invoiceLineId', async (req: Request, res: Response) => {
  try {
    const payload = updateInvoiceLineSchema.parse(req.body);
    if (!requireCostOverridePermission(req, res)) return;
    const result = await updateImportInvoiceLine(String(req.params.invoiceLineId ?? ''), payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/charges', async (req: Request, res: Response) => {
  try {
    const payload = createChargeSchema.parse(req.body);
    if (!requireCostOverridePermission(req, res)) return;
    const result = await addImportCharge(String(req.params.shipmentId ?? ''), payload);
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/charges/:chargeId', async (req: Request, res: Response) => {
  try {
    const payload = updateChargeSchema.parse(req.body);
    if (!requireCostOverridePermission(req, res)) return;
    const result = await updateImportCharge(String(req.params.chargeId ?? ''), payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/containers', async (req: Request, res: Response) => {
  try {
    const payload = createContainerSchema.parse(req.body);
    const result = await addImportContainer(String(req.params.shipmentId ?? ''), payload);
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/containers/:containerId', async (req: Request, res: Response) => {
  try {
    const payload = updateContainerSchema.parse(req.body);
    const result = await updateImportContainer(String(req.params.containerId ?? ''), payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/goods-in-transit', async (req: Request, res: Response) => {
  try {
    const payload = createGoodsInTransitSchema.parse(req.body);
    if (payload.status === 'RECEIVING_ESTIMATED' && !requireEstimatedReceivingPermission(req, res)) return;
    const result = await addGoodsInTransitRecord(String(req.params.shipmentId ?? ''), payload);
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/goods-in-transit/from-lines', async (req: Request, res: Response) => {
  try {
    const payload = bulkGoodsInTransitSchema.parse(req.body ?? {});
    if (payload.status === 'RECEIVING_ESTIMATED' && !requireEstimatedReceivingPermission(req, res)) return;
    const result = await createGoodsInTransitForShipment(String(req.params.shipmentId ?? ''), payload);
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/goods-in-transit/:recordId', async (req: Request, res: Response) => {
  try {
    const payload = updateGoodsInTransitSchema.parse(req.body);
    if (payload.status === 'RECEIVING_ESTIMATED' && !requireEstimatedReceivingPermission(req, res)) return;
    const result = await updateGoodsInTransitRecord(String(req.params.recordId ?? ''), payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/suggested-prices/:suggestedPriceId/status', async (req: Request, res: Response) => {
  try {
    const payload = suggestedPriceStatusUpdateSchema.parse(req.body);
    if (payload.approvalStatus === 'POSTED' && !requireRequestPermission(req, res, PERMISSIONS.PRODUCTS_WRITE)) return;
    const result = await updateImportSuggestedPriceStatus(
      String(req.params.suggestedPriceId ?? ''),
      payload,
      actorFromRequest(req),
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/shipments/:shipmentId/allocate-landed-cost', async (req: Request, res: Response) => {
  try {
    const payload = allocationSchema.parse(req.body ?? {});
    if (!requireCostOverridePermission(req, res)) return;
    const result = await allocateImportLandedCost(String(req.params.shipmentId ?? ''), payload);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

export default router;
