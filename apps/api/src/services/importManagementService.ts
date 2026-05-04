import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db/prisma';
import {
  listPlatformAuditEvents,
  recordPlatformAuditEvent,
  type PlatformAuditEvent,
} from './platformAuditService';
import type {
  AllocateImportLandedCostInput,
  ApplyImportInvoiceMatchSuggestionsInput,
  ApplyImportInvoiceMatchSuggestionsResult,
  AddImportShipmentLineInput,
  ApproveImportShipmentLineInvoiceMatchInput,
  CreateGoodsInTransitForShipmentInput,
  CreateGoodsInTransitForShipmentResult,
  CreateGoodsInTransitRecordInput,
  CreateImportChargeInput,
  CreateImportContainerInput,
  CreateImportInvoiceLineInput,
  CreateImportPurchaseOrderDraftInput,
  CreateImportPurchaseOrderDraftResult,
  CreateImportShipmentInput,
  CreateImportSupplierInvoiceInput,
  GoodsInTransitStatus,
  ImportAllocationResult,
  ImportChargeCostTreatment,
  ImportChargeRecord,
  ImportChargeType,
  ImportCostBuildRecord,
  ImportCostBuildPreviewComponent,
  ImportCostBuildPreviewOutput,
  ImportCostBuildPreviewRecord,
  ImportCostComponentAllocationRecord,
  ImportContainerRecord,
  ImportContainerStatus,
  ImportContainerType,
  ImportInvoiceGroup,
  ImportInvoiceKind,
  ImportInvoiceLineCostRole,
  ImportInvoiceMatchSuggestion,
  ImportInvoiceLineRecord,
  ImportInvoiceLineReceiptPolicy,
  ImportLandedCostAllocationRecord,
  ImportLiquidationReadiness,
  ImportLiquidationReadinessCheck,
  ImportOtbCommitmentRecord,
  ImportOtbCommitmentSummary,
  ImportOtbCommitmentsEnvelope,
  ImportOtbCommitmentsParams,
  ImportPayableHandoffStatus,
  ImportPayableRecord,
  ImportPayablesEnvelope,
  ImportPayableSourceType,
  ImportPoUnitCostSource,
  ImportPostedInventoryReceipt,
  ImportPostedInventoryTrueUp,
  ImportPostedPurchaseOrderReceipt,
  ImportPurchaseOrderLinkingEnvelope,
  ImportPurchaseOrderLinkLine,
  ImportReceivingActionResult,
  ImportReceivingAuditSummary,
  ImportReceivingCostBasis,
  ImportReceivingHandoffEnvelope,
  ImportReceivingHandoffLine,
  ImportReceivingInventoryReceiptAuditRecord,
  ImportReceivingInventoryTrueUpAuditRecord,
  ImportReceivingPurchaseOrderReceiptAuditRecord,
  ImportShipmentReport,
  ImportShipmentReportColumn,
  ImportShipmentReportKey,
  ImportShipmentDetail,
  ImportShipmentListEnvelope,
  ImportShipmentLineCandidate,
  ImportShipmentLineRecord,
  ImportShipmentLineStatus,
  ImportShipmentListParams,
  ImportShipmentStatus,
  ImportShipmentSummary,
  ImportSourceCurrency,
  ImportSuggestedPriceApprovalStatus,
  ImportSuggestedPriceRecord,
  ImportSupplierInvoiceRecord,
  ImportVerificationCheckRecord,
  LinkImportInvoiceLineToPoInput,
  LinkImportInvoiceLineToSkuInput,
  MarkImportPayablePaidInput,
  MarkImportPayablesSentInput,
  MatchImportShipmentLineInvoiceInput,
  ReceiveImportShipmentInput,
  StageImportPayablesResult,
  UpdateGoodsInTransitRecordInput,
  UpdateImportChargeInput,
  UpdateImportContainerInput,
  UpdateImportInvoiceLineInput,
  UpdateImportShipmentLineInput,
  UpdateImportShipmentStatusInput,
  UpdateImportSuggestedPriceStatusInput,
  UpdateImportSupplierInvoiceInput,
  VoidImportPayableInput,
  GoodsInTransitRecordDto,
} from '../models/importManagement';

type SqlClient = Pick<typeof prisma, '$queryRawUnsafe' | '$executeRawUnsafe'>;

class ImportManagementServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isImportManagementServiceError(err: unknown): err is ImportManagementServiceError {
  return err instanceof ImportManagementServiceError;
}

const SOURCE_CURRENCIES = new Set<ImportSourceCurrency>(['CNY', 'USD', 'HNL']);
const INVOICE_LINE_COST_ROLES = new Set<ImportInvoiceLineCostRole>([
  'FINISHED_GOOD',
  'MATERIAL',
  'CONVERSION',
  'ACCESSORY_COMPONENT',
  'RECEIPT_ACCESSORY',
  'EXPENSE',
]);
const INVOICE_LINE_RECEIPT_POLICIES = new Set<ImportInvoiceLineReceiptPolicy>([
  'RECEIVE_TO_STOCK',
  'ROLL_TO_OUTPUT',
  'EXPENSE_ONLY',
  'IGNORE',
]);
const CHARGE_TYPES = new Set<ImportChargeType>([
  'FREIGHT',
  'INSURANCE',
  'DUTY',
  'TAX',
  'CUSTOMS_AGENCY',
  'LOCAL_FREIGHT',
  'OTHER',
]);
const CHARGE_COST_TREATMENTS = new Set<ImportChargeCostTreatment>([
  'ALLOCATE_TO_LANDED',
  'INCLUDED_IN_COMMERCIAL_PRICE',
  'EXCLUDE_FROM_LANDED',
]);
const SHIPMENT_LINE_STATUSES = new Set<ImportShipmentLineStatus>(['EXPECTED', 'MATCHED', 'CANCELLED']);
const CONTAINER_TYPES = new Set<ImportContainerType>(['CONTAINER', 'LOOSE_CARGO', 'CARTON_GROUP']);
const CONTAINER_STATUSES = new Set<ImportContainerStatus>([
  'PLANNED',
  'LOADED',
  'IN_TRANSIT',
  'ARRIVED',
  'RECEIVED',
  'CANCELLED',
]);
const GOODS_IN_TRANSIT_STATUSES = new Set<GoodsInTransitStatus>([
  'PENDING',
  'OWNED',
  'IN_TRANSIT',
  'RECEIVING_ESTIMATED',
  'RECEIVED_FINAL',
  'CLOSED',
  'CANCELLED',
]);
const SHIPMENT_STATUSES = new Set<ImportShipmentStatus>([
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
const SUGGESTED_PRICE_STATUSES = new Set<ImportSuggestedPriceApprovalStatus>([
  'SUGGESTED',
  'APPROVED',
  'REJECTED',
  'POSTED',
]);

const NEXT_STATUSES: Record<ImportShipmentStatus, ImportShipmentStatus[]> = {
  DRAFT: ['REVIEWING_COSTS', 'CANCELLED'],
  REVIEWING_COSTS: ['APPROVED_ESTIMATE', 'FINAL_LIQUIDATION', 'CANCELLED'],
  APPROVED_ESTIMATE: ['IN_TRANSIT', 'RECEIVING_ESTIMATED', 'FINAL_LIQUIDATION', 'CANCELLED'],
  IN_TRANSIT: ['RECEIVING_ESTIMATED', 'FINAL_LIQUIDATION', 'CANCELLED'],
  RECEIVING_ESTIMATED: ['FINAL_LIQUIDATION', 'CANCELLED'],
  FINAL_LIQUIDATION: ['RECEIVED_FINAL', 'CANCELLED'],
  RECEIVED_FINAL: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};
const FINAL_LIQUIDATION_STATUSES = new Set<ImportShipmentStatus>(['FINAL_LIQUIDATION', 'RECEIVED_FINAL', 'CLOSED']);
const OTB_COMMITMENT_STATUSES: ImportShipmentStatus[] = [
  'APPROVED_ESTIMATE',
  'IN_TRANSIT',
  'RECEIVING_ESTIMATED',
  'FINAL_LIQUIDATION',
  'RECEIVED_FINAL',
  'CLOSED',
];

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === 'bigint') return Number(value);
  const maybeDecimal = value as { toString?: () => string };
  const n = Number(maybeDecimal.toString?.() ?? value);
  return Number.isFinite(n) ? n : 0;
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : toNumber(value);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function calculateImportInventoryTrueUp(input: {
  quantity: number;
  estimatedUnitCostHnl: number;
  finalUnitCostHnl: number;
}): { deltaUnitCostHnl: number; deltaHnlAmount: number; hasAdjustment: boolean } {
  const roundedDeltaUnit = round4(input.finalUnitCostHnl - input.estimatedUnitCostHnl);
  const roundedDeltaAmount = round2(input.quantity * roundedDeltaUnit);
  const deltaUnitCostHnl = Object.is(roundedDeltaUnit, -0) ? 0 : roundedDeltaUnit;
  const deltaHnlAmount = Object.is(roundedDeltaAmount, -0) ? 0 : roundedDeltaAmount;
  return {
    deltaUnitCostHnl,
    deltaHnlAmount,
    hasAdjustment: Math.abs(deltaHnlAmount) >= 0.01,
  };
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function fromCents(value: number): number {
  return value / 100;
}

function dateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function monthKey(value: unknown): string | null {
  const date = dateOnly(value);
  return date ? date.slice(0, 7) : null;
}

function dateTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function nullableDateTime(value: unknown): string | null {
  return value == null ? null : dateTime(value);
}

function cleanString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function recordImportAudit(input: {
  action: string;
  resourceType: string;
  resourceId: string | null;
  actor?: string | null;
  reason?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  metadataJson?: Record<string, unknown>;
}): Promise<void> {
  await recordPlatformAuditEvent(prisma, {
    eventType: 'import_management',
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    reason: cleanString(input.reason),
    beforeJson: input.beforeJson,
    afterJson: input.afterJson,
    metadataJson: {
      ...(input.metadataJson ?? {}),
      actor: cleanString(input.actor),
    },
  });
}

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function requiredString(value: string | null | undefined, field: string): string {
  const trimmed = cleanString(value);
  if (!trimmed) {
    throw new ImportManagementServiceError(422, 'INVALID_INPUT', `${field} is required.`);
  }
  return trimmed;
}

function normalizeDate(value: string | null | undefined, field: string, fallback?: string): string {
  const raw = value ?? fallback;
  if (!raw) {
    throw new ImportManagementServiceError(422, 'INVALID_INPUT', `${field} is required.`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new ImportManagementServiceError(422, 'INVALID_INPUT', `${field} must be a valid date.`);
  }
  return parsed.toISOString().slice(0, 10);
}

function optionalDate(value: string | null | undefined, field: string): string | null {
  if (!value) return null;
  return normalizeDate(value, field);
}

interface NormalizedMoney {
  sourceAmount: number;
  sourceCurrency: ImportSourceCurrency;
  fxRate: number;
  fxDate: string;
  hnlAmount: number;
}

function normalizeMoney(input: {
  sourceAmount: number;
  sourceCurrency: ImportSourceCurrency;
  fxRate: number;
  fxDate: string;
  hnlAmount?: number | null;
}): NormalizedMoney {
  if (!SOURCE_CURRENCIES.has(input.sourceCurrency)) {
    throw new ImportManagementServiceError(422, 'INVALID_CURRENCY', 'sourceCurrency must be CNY, USD, or HNL.');
  }
  if (!Number.isFinite(input.sourceAmount) || input.sourceAmount < 0) {
    throw new ImportManagementServiceError(422, 'INVALID_AMOUNT', 'sourceAmount must be a non-negative number.');
  }
  if (!Number.isFinite(input.fxRate) || input.fxRate <= 0) {
    throw new ImportManagementServiceError(422, 'INVALID_FX_RATE', 'fxRate must be greater than zero.');
  }
  if (input.sourceCurrency === 'HNL' && Math.abs(input.fxRate - 1) > 0.000001) {
    throw new ImportManagementServiceError(422, 'INVALID_FX_RATE', 'HNL source amounts must use fxRate 1.');
  }
  const fxDate = normalizeDate(input.fxDate, 'fxDate');
  const computedHnl = round2(input.sourceAmount * input.fxRate);
  const hnlAmount = input.hnlAmount == null ? computedHnl : round2(input.hnlAmount);
  if (Math.abs(hnlAmount - computedHnl) > 0.01) {
    throw new ImportManagementServiceError(
      422,
      'HNL_AMOUNT_MISMATCH',
      'hnlAmount must equal sourceAmount multiplied by fxRate.',
    );
  }
  return {
    sourceAmount: round4(input.sourceAmount),
    sourceCurrency: input.sourceCurrency,
    fxRate: input.fxRate,
    fxDate,
    hnlAmount,
  };
}

function normalizeImportInvoiceLineCostRole(value?: ImportInvoiceLineCostRole | null): ImportInvoiceLineCostRole {
  if (value == null) return 'FINISHED_GOOD';
  if (!INVOICE_LINE_COST_ROLES.has(value)) {
    throw new ImportManagementServiceError(422, 'INVALID_COST_ROLE', 'Invalid import invoice line costRole.');
  }
  return value;
}

function defaultReceiptPolicyForCostRole(costRole: ImportInvoiceLineCostRole): ImportInvoiceLineReceiptPolicy {
  if (costRole === 'MATERIAL' || costRole === 'CONVERSION' || costRole === 'ACCESSORY_COMPONENT') {
    return 'ROLL_TO_OUTPUT';
  }
  if (costRole === 'EXPENSE') return 'EXPENSE_ONLY';
  return 'RECEIVE_TO_STOCK';
}

function normalizeImportInvoiceLineReceiptPolicy(
  value: ImportInvoiceLineReceiptPolicy | null | undefined,
  costRole: ImportInvoiceLineCostRole,
): ImportInvoiceLineReceiptPolicy {
  if (value == null) return defaultReceiptPolicyForCostRole(costRole);
  if (!INVOICE_LINE_RECEIPT_POLICIES.has(value)) {
    throw new ImportManagementServiceError(422, 'INVALID_RECEIPT_POLICY', 'Invalid import invoice line receiptPolicy.');
  }
  return value;
}

function normalizeImportInvoiceLineRoleState(input: {
  costRole?: ImportInvoiceLineCostRole | null;
  receiptPolicy?: ImportInvoiceLineReceiptPolicy | null;
}): { costRole: ImportInvoiceLineCostRole; receiptPolicy: ImportInvoiceLineReceiptPolicy } {
  const costRole = normalizeImportInvoiceLineCostRole(input.costRole);
  return {
    costRole,
    receiptPolicy: normalizeImportInvoiceLineReceiptPolicy(input.receiptPolicy, costRole),
  };
}

function mapCostRole(value: unknown): ImportInvoiceLineCostRole {
  return INVOICE_LINE_COST_ROLES.has(value as ImportInvoiceLineCostRole)
    ? value as ImportInvoiceLineCostRole
    : 'FINISHED_GOOD';
}

function mapReceiptPolicy(value: unknown, costRole: ImportInvoiceLineCostRole): ImportInvoiceLineReceiptPolicy {
  return INVOICE_LINE_RECEIPT_POLICIES.has(value as ImportInvoiceLineReceiptPolicy)
    ? value as ImportInvoiceLineReceiptPolicy
    : defaultReceiptPolicyForCostRole(costRole);
}

function isReceiptablePolicy(value: unknown): boolean {
  return value === 'RECEIVE_TO_STOCK';
}

interface ProductCostShareLineInput {
  id: string;
  hnlAmount: number;
  quantity: number;
  skuId?: string | null;
}

interface ProductCostShareChargeInput {
  id: string;
  hnlAmount: number;
}

export interface ComponentCostRollupLineInput {
  id: string;
  hnlAmount: number;
  quantity: number;
  receiptPolicy: ImportInvoiceLineReceiptPolicy;
  allocationGroupKey?: string | null;
}

export interface ComponentCostRollupAllocation {
  componentLineId: string;
  outputLineId: string;
  allocationGroupKey: string;
  allocatedHnlAmount: number;
}

export interface ComponentCostRollupLineTotal {
  outputLineId: string;
  allocationGroupKey: string | null;
  componentAllocatedCostHnl: number;
  commercialLineCostHnl: number;
  commercialUnitCostHnl: number;
}

export interface ComponentCostRollupWarning {
  componentLineId: string;
  allocationGroupKey: string | null;
  hnlAmount: number;
  reason: string;
}

export function rollupComponentCostsByGroup(
  lines: ComponentCostRollupLineInput[],
): {
  allocations: ComponentCostRollupAllocation[];
  lineTotals: ComponentCostRollupLineTotal[];
  warnings: ComponentCostRollupWarning[];
} {
  const outputs = lines.filter((line) => isReceiptablePolicy(line.receiptPolicy));
  const components = lines.filter((line) => line.receiptPolicy === 'ROLL_TO_OUTPUT');
  const lineTotals = new Map<string, ComponentCostRollupLineTotal>();
  const warnings: ComponentCostRollupWarning[] = [];
  const allocations: ComponentCostRollupAllocation[] = [];

  for (const output of outputs) {
    lineTotals.set(output.id, {
      outputLineId: output.id,
      allocationGroupKey: output.allocationGroupKey ?? null,
      componentAllocatedCostHnl: 0,
      commercialLineCostHnl: round2(output.hnlAmount),
      commercialUnitCostHnl: output.quantity > 0 ? round4(output.hnlAmount / output.quantity) : 0,
    });
  }

  const outputsByGroup = new Map<string, ComponentCostRollupLineInput[]>();
  for (const output of outputs) {
    if (!output.allocationGroupKey) continue;
    const arr = outputsByGroup.get(output.allocationGroupKey) ?? [];
    arr.push(output);
    outputsByGroup.set(output.allocationGroupKey, arr);
  }

  for (const component of components.filter((line) => line.hnlAmount > 0)) {
    const groupKey = component.allocationGroupKey ?? null;
    if (!groupKey) {
      warnings.push({
        componentLineId: component.id,
        allocationGroupKey: null,
        hnlAmount: round2(component.hnlAmount),
        reason: 'Component line has no allocation group.',
      });
      continue;
    }

    const groupOutputs = outputsByGroup.get(groupKey) ?? [];
    const totalOutputBaseCents = groupOutputs.reduce((sum, output) => sum + toCents(output.hnlAmount), 0);
    if (groupOutputs.length === 0 || totalOutputBaseCents <= 0) {
      warnings.push({
        componentLineId: component.id,
        allocationGroupKey: groupKey,
        hnlAmount: round2(component.hnlAmount),
        reason: 'Component line has no receiptable output in the same allocation group.',
      });
      continue;
    }

    const componentCents = toCents(component.hnlAmount);
    let remainingCents = componentCents;
    groupOutputs.forEach((output, index) => {
      const outputBaseCents = toCents(output.hnlAmount);
      const allocatedCents =
        index === groupOutputs.length - 1
          ? remainingCents
          : Math.round((componentCents * outputBaseCents) / totalOutputBaseCents);
      remainingCents -= allocatedCents;
      const allocatedHnlAmount = fromCents(allocatedCents);
      allocations.push({
        componentLineId: component.id,
        outputLineId: output.id,
        allocationGroupKey: groupKey,
        allocatedHnlAmount,
      });
      const current = lineTotals.get(output.id);
      if (!current) return;
      current.componentAllocatedCostHnl = round2(current.componentAllocatedCostHnl + allocatedHnlAmount);
      current.commercialLineCostHnl = round2(output.hnlAmount + current.componentAllocatedCostHnl);
      current.commercialUnitCostHnl = output.quantity > 0 ? round4(current.commercialLineCostHnl / output.quantity) : 0;
    });
  }

  return {
    allocations,
    lineTotals: Array.from(lineTotals.values()),
    warnings,
  };
}

export interface ProductCostShareAllocation {
  chargeId: string;
  invoiceLineId: string;
  allocatedHnlAmount: number;
}

export interface ProductCostShareLineTotal {
  invoiceLineId: string;
  allocatedHnlAmount: number;
  landedUnitCostHnl: number;
  landedLineCostHnl: number;
}

export function allocateByProductCostShare(
  lines: ProductCostShareLineInput[],
  charges: ProductCostShareChargeInput[],
): { allocations: ProductCostShareAllocation[]; lineTotals: ProductCostShareLineTotal[] } {
  if (lines.length === 0) {
    throw new ImportManagementServiceError(422, 'NO_LINES', 'At least one import invoice line is required.');
  }

  const totalBaseCents = lines.reduce((sum, line) => sum + toCents(line.hnlAmount), 0);
  if (totalBaseCents <= 0) {
    throw new ImportManagementServiceError(422, 'NO_ALLOCATABLE_VALUE', 'Invoice line HNL value must be greater than zero.');
  }

  const lineAllocatedCents = new Map<string, number>(lines.map((line) => [line.id, 0]));
  const allocations: ProductCostShareAllocation[] = [];

  for (const charge of charges.filter((c) => c.hnlAmount > 0)) {
    const chargeCents = toCents(charge.hnlAmount);
    let remainingCents = chargeCents;

    lines.forEach((line, idx) => {
      const lineCents = toCents(line.hnlAmount);
      const allocatedCents =
        idx === lines.length - 1 ? remainingCents : Math.round((chargeCents * lineCents) / totalBaseCents);
      remainingCents -= allocatedCents;
      lineAllocatedCents.set(line.id, (lineAllocatedCents.get(line.id) ?? 0) + allocatedCents);
      allocations.push({
        chargeId: charge.id,
        invoiceLineId: line.id,
        allocatedHnlAmount: fromCents(allocatedCents),
      });
    });
  }

  const lineTotals = lines.map((line) => {
    const allocated = fromCents(lineAllocatedCents.get(line.id) ?? 0);
    const landedLineCost = round2(line.hnlAmount + allocated);
    return {
      invoiceLineId: line.id,
      allocatedHnlAmount: allocated,
      landedLineCostHnl: landedLineCost,
      landedUnitCostHnl: round4(landedLineCost / line.quantity),
    };
  });

  return { allocations, lineTotals };
}

function mapShipmentSummary(row: any): ImportShipmentSummary {
  const invoiceHnlTotal = toNumber(row.invoiceHnlTotal);
  const chargeHnlTotal = toNumber(row.chargeHnlTotal);
  const landedHnlTotal = row.landedHnlTotal == null
    ? round2(invoiceHnlTotal + chargeHnlTotal)
    : round2(toNumber(row.landedHnlTotal));
  return {
    id: String(row.id),
    shipmentNumber: String(row.shipmentNumber),
    displayName: String(row.displayName),
    status: row.status as ImportShipmentStatus,
    buyer: row.buyer ?? null,
    expectedArrivalAt: dateOnly(row.expectedArrivalAt),
    sourceWorkbookName: row.sourceWorkbookName ?? null,
    invoiceHnlTotal,
    chargeHnlTotal,
    landedHnlTotal,
    invoiceCount: toNumber(row.invoiceCount),
    lineCount: toNumber(row.lineCount),
    chargeCount: toNumber(row.chargeCount),
    createdAt: dateTime(row.createdAt),
    updatedAt: dateTime(row.updatedAt),
  };
}

function mapInvoiceLine(row: any): ImportInvoiceLineRecord {
  const costRole = mapCostRole(row.costRole);
  const receiptPolicy = mapReceiptPolicy(row.receiptPolicy, costRole);
  return {
    id: String(row.id),
    invoiceId: String(row.invoiceId),
    skuId: row.skuId ?? null,
    skuCode: row.skuCode ?? null,
    purchaseOrderLineId: row.purchaseOrderLineId ?? null,
    lineNumber: toNumber(row.lineNumber),
    itemCode: row.itemCode ?? null,
    styleCode: row.styleCode ?? null,
    description: row.description ?? null,
    materialMeters: nullableNumber(row.materialMeters),
    cartonCount: nullableNumber(row.cartonCount),
    weightKg: nullableNumber(row.weightKg),
    volumeCbm: nullableNumber(row.volumeCbm),
    quantity: toNumber(row.quantity),
    unitOfMeasure: String(row.unitOfMeasure),
    sourceUnitCost: nullableNumber(row.sourceUnitCost),
    sourceAmount: toNumber(row.sourceAmount),
    sourceCurrency: row.sourceCurrency as ImportSourceCurrency,
    fxRate: toNumber(row.fxRate),
    fxDate: dateOnly(row.fxDate) ?? '',
    hnlAmount: toNumber(row.hnlAmount),
    baseUnitCostHnl: toNumber(row.baseUnitCostHnl),
    commercialUnitCostHnl: nullableNumber(row.commercialUnitCostHnl),
    componentAllocatedCostHnl: toNumber(row.componentAllocatedCostHnl),
    allocatedLandedCostHnl: toNumber(row.allocatedLandedCostHnl),
    landedUnitCostHnl: nullableNumber(row.landedUnitCostHnl),
    costRole,
    receiptPolicy,
    allocationGroupKey: row.allocationGroupKey ?? null,
    taxable: Boolean(row.taxable),
  };
}

function mapInvoice(row: any, lines: ImportInvoiceLineRecord[]): ImportSupplierInvoiceRecord {
  return {
    id: String(row.id),
    shipmentId: String(row.shipmentId),
    invoiceNumber: String(row.invoiceNumber),
    supplierCode: row.supplierCode ?? null,
    supplierName: String(row.supplierName),
    invoiceDate: dateOnly(row.invoiceDate),
    invoiceGroup: row.invoiceGroup as ImportInvoiceGroup,
    invoiceKind: row.invoiceKind as ImportInvoiceKind,
    sourceAmount: toNumber(row.sourceAmount),
    sourceCurrency: row.sourceCurrency as ImportSourceCurrency,
    fxRate: toNumber(row.fxRate),
    fxDate: dateOnly(row.fxDate) ?? '',
    hnlAmount: toNumber(row.hnlAmount),
    notes: row.notes ?? null,
    lines,
  };
}

function mapCharge(row: any): ImportChargeRecord {
  return {
    id: String(row.id),
    shipmentId: String(row.shipmentId),
    chargeType: row.chargeType as ImportChargeType,
    counterparty: row.counterparty ?? null,
    documentNumber: row.documentNumber ?? null,
    sourceAmount: toNumber(row.sourceAmount),
    sourceCurrency: row.sourceCurrency as ImportSourceCurrency,
    fxRate: toNumber(row.fxRate),
    fxDate: dateOnly(row.fxDate) ?? '',
    hnlAmount: toNumber(row.hnlAmount),
    allocationBasis: 'PRODUCT_COST_SHARE',
    costTreatment: (row.costTreatment ?? 'ALLOCATE_TO_LANDED') as ImportChargeCostTreatment,
    taxable: Boolean(row.taxable),
    estimated: Boolean(row.estimated),
    final: Boolean(row.final),
    notes: row.notes ?? null,
  };
}

function mapImportCostComponentAllocation(row: any): ImportCostComponentAllocationRecord {
  const componentCostRole = mapCostRole(row.componentCostRole);
  return {
    id: String(row.id),
    shipmentId: String(row.shipmentId),
    buildId: String(row.buildId),
    componentInvoiceLineId: String(row.componentInvoiceLineId),
    outputInvoiceLineId: row.outputInvoiceLineId ? String(row.outputInvoiceLineId) : null,
    outputShipmentLineId: row.outputShipmentLineId ? String(row.outputShipmentLineId) : null,
    allocationBasis: String(row.allocationBasis),
    allocatedHnlAmount: toNumber(row.allocatedHnlAmount),
    allocatedQuantity: nullableNumber(row.allocatedQuantity),
    componentInvoiceNumber: String(row.componentInvoiceNumber),
    componentSupplierName: String(row.componentSupplierName),
    componentItemCode: row.componentItemCode ?? null,
    componentStyleCode: row.componentStyleCode ?? null,
    componentDescription: row.componentDescription ?? null,
    componentCostRole,
    componentReceiptPolicy: mapReceiptPolicy(row.componentReceiptPolicy, componentCostRole),
    componentAllocationGroupKey: row.componentAllocationGroupKey ?? null,
    outputInvoiceNumber: row.outputInvoiceNumber ?? null,
    outputPurchaseOrderNumber: row.outputPurchaseOrderNumber ?? null,
    outputSkuCode: row.outputSkuCode ?? null,
    outputItemCode: row.outputItemCode ?? null,
    outputStyleCode: row.outputStyleCode ?? null,
    outputDescription: row.outputDescription ?? null,
  };
}

function mapImportCostBuild(
  row: any,
  componentAllocations: ImportCostComponentAllocationRecord[],
): ImportCostBuildRecord {
  return {
    id: String(row.id),
    shipmentId: String(row.shipmentId),
    buildCode: String(row.buildCode),
    description: row.description ?? null,
    outputInvoiceLineId: row.outputInvoiceLineId ? String(row.outputInvoiceLineId) : null,
    outputShipmentLineId: row.outputShipmentLineId ? String(row.outputShipmentLineId) : null,
    outputSkuId: row.outputSkuId ? String(row.outputSkuId) : null,
    outputSkuCode: row.outputSkuCode ?? null,
    outputItemCode: row.outputItemCode ?? null,
    outputStyleCode: row.outputStyleCode ?? null,
    outputDescription: row.outputDescription ?? null,
    outputQuantity: toNumber(row.outputQuantity),
    allocationBasis: String(row.allocationBasis),
    componentAllocatedHnlAmount: toNumber(row.componentAllocatedHnlAmount),
    componentCount: toNumber(row.componentCount),
    createdBy: String(row.createdBy),
    createdAt: dateTime(row.createdAt),
    updatedAt: dateTime(row.updatedAt),
    componentAllocations,
  };
}

export function buildImportCostBuildPreviews(
  invoices: ImportSupplierInvoiceRecord[],
): ImportCostBuildPreviewRecord[] {
  const lineContext = new Map<string, {
    line: ImportInvoiceLineRecord;
    invoiceNumber: string;
    supplierName: string;
  }>();
  const allLines: ImportInvoiceLineRecord[] = [];
  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      allLines.push(line);
      lineContext.set(line.id, { line, invoiceNumber: invoice.invoiceNumber, supplierName: invoice.supplierName });
    }
  }

  const outputLines = allLines.filter((line) => line.receiptPolicy === 'RECEIVE_TO_STOCK');
  const componentLines = allLines.filter((line) => line.receiptPolicy === 'ROLL_TO_OUTPUT');
  if (outputLines.length === 0 && componentLines.length === 0) return [];

  const rollup = rollupComponentCostsByGroup(allLines.map((line) => ({
    id: line.id,
    hnlAmount: line.hnlAmount,
    quantity: line.quantity,
    receiptPolicy: line.receiptPolicy,
    allocationGroupKey: line.allocationGroupKey,
  })));
  const lineTotalsByOutput = new Map(rollup.lineTotals.map((total) => [total.outputLineId, total]));
  const warningsByComponent = new Map<string, string[]>();
  for (const warning of rollup.warnings) {
    const arr = warningsByComponent.get(warning.componentLineId) ?? [];
    arr.push(warning.reason);
    warningsByComponent.set(warning.componentLineId, arr);
  }

  const groupKeys = new Set<string>();
  for (const line of [...outputLines, ...componentLines]) {
    if (line.allocationGroupKey) groupKeys.add(line.allocationGroupKey);
  }
  const hasGroupedComponent = componentLines.some((line) => line.allocationGroupKey);
  const hasUngroupedComponent = componentLines.some((line) => !line.allocationGroupKey);
  const hasUngroupedOutput = outputLines.some((line) => !line.allocationGroupKey);
  if (hasUngroupedComponent) groupKeys.add('__UNASSIGNED_COMPONENTS__');
  if (hasGroupedComponent && hasUngroupedOutput) groupKeys.add('__UNGROUPED_OUTPUTS__');

    const previews: ImportCostBuildPreviewRecord[] = [];
  for (const groupKey of Array.from(groupKeys).sort()) {
    const isUnassignedComponents = groupKey === '__UNASSIGNED_COMPONENTS__';
    const isUngroupedOutputs = groupKey === '__UNGROUPED_OUTPUTS__';
    const allocationGroupKey = isUnassignedComponents || isUngroupedOutputs ? null : groupKey;
    const groupOutputs = isUngroupedOutputs
      ? outputLines.filter((line) => !line.allocationGroupKey)
      : outputLines.filter((line) => line.allocationGroupKey === allocationGroupKey);
    const groupComponents = isUnassignedComponents
      ? componentLines.filter((line) => !line.allocationGroupKey)
      : componentLines.filter((line) => line.allocationGroupKey === allocationGroupKey);

    const outputs: ImportCostBuildPreviewOutput[] = groupOutputs.map((line) => {
      const context = lineContext.get(line.id);
      const lineTotal = lineTotalsByOutput.get(line.id);
      return {
        invoiceLineId: line.id,
        invoiceNumber: context?.invoiceNumber ?? '',
        skuCode: line.skuCode,
        itemCode: line.itemCode,
        styleCode: line.styleCode,
        description: line.description,
        quantity: line.quantity,
        hnlAmount: line.hnlAmount,
        componentAllocatedCostHnl: lineTotal?.componentAllocatedCostHnl ?? 0,
        commercialLineCostHnl: lineTotal?.commercialLineCostHnl ?? line.hnlAmount,
        commercialUnitCostHnl: lineTotal?.commercialUnitCostHnl ?? line.baseUnitCostHnl,
      };
    });
    const components: ImportCostBuildPreviewComponent[] = groupComponents.map((line) => {
      const context = lineContext.get(line.id);
      return {
        invoiceLineId: line.id,
        invoiceNumber: context?.invoiceNumber ?? '',
        supplierName: context?.supplierName ?? '',
        costRole: line.costRole,
        itemCode: line.itemCode,
        styleCode: line.styleCode,
        description: line.description,
        quantity: line.quantity,
        unitOfMeasure: line.unitOfMeasure,
        hnlAmount: line.hnlAmount,
        warning: (warningsByComponent.get(line.id) ?? [])[0] ?? null,
      };
    });

    const warnings: string[] = [];
    if (isUnassignedComponents) {
      warnings.push('Component lines need an allocation group before they can roll into output lines.');
    }
    if (isUngroupedOutputs) {
      warnings.push('Receiptable output lines have no allocation group while grouped component costs exist.');
    }
    if (!isUnassignedComponents && groupComponents.length > 0 && groupOutputs.length === 0) {
      warnings.push('Component lines have no receiptable output in this allocation group.');
    }
    if (!isUngroupedOutputs && groupOutputs.length > 0 && groupComponents.length === 0 && componentLines.length > 0) {
      warnings.push('Receiptable output lines have no component lines in this allocation group.');
    }
    for (const component of components) {
      if (component.warning && !warnings.includes(component.warning)) warnings.push(component.warning);
    }

    const status: ImportCostBuildPreviewRecord['status'] = warnings.some((warning) =>
      warning.includes('need an allocation group') ||
      warning.includes('no receiptable output') ||
      warning.includes('no allocation group while grouped component costs exist')
    )
      ? 'FAIL'
      : warnings.length > 0
        ? 'WARN'
        : 'PASS';
    const outputHnlAmount = round2(outputs.reduce((sum, output) => sum + output.hnlAmount, 0));
    const componentHnlAmount = round2(components.reduce((sum, component) => sum + component.hnlAmount, 0));
    previews.push({
      previewKey: groupKey,
      allocationGroupKey,
      status,
      outputLineCount: outputs.length,
      componentLineCount: components.length,
      outputHnlAmount,
      componentHnlAmount,
      commercialHnlAmount: round2(outputs.reduce((sum, output) => sum + output.commercialLineCostHnl, 0)),
      warningCount: warnings.length,
      warnings,
      outputs,
      components,
    });
  }
  return previews;
}

export function assertImportCostBuildPreviewsReady(previews: ImportCostBuildPreviewRecord[]): void {
  const failures = previews.filter((preview) => preview.status === 'FAIL');
  if (failures.length === 0) return;

  const reasons = failures
    .flatMap((preview) => preview.warnings)
    .filter(Boolean)
    .slice(0, 3);
  const suffix = reasons.length > 0 ? ` ${reasons.join(' ')}` : '';
  throw new ImportManagementServiceError(
    409,
    'COST_BUILD_NOT_READY',
    `Resolve ${failures.length} blocking import cost-build group(s) before landed-cost allocation.${suffix}`,
  );
}

async function getImportCostBuildPreviewsForShipment(
  client: SqlClient,
  shipmentId: string,
): Promise<ImportCostBuildPreviewRecord[]> {
  const [invoices, lines] = await Promise.all([
    client.$queryRawUnsafe<any[]>(
      `
        SELECT
          id, shipment_id AS "shipmentId", invoice_number AS "invoiceNumber",
          supplier_code AS "supplierCode", supplier_name AS "supplierName",
          invoice_date AS "invoiceDate", invoice_group AS "invoiceGroup",
          invoice_kind AS "invoiceKind", source_amount AS "sourceAmount",
          source_currency AS "sourceCurrency", fx_rate AS "fxRate", fx_date AS "fxDate",
          hnl_amount AS "hnlAmount", notes
        FROM app.import_supplier_invoice
        WHERE shipment_id = $1::uuid
        ORDER BY invoice_date NULLS LAST, invoice_number ASC
      `,
      shipmentId,
    ),
    client.$queryRawUnsafe<any[]>(
      `
        SELECT
          il.id, il.invoice_id AS "invoiceId", il.sku_id AS "skuId",
          COALESCE(sku.code, sku.provisional_code) AS "skuCode",
          il.purchase_order_line_id AS "purchaseOrderLineId",
          il.line_number AS "lineNumber", il.item_code AS "itemCode",
          il.style_code AS "styleCode", il.description, il.material_meters AS "materialMeters",
          il.carton_count AS "cartonCount", il.weight_kg AS "weightKg", il.volume_cbm AS "volumeCbm",
          il.quantity, il.unit_of_measure AS "unitOfMeasure", il.source_unit_cost AS "sourceUnitCost",
          il.source_amount AS "sourceAmount", il.source_currency AS "sourceCurrency",
          il.fx_rate AS "fxRate", il.fx_date AS "fxDate", il.hnl_amount AS "hnlAmount",
          il.base_unit_cost_hnl AS "baseUnitCostHnl",
          il.commercial_unit_cost_hnl AS "commercialUnitCostHnl",
          il.component_allocated_cost_hnl AS "componentAllocatedCostHnl",
          il.allocated_landed_cost_hnl AS "allocatedLandedCostHnl",
          il.landed_unit_cost_hnl AS "landedUnitCostHnl",
          il.cost_role AS "costRole",
          il.receipt_policy AS "receiptPolicy",
          il.allocation_group_key AS "allocationGroupKey",
          il.taxable
        FROM app.import_invoice_line il
        JOIN app.import_supplier_invoice si ON si.id = il.invoice_id
        LEFT JOIN app.sku sku ON sku.id = il.sku_id
        WHERE si.shipment_id = $1::uuid
        ORDER BY si.invoice_number ASC, il.line_number ASC
      `,
      shipmentId,
    ),
  ]);

  const linesByInvoice = new Map<string, ImportInvoiceLineRecord[]>();
  for (const line of lines.map(mapInvoiceLine)) {
    const arr = linesByInvoice.get(line.invoiceId) ?? [];
    arr.push(line);
    linesByInvoice.set(line.invoiceId, arr);
  }
  return buildImportCostBuildPreviews(
    invoices.map((invoice) => mapInvoice(invoice, linesByInvoice.get(String(invoice.id)) ?? [])),
  );
}

function mapImportShipmentLine(row: any): ImportShipmentLineRecord {
  const expectedQuantity = toNumber(row.expectedQuantity);
  const commercialUnitCostHnl = toNumber(row.commercialUnitCostHnl);
  const invoiceQuantity = nullableNumber(row.invoiceQuantity);
  const invoiceHnlAmount = nullableNumber(row.invoiceHnlAmount);
  const invoiceSourceCurrency = row.invoiceSourceCurrency ?? null;
  const warnings: string[] = [];
  if (row.invoiceLineId) {
    if (invoiceQuantity != null && Math.abs(invoiceQuantity - expectedQuantity) > 0.0001) {
      warnings.push(`Invoice quantity ${round4(invoiceQuantity)} differs from expected ${round4(expectedQuantity)}.`);
    }
    if (invoiceSourceCurrency && invoiceSourceCurrency !== row.sourceCurrency) {
      warnings.push(`Invoice currency ${invoiceSourceCurrency} differs from expected ${row.sourceCurrency}.`);
    }
    const expectedCommercialHnl = round2(expectedQuantity * commercialUnitCostHnl);
    if (invoiceHnlAmount != null && Math.abs(round2(invoiceHnlAmount) - expectedCommercialHnl) > 0.01) {
      warnings.push(`Invoice HNL ${round2(invoiceHnlAmount)} differs from expected commercial HNL ${expectedCommercialHnl}.`);
    }
  }
  const invoiceMatchApprovedAt = nullableDateTime(row.invoiceMatchApprovedAt);
  const invoiceMatchReviewStatus = !row.invoiceLineId
    ? 'UNMATCHED'
    : warnings.length === 0
      ? 'MATCHED'
      : invoiceMatchApprovedAt
        ? 'APPROVED_MISMATCH'
        : 'MATCH_WARNING';

  return {
    id: String(row.id),
    shipmentId: String(row.shipmentId),
    purchaseOrderId: String(row.purchaseOrderId),
    purchaseOrderNumber: String(row.purchaseOrderNumber),
    purchaseOrderStatus: String(row.purchaseOrderStatus),
    purchaseOrderLineId: String(row.purchaseOrderLineId),
    vendorCode: String(row.vendorCode),
    vendorName: row.vendorName ?? null,
    buyer: row.buyer ?? null,
    containerId: row.containerId ? String(row.containerId) : null,
    containerLabel: row.containerLabel ?? null,
    invoiceLineId: row.invoiceLineId ? String(row.invoiceLineId) : null,
    invoiceNumber: row.invoiceNumber ?? null,
    invoiceMatchReviewStatus,
    invoiceMatchWarnings: warnings,
    invoiceMatchApprovedAt,
    invoiceMatchApprovedBy: row.invoiceMatchApprovedBy ?? null,
    invoiceMatchApprovalReason: row.invoiceMatchApprovalReason ?? null,
    skuId: String(row.skuId),
    skuCode: row.skuCode ?? null,
    description: row.description ?? null,
    expectedQuantity,
    sourceUnitCost: nullableNumber(row.sourceUnitCost),
    sourceCurrency: row.sourceCurrency as ImportSourceCurrency,
    fxRate: toNumber(row.fxRate),
    fxDate: dateOnly(row.fxDate) ?? '',
    incotermCode: row.incotermCode ?? null,
    incotermPlace: row.incotermPlace ?? null,
    commercialUnitCostHnl,
    estimatedLandedUnitCostHnl: toNumber(row.estimatedLandedUnitCostHnl),
    allocatedLandedCostHnl: toNumber(row.allocatedLandedCostHnl),
    landedUnitCostHnl: nullableNumber(row.landedUnitCostHnl),
    status: row.status as ImportShipmentLineStatus,
    notes: row.notes ?? null,
  };
}

async function shipmentExists(client: SqlClient, shipmentId: string): Promise<boolean> {
  const rows = await client.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM app.import_shipment WHERE id = $1::uuid LIMIT 1`,
    shipmentId,
  );
  return rows.length > 0;
}

async function shipmentNumberExists(client: SqlClient, shipmentNumber: string): Promise<boolean> {
  const rows = await client.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM app.import_shipment WHERE shipment_number = $1 LIMIT 1`,
    shipmentNumber,
  );
  return rows.length > 0;
}

function duplicateShipmentNumberError(shipmentNumber: string): ImportManagementServiceError {
  return new ImportManagementServiceError(
    409,
    'SHIPMENT_NUMBER_EXISTS',
    `Import shipment ${shipmentNumber} already exists. Enter a different shipment number override before importing this workbook.`,
  );
}

async function getShipmentStatus(client: SqlClient, shipmentId: string): Promise<ImportShipmentStatus | null> {
  const rows = await client.$queryRawUnsafe<Array<{ status: ImportShipmentStatus }>>(
    `SELECT status FROM app.import_shipment WHERE id = $1::uuid LIMIT 1`,
    shipmentId,
  );
  return rows[0]?.status ?? null;
}

function normalizeContainerType(value: ImportContainerType | undefined): ImportContainerType {
  const type = value ?? 'CONTAINER';
  if (!CONTAINER_TYPES.has(type)) {
    throw new ImportManagementServiceError(422, 'INVALID_CONTAINER_TYPE', 'Invalid import container type.');
  }
  return type;
}

function normalizeContainerStatus(value: ImportContainerStatus | undefined): ImportContainerStatus {
  const status = value ?? 'PLANNED';
  if (!CONTAINER_STATUSES.has(status)) {
    throw new ImportManagementServiceError(422, 'INVALID_CONTAINER_STATUS', 'Invalid import container status.');
  }
  return status;
}

function normalizeGoodsInTransitStatus(value: GoodsInTransitStatus | undefined): GoodsInTransitStatus {
  const status = value ?? 'PENDING';
  if (!GOODS_IN_TRANSIT_STATUSES.has(status)) {
    throw new ImportManagementServiceError(422, 'INVALID_GIT_STATUS', 'Invalid goods-in-transit status.');
  }
  return status;
}

function normalizeChargeType(value: ImportChargeType): ImportChargeType {
  if (!CHARGE_TYPES.has(value)) {
    throw new ImportManagementServiceError(422, 'INVALID_CHARGE_TYPE', 'Invalid import charge type.');
  }
  return value;
}

function normalizeChargeCostTreatment(value: ImportChargeCostTreatment | undefined): ImportChargeCostTreatment {
  const treatment = value ?? 'ALLOCATE_TO_LANDED';
  if (!CHARGE_COST_TREATMENTS.has(treatment)) {
    throw new ImportManagementServiceError(422, 'INVALID_COST_TREATMENT', 'Invalid import charge cost treatment.');
  }
  return treatment;
}

async function defaultChargeCostTreatmentForShipment(
  client: SqlClient,
  shipmentId: string,
  chargeType: ImportChargeType,
  explicitTreatment?: ImportChargeCostTreatment,
): Promise<ImportChargeCostTreatment> {
  if (explicitTreatment) return normalizeChargeCostTreatment(explicitTreatment);
  if (!['FREIGHT', 'INSURANCE'].includes(chargeType)) return 'ALLOCATE_TO_LANDED';

  const rows = await client.$queryRawUnsafe<Array<{ lineCount: unknown; cifCipLineCount: unknown }>>(
    `
      SELECT
        COUNT(*) AS "lineCount",
        COALESCE(SUM(CASE WHEN incoterm_code IN ('CIF', 'CIP') THEN 1 ELSE 0 END), 0) AS "cifCipLineCount"
      FROM app.import_shipment_line
      WHERE shipment_id = $1::uuid
        AND status <> 'CANCELLED'
    `,
    shipmentId,
  );
  const lineCount = toNumber(rows[0]?.lineCount);
  const cifCipLineCount = toNumber(rows[0]?.cifCipLineCount);
  return lineCount > 0 && lineCount === cifCipLineCount
    ? 'INCLUDED_IN_COMMERCIAL_PRICE'
    : 'ALLOCATE_TO_LANDED';
}

function normalizeShipmentLineStatus(value: ImportShipmentLineStatus | undefined): ImportShipmentLineStatus {
  const status = value ?? 'EXPECTED';
  if (!SHIPMENT_LINE_STATUSES.has(status)) {
    throw new ImportManagementServiceError(422, 'INVALID_SHIPMENT_LINE_STATUS', 'Invalid import shipment line status.');
  }
  return status;
}

function normalizeSuggestedPriceStatus(
  value: ImportSuggestedPriceApprovalStatus,
): ImportSuggestedPriceApprovalStatus {
  if (!SUGGESTED_PRICE_STATUSES.has(value)) {
    throw new ImportManagementServiceError(
      422,
      'INVALID_SUGGESTED_PRICE_STATUS',
      'Invalid suggested-price approval status.',
    );
  }
  return value;
}

export function assertImportSuggestedPriceStatusTransition(
  currentStatus: ImportSuggestedPriceApprovalStatus,
  nextStatus: ImportSuggestedPriceApprovalStatus,
  skuId: string | null,
): void {
  if (currentStatus === nextStatus) return;
  assertImportSuggestedPriceEditable(currentStatus);
  if (nextStatus === 'POSTED' && currentStatus !== 'APPROVED') {
    throw new ImportManagementServiceError(
      409,
      'SUGGESTED_PRICE_NOT_APPROVED',
      'Suggested price must be approved before it can be marked posted to Products/Pricing.',
    );
  }
  if (nextStatus === 'POSTED' && !skuId) {
    throw new ImportManagementServiceError(
      409,
      'SUGGESTED_PRICE_SKU_REQUIRED',
      'Suggested price must be linked to an app SKU before it can be marked posted.',
    );
  }
}

export function assertImportSuggestedPriceEditable(approvalStatus: ImportSuggestedPriceApprovalStatus | null): void {
  if (approvalStatus !== 'POSTED') return;
  throw new ImportManagementServiceError(
    409,
    'SUGGESTED_PRICE_ALREADY_POSTED',
    'Posted suggested prices are locked. Create a new pricing review to change them.',
  );
}

export function assertImportPayableSourceEditable(
  sourceType: ImportPayableSourceType,
  handoffStatus: ImportPayableHandoffStatus | null,
): void {
  if (!['SENT_TO_AP', 'PAID'].includes(handoffStatus ?? '')) return;
  const label = sourceType === 'SUPPLIER_INVOICE' ? 'supplier invoice' : 'landed-cost charge';
  throw new ImportManagementServiceError(
    409,
    handoffStatus === 'PAID' ? 'PAYABLE_ALREADY_PAID' : 'PAYABLE_ALREADY_SENT',
    `This import ${label} has already been ${handoffStatus === 'PAID' ? 'paid' : 'sent to Accounts Payable'} and cannot be edited.`,
  );
}

export function assertImportLandedCostEditable(postedSuggestedPriceCount: number): void {
  if (postedSuggestedPriceCount <= 0) return;
  throw new ImportManagementServiceError(
    409,
    'SUGGESTED_PRICES_POSTED',
    'Landed cost cannot be recalculated after suggested pricing has been posted to Products/Pricing.',
  );
}

function validateTransitAudit(status: GoodsInTransitStatus, auditReason: string | null | undefined): void {
  if (status === 'RECEIVING_ESTIMATED' && !auditReason?.trim()) {
    throw new ImportManagementServiceError(
      422,
      'AUDIT_REASON_REQUIRED',
      'Estimated receiving goods-in-transit records require an audit reason.',
    );
  }
}

function validateQuantity(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new ImportManagementServiceError(422, 'INVALID_QUANTITY', 'quantityInTransit must be a non-negative number.');
  }
  return value;
}

async function getContainerShipmentId(client: SqlClient, containerId: string): Promise<string | null> {
  const rows = await client.$queryRawUnsafe<Array<{ shipmentId: string }>>(
    `SELECT shipment_id AS "shipmentId" FROM app.import_container WHERE id = $1::uuid LIMIT 1`,
    containerId,
  );
  return rows[0]?.shipmentId ? String(rows[0].shipmentId) : null;
}

async function getGoodsInTransitShipmentId(client: SqlClient, recordId: string): Promise<string | null> {
  const rows = await client.$queryRawUnsafe<Array<{ shipmentId: string }>>(
    `SELECT shipment_id AS "shipmentId" FROM app.goods_in_transit_record WHERE id = $1::uuid LIMIT 1`,
    recordId,
  );
  return rows[0]?.shipmentId ? String(rows[0].shipmentId) : null;
}

async function getSuggestedPriceContext(
  client: SqlClient,
  suggestedPriceId: string,
): Promise<{ shipmentId: string; approvalStatus: ImportSuggestedPriceApprovalStatus; skuId: string | null } | null> {
  const rows = await client.$queryRawUnsafe<Array<{
    shipmentId: string;
    approvalStatus: ImportSuggestedPriceApprovalStatus;
    skuId: string | null;
  }>>(
    `
      SELECT shipment_id AS "shipmentId",
             approval_status AS "approvalStatus",
             sku_id AS "skuId"
      FROM app.import_suggested_price
      WHERE id = $1::uuid
      LIMIT 1
    `,
    suggestedPriceId,
  );
  const row = rows[0];
  if (!row?.shipmentId) return null;
  return {
    shipmentId: String(row.shipmentId),
    approvalStatus: normalizeSuggestedPriceStatus(row.approvalStatus),
    skuId: row.skuId ? String(row.skuId) : null,
  };
}

async function assertInvoiceLineSuggestedPriceEditable(client: SqlClient, invoiceLineId: string): Promise<void> {
  const rows = await client.$queryRawUnsafe<Array<{ approvalStatus: ImportSuggestedPriceApprovalStatus }>>(
    `
      SELECT approval_status AS "approvalStatus"
      FROM app.import_suggested_price
      WHERE invoice_line_id = $1::uuid
      LIMIT 1
    `,
    invoiceLineId,
  );
  assertImportSuggestedPriceEditable(rows[0]?.approvalStatus ? normalizeSuggestedPriceStatus(rows[0].approvalStatus) : null);
}

async function assertContainerBelongsToShipment(
  client: SqlClient,
  shipmentId: string,
  containerId: string | null | undefined,
): Promise<void> {
  const cleanId = cleanString(containerId);
  if (!cleanId) return;
  const actualShipmentId = await getContainerShipmentId(client, cleanId);
  if (!actualShipmentId) {
    throw new ImportManagementServiceError(404, 'CONTAINER_NOT_FOUND', 'Import container not found.');
  }
  if (actualShipmentId !== shipmentId) {
    throw new ImportManagementServiceError(409, 'CONTAINER_SHIPMENT_MISMATCH', 'Container belongs to a different shipment.');
  }
}

async function getInvoiceLineShipmentAndQuantity(
  client: SqlClient,
  invoiceLineId: string,
): Promise<{ shipmentId: string; quantity: number; receiptPolicy: ImportInvoiceLineReceiptPolicy } | null> {
  const rows = await client.$queryRawUnsafe<Array<{ shipmentId: string; quantity: unknown; receiptPolicy: unknown; costRole: unknown }>>(
    `
      SELECT
        si.shipment_id AS "shipmentId",
        il.quantity,
        il.receipt_policy AS "receiptPolicy",
        il.cost_role AS "costRole"
      FROM app.import_invoice_line il
      JOIN app.import_supplier_invoice si ON si.id = il.invoice_id
      WHERE il.id = $1::uuid
      LIMIT 1
    `,
    invoiceLineId,
  );
  const row = rows[0];
  if (!row) return null;
  const costRole = mapCostRole(row.costRole);
  return {
    shipmentId: String(row.shipmentId),
    quantity: toNumber(row.quantity),
    receiptPolicy: mapReceiptPolicy(row.receiptPolicy, costRole),
  };
}

async function assertInvoiceLineBelongsToShipment(
  client: SqlClient,
  shipmentId: string,
  invoiceLineId: string | null | undefined,
): Promise<{ quantity: number } | null> {
  const cleanId = cleanString(invoiceLineId);
  if (!cleanId) return null;
  const line = await getInvoiceLineShipmentAndQuantity(client, cleanId);
  if (!line) {
    throw new ImportManagementServiceError(404, 'INVOICE_LINE_NOT_FOUND', 'Import invoice line not found.');
  }
  if (line.shipmentId !== shipmentId) {
    throw new ImportManagementServiceError(409, 'LINE_SHIPMENT_MISMATCH', 'Invoice line belongs to a different shipment.');
  }
  if (line.receiptPolicy !== 'RECEIVE_TO_STOCK') {
    throw new ImportManagementServiceError(
      409,
      'INVOICE_LINE_NOT_RECEIPTABLE',
      'Goods-in-transit records can only be created for import lines that receive to stock.',
    );
  }
  return { quantity: line.quantity };
}

function mapImportShipmentLineCandidate(row: any): ImportShipmentLineCandidate {
  return {
    purchaseOrderId: String(row.purchaseOrderId),
    purchaseOrderNumber: String(row.purchaseOrderNumber),
    purchaseOrderStatus: String(row.purchaseOrderStatus),
    purchaseOrderLineId: String(row.purchaseOrderLineId),
    vendorCode: String(row.vendorCode),
    vendorName: row.vendorName ?? null,
    buyer: row.buyer ?? null,
    sourceCurrency: row.sourceCurrency as ImportSourceCurrency,
    fxRate: toNumber(row.fxRate),
    fxDate: dateOnly(row.fxDate) ?? '',
    incotermCode: row.incotermCode ?? null,
    incotermPlace: row.incotermPlace ?? null,
    costBasis: String(row.costBasis),
    skuId: String(row.skuId),
    skuCode: row.skuCode ?? null,
    description: row.description ?? null,
    quantityOrdered: toNumber(row.quantityOrdered),
    quantityReceived: toNumber(row.quantityReceived),
    quantityOpen: toNumber(row.quantityOpen),
    quantityAlreadyPlanned: toNumber(row.quantityAlreadyPlanned),
    plannedShipments: row.plannedShipments ?? null,
    quantityAvailable: toNumber(row.quantityAvailable),
    sourceUnitCost: nullableNumber(row.sourceUnitCost),
    commercialUnitCostHnl: toNumber(row.commercialUnitCostHnl),
    estimatedLandedUnitCostHnl: toNumber(row.estimatedLandedUnitCostHnl),
  };
}

async function readPoLineShipmentCandidate(
  client: SqlClient,
  purchaseOrderLineId: string,
  excludeShipmentLineId?: string | null,
): Promise<ImportShipmentLineCandidate | null> {
  const rows = await client.$queryRawUnsafe<any[]>(
    `
      WITH active_plans AS (
        SELECT
          sl.purchase_order_line_id,
          SUM(sl.expected_quantity) AS quantity_planned
        FROM app.import_shipment_line sl
        JOIN app.import_shipment s ON s.id = sl.shipment_id
        WHERE sl.status <> 'CANCELLED'
          AND s.status <> 'CANCELLED'
          AND ($2::uuid IS NULL OR sl.id <> $2::uuid)
        GROUP BY sl.purchase_order_line_id
      )
      SELECT
        po.id AS "purchaseOrderId",
        po.po_number AS "purchaseOrderNumber",
        po.status AS "purchaseOrderStatus",
        pol.id AS "purchaseOrderLineId",
        po.vendor_code AS "vendorCode",
        COALESCE(vo.mail_name, v.mail_name, vo.short_name, v.short_name) AS "vendorName",
        po.buyer,
        po.source_currency AS "sourceCurrency",
        po.fx_rate AS "fxRate",
        po.fx_date AS "fxDate",
        po.incoterm_code AS "incotermCode",
        po.incoterm_place AS "incotermPlace",
        po.cost_basis AS "costBasis",
        pol.sku_id AS "skuId",
        COALESCE(sku.code, sku.provisional_code) AS "skuCode",
        COALESCE(sku.description_web, sku.description_rics, sku.comment) AS "description",
        pol.quantity_ordered AS "quantityOrdered",
        pol.quantity_received AS "quantityReceived",
        GREATEST(pol.quantity_ordered - pol.quantity_received, 0) AS "quantityOpen",
        COALESCE(ap.quantity_planned, 0) AS "quantityAlreadyPlanned",
        GREATEST(pol.quantity_ordered - pol.quantity_received - COALESCE(ap.quantity_planned, 0), 0) AS "quantityAvailable",
        pol.source_unit_cost AS "sourceUnitCost",
        COALESCE(pol.commercial_unit_cost_hnl, pol.unit_cost) AS "commercialUnitCostHnl",
        COALESCE(pol.estimated_landed_unit_cost_hnl, pol.unit_cost) AS "estimatedLandedUnitCostHnl"
      FROM app.purchase_order_line pol
      JOIN app.purchase_order po ON po.id = pol.po_id
      LEFT JOIN app.vendor v ON v.code = po.vendor_code
      LEFT JOIN app.vendor_overlay vo ON vo.code = po.vendor_code AND (vo.source IS NULL OR vo.source <> 'tombstone')
      LEFT JOIN app.sku sku ON sku.id = pol.sku_id
      LEFT JOIN active_plans ap ON ap.purchase_order_line_id = pol.id
      WHERE pol.id = $1::uuid
        AND po.status IN ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED')
      LIMIT 1
    `,
    purchaseOrderLineId,
    cleanString(excludeShipmentLineId),
  );
  return rows[0] ? mapImportShipmentLineCandidate(rows[0]) : null;
}

async function getShipmentLineContext(
  client: SqlClient,
  shipmentLineId: string,
): Promise<{ shipmentId: string; purchaseOrderLineId: string; expectedQuantity: number; invoiceLineId: string | null } | null> {
  const rows = await client.$queryRawUnsafe<Array<{
    shipmentId: string;
    purchaseOrderLineId: string;
    expectedQuantity: unknown;
    invoiceLineId: string | null;
  }>>(
    `
      SELECT
        shipment_id AS "shipmentId",
        purchase_order_line_id AS "purchaseOrderLineId",
        expected_quantity AS "expectedQuantity",
        invoice_line_id AS "invoiceLineId"
      FROM app.import_shipment_line
      WHERE id = $1::uuid
      LIMIT 1
    `,
    shipmentLineId,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    shipmentId: String(row.shipmentId),
    purchaseOrderLineId: String(row.purchaseOrderLineId),
    expectedQuantity: toNumber(row.expectedQuantity),
    invoiceLineId: row.invoiceLineId ? String(row.invoiceLineId) : null,
  };
}

async function assertShipmentLineBelongsToShipment(
  client: SqlClient,
  shipmentId: string,
  shipmentLineId: string | null | undefined,
): Promise<{ quantity: number } | null> {
  const cleanId = cleanString(shipmentLineId);
  if (!cleanId) return null;
  const context = await getShipmentLineContext(client, cleanId);
  if (!context) {
    throw new ImportManagementServiceError(404, 'SHIPMENT_LINE_NOT_FOUND', 'Import shipment line not found.');
  }
  if (context.shipmentId !== shipmentId) {
    throw new ImportManagementServiceError(
      409,
      'SHIPMENT_LINE_MISMATCH',
      'Import shipment line belongs to a different shipment.',
    );
  }
  return { quantity: context.expectedQuantity };
}

export async function listImportShipments(params: ImportShipmentListParams): Promise<ImportShipmentListEnvelope> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 25));
  const offset = (page - 1) * pageSize;

  const values: unknown[] = [];
  const where: string[] = [];
  if (params.status) {
    values.push(params.status);
    where.push(`s.status = $${values.length}`);
  }
  if (params.q?.trim()) {
    values.push(`%${params.q.trim()}%`);
    where.push(`(s.shipment_number ILIKE $${values.length} OR s.display_name ILIKE $${values.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
    `SELECT COUNT(*) AS count FROM app.import_shipment s ${whereSql}`,
    ...values,
  );
  const total = toNumber(countRows[0]?.count);

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        s.id,
        s.shipment_number AS "shipmentNumber",
        s.display_name AS "displayName",
        s.status,
        s.buyer,
        s.expected_arrival_at AS "expectedArrivalAt",
        s.source_workbook_name AS "sourceWorkbookName",
        s.created_at AS "createdAt",
        s.updated_at AS "updatedAt",
        COALESCE(inv.invoice_hnl_total, 0) + COALESCE(exp.expected_hnl_total, 0) AS "invoiceHnlTotal",
        COALESCE(ch.charge_hnl_total, 0) AS "chargeHnlTotal",
        GREATEST(
          COALESCE(inv.landed_hnl_total, 0) + COALESCE(exp.landed_hnl_total, 0),
          COALESCE(inv.invoice_hnl_total, 0) + COALESCE(exp.expected_hnl_total, 0) + COALESCE(ch.charge_hnl_total, 0)
        ) AS "landedHnlTotal",
        COALESCE(inv.invoice_count, 0) AS "invoiceCount",
        COALESCE(inv.line_count, 0) + COALESCE(exp.line_count, 0) AS "lineCount",
        COALESCE(ch.charge_count, 0) AS "chargeCount"
      FROM app.import_shipment s
      LEFT JOIN (
        SELECT
          si.shipment_id,
          SUM(il.hnl_amount) AS invoice_hnl_total,
          SUM(CASE
            WHEN il.receipt_policy = 'RECEIVE_TO_STOCK'
            THEN il.quantity * COALESCE(
              sl_match.landed_unit_cost_hnl,
              il.landed_unit_cost_hnl,
              il.commercial_unit_cost_hnl,
              il.base_unit_cost_hnl
            )
            ELSE 0
          END) AS landed_hnl_total,
          COUNT(DISTINCT si.id) AS invoice_count,
          COUNT(il.id) AS line_count
        FROM app.import_supplier_invoice si
        LEFT JOIN app.import_invoice_line il ON il.invoice_id = si.id
        LEFT JOIN app.import_shipment_line sl_match
          ON sl_match.invoice_line_id = il.id
         AND sl_match.status <> 'CANCELLED'
         AND il.receipt_policy = 'RECEIVE_TO_STOCK'
        GROUP BY si.shipment_id
      ) inv ON inv.shipment_id = s.id
      LEFT JOIN (
        SELECT
          shipment_id,
          SUM(CASE WHEN cost_treatment = 'ALLOCATE_TO_LANDED' THEN hnl_amount ELSE 0 END) AS charge_hnl_total,
          COUNT(*) AS charge_count
        FROM app.import_charge
        GROUP BY shipment_id
      ) ch ON ch.shipment_id = s.id
      LEFT JOIN (
        SELECT
          shipment_id,
          SUM(expected_quantity * commercial_unit_cost_hnl) AS expected_hnl_total,
          SUM(expected_quantity * COALESCE(landed_unit_cost_hnl, estimated_landed_unit_cost_hnl)) AS landed_hnl_total,
          COUNT(*) AS line_count
        FROM app.import_shipment_line
        WHERE invoice_line_id IS NULL
          AND status <> 'CANCELLED'
        GROUP BY shipment_id
      ) exp ON exp.shipment_id = s.id
      ${whereSql}
      ORDER BY s.created_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `,
    ...values,
    pageSize,
    offset,
  );

  return {
    data: rows.map(mapShipmentSummary),
    pagination: {
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

function mapImportOtbCommitment(row: any): ImportOtbCommitmentRecord {
  const invoiceHnlTotal = round2(toNumber(row.invoiceHnlTotal));
  const allocatedChargeHnlTotal = round2(toNumber(row.allocatedChargeHnlTotal));
  const landedHnlTotal = row.landedHnlTotal == null
    ? round2(invoiceHnlTotal + allocatedChargeHnlTotal)
    : round2(toNumber(row.landedHnlTotal));
  return {
    shipmentId: String(row.shipmentId),
    shipmentNumber: String(row.shipmentNumber),
    displayName: String(row.displayName),
    buyer: row.buyer ?? null,
    status: row.status as ImportShipmentStatus,
    expectedArrivalAt: dateOnly(row.expectedArrivalAt),
    actualArrivalAt: dateOnly(row.actualArrivalAt),
    commitmentMonth: monthKey(row.commitmentDate),
    commitmentBasis: row.commitmentBasis,
    departmentNumber: nullableNumber(row.departmentNumber),
    departmentName: row.departmentName ?? null,
    categoryNumber: nullableNumber(row.categoryNumber),
    invoiceHnlTotal,
    allocatedChargeHnlTotal,
    landedHnlTotal,
    lineCount: toNumber(row.lineCount),
    chargeCount: toNumber(row.chargeCount),
  };
}

function summarizeImportOtbCommitments(
  commitments: ImportOtbCommitmentRecord[],
): ImportOtbCommitmentSummary[] {
  const grouped = new Map<
    string,
    ImportOtbCommitmentSummary & { shipmentIds: Set<string> }
  >();

  for (const row of commitments) {
    const key = JSON.stringify([
      row.commitmentMonth,
      row.buyer,
      row.commitmentBasis,
      row.departmentNumber,
      row.departmentName,
      row.categoryNumber,
    ]);
    const existing = grouped.get(key);
    if (existing) {
      existing.shipmentIds.add(row.shipmentId);
      existing.shipmentCount = existing.shipmentIds.size;
      existing.lineCount += row.lineCount;
      existing.landedHnlTotal = round2(existing.landedHnlTotal + row.landedHnlTotal);
      continue;
    }
    grouped.set(key, {
      month: row.commitmentMonth,
      buyer: row.buyer,
      commitmentBasis: row.commitmentBasis,
      departmentNumber: row.departmentNumber,
      departmentName: row.departmentName,
      categoryNumber: row.categoryNumber,
      shipmentIds: new Set([row.shipmentId]),
      shipmentCount: 1,
      lineCount: row.lineCount,
      landedHnlTotal: row.landedHnlTotal,
    });
  }

  return Array.from(grouped.values())
    .map(({ shipmentIds: _shipmentIds, ...row }) => row)
    .sort((a, b) =>
      (a.month ?? '9999-99').localeCompare(b.month ?? '9999-99') ||
      (a.buyer ?? '').localeCompare(b.buyer ?? '') ||
      a.commitmentBasis.localeCompare(b.commitmentBasis) ||
      (a.departmentNumber ?? 9999) - (b.departmentNumber ?? 9999) ||
      (a.categoryNumber ?? 9999) - (b.categoryNumber ?? 9999),
    );
}

export async function listImportOtbCommitments(
  params: ImportOtbCommitmentsParams = {},
): Promise<ImportOtbCommitmentsEnvelope> {
  const values: unknown[] = [];
  const where: string[] = [
    `s.status IN (${OTB_COMMITMENT_STATUSES.map((status) => `'${status}'`).join(', ')})`,
  ];

  if (params.buyer?.trim()) {
    values.push(params.buyer.trim());
    where.push(`s.buyer = $${values.length}`);
  }
  if (params.monthFrom) {
    values.push(`${params.monthFrom}-01`);
    where.push(`date_trunc('month', COALESCE(s.expected_arrival_at, s.actual_arrival_at))::date >= $${values.length}::date`);
  }
  if (params.monthTo) {
    values.push(`${params.monthTo}-01`);
    where.push(`date_trunc('month', COALESCE(s.expected_arrival_at, s.actual_arrival_at))::date <= $${values.length}::date`);
  }
  if (params.departmentNumber != null) {
    values.push(params.departmentNumber);
    where.push(`td.number = $${values.length}`);
  }
  if (params.categoryNumber != null) {
    values.push(params.categoryNumber);
    where.push(`sku.category_number = $${values.length}`);
  }

  const finalStatusesSql = Array.from(FINAL_LIQUIDATION_STATUSES).map((status) => `'${status}'`).join(', ');
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      WITH shipment_lines AS (
        SELECT
          s.id AS shipment_id,
          s.shipment_number,
          s.display_name,
          s.buyer,
          s.status,
          s.expected_arrival_at,
          s.actual_arrival_at,
          COALESCE(s.expected_arrival_at, s.actual_arrival_at) AS commitment_date,
          CASE WHEN s.status IN (${finalStatusesSql}) THEN 'FINAL' ELSE 'ESTIMATED' END AS commitment_basis,
          sl.id AS line_id,
          COALESCE(
            il.quantity * COALESCE(il.commercial_unit_cost_hnl, il.base_unit_cost_hnl),
            sl.expected_quantity * sl.commercial_unit_cost_hnl
          ) AS base_hnl_amount,
          COALESCE(il.quantity, sl.expected_quantity)
            * COALESCE(
              sl.landed_unit_cost_hnl,
              il.landed_unit_cost_hnl,
              il.commercial_unit_cost_hnl,
              sl.estimated_landed_unit_cost_hnl
            ) AS landed_hnl_amount,
          sku.category_number,
          td.number AS department_number,
          td."desc" AS department_name
        FROM app.import_shipment s
        JOIN app.import_shipment_line sl ON sl.shipment_id = s.id
        JOIN app.purchase_order_line pol ON pol.id = sl.purchase_order_line_id
        LEFT JOIN app.import_invoice_line il ON il.id = sl.invoice_line_id
        LEFT JOIN app.sku sku ON sku.id = COALESCE(il.sku_id, pol.sku_id)
        LEFT JOIN app.taxonomy_department td
          ON sku.category_number BETWEEN td.beg_categ AND td.end_categ
        WHERE ${where.join(' AND ')}
          AND sl.status <> 'CANCELLED'
          AND (il.id IS NULL OR il.receipt_policy = 'RECEIVE_TO_STOCK')
        UNION ALL
        SELECT
          s.id AS shipment_id,
          s.shipment_number,
          s.display_name,
          s.buyer,
          s.status,
          s.expected_arrival_at,
          s.actual_arrival_at,
          COALESCE(s.expected_arrival_at, s.actual_arrival_at) AS commitment_date,
          CASE WHEN s.status IN (${finalStatusesSql}) THEN 'FINAL' ELSE 'ESTIMATED' END AS commitment_basis,
          il.id AS line_id,
          il.quantity * COALESCE(il.commercial_unit_cost_hnl, il.base_unit_cost_hnl) AS base_hnl_amount,
          il.quantity * COALESCE(il.landed_unit_cost_hnl, il.commercial_unit_cost_hnl, il.base_unit_cost_hnl) AS landed_hnl_amount,
          sku.category_number,
          td.number AS department_number,
          td."desc" AS department_name
        FROM app.import_shipment s
        JOIN app.import_supplier_invoice si ON si.shipment_id = s.id
        JOIN app.import_invoice_line il ON il.invoice_id = si.id
        LEFT JOIN app.purchase_order_line pol ON pol.id = il.purchase_order_line_id
        LEFT JOIN app.sku sku ON sku.id = COALESCE(il.sku_id, pol.sku_id)
        LEFT JOIN app.taxonomy_department td
          ON sku.category_number BETWEEN td.beg_categ AND td.end_categ
        WHERE ${where.join(' AND ')}
          AND il.receipt_policy = 'RECEIVE_TO_STOCK'
          AND NOT EXISTS (
            SELECT 1
            FROM app.import_shipment_line sl
            WHERE sl.invoice_line_id = il.id
              AND sl.status <> 'CANCELLED'
          )
      ),
      shipment_totals AS (
        SELECT
          shipment_id,
          SUM(base_hnl_amount) AS base_hnl_total,
          SUM(landed_hnl_amount) AS landed_hnl_total
        FROM shipment_lines
        GROUP BY shipment_id
      ),
      charge_totals AS (
        SELECT c.shipment_id, SUM(c.hnl_amount) AS charge_hnl_total, COUNT(*) AS charge_count
        FROM app.import_charge c
        JOIN (SELECT DISTINCT shipment_id FROM shipment_lines) s ON s.shipment_id = c.shipment_id
        WHERE c.cost_treatment = 'ALLOCATE_TO_LANDED'
        GROUP BY c.shipment_id
      )
      SELECT
        sl.shipment_id AS "shipmentId",
        sl.shipment_number AS "shipmentNumber",
        sl.display_name AS "displayName",
        sl.buyer,
        sl.status,
        sl.expected_arrival_at AS "expectedArrivalAt",
        sl.actual_arrival_at AS "actualArrivalAt",
        sl.commitment_date AS "commitmentDate",
        sl.commitment_basis AS "commitmentBasis",
        sl.department_number AS "departmentNumber",
        sl.department_name AS "departmentName",
        sl.category_number AS "categoryNumber",
        SUM(sl.base_hnl_amount) AS "invoiceHnlTotal",
        GREATEST(
          SUM(sl.landed_hnl_amount),
          SUM(sl.base_hnl_amount) + CASE
            WHEN MAX(st.base_hnl_total) > 0
            THEN COALESCE(MAX(ct.charge_hnl_total), 0) * (SUM(sl.base_hnl_amount) / MAX(st.base_hnl_total))
            ELSE 0
          END
        ) - SUM(sl.base_hnl_amount) AS "allocatedChargeHnlTotal",
        GREATEST(
          SUM(sl.landed_hnl_amount),
          SUM(sl.base_hnl_amount) + CASE
            WHEN MAX(st.base_hnl_total) > 0
            THEN COALESCE(MAX(ct.charge_hnl_total), 0) * (SUM(sl.base_hnl_amount) / MAX(st.base_hnl_total))
            ELSE 0
          END
        ) AS "landedHnlTotal",
        COUNT(DISTINCT sl.line_id) AS "lineCount",
        COALESCE(MAX(ct.charge_count), 0) AS "chargeCount"
      FROM shipment_lines sl
      JOIN shipment_totals st ON st.shipment_id = sl.shipment_id
      LEFT JOIN charge_totals ct ON ct.shipment_id = sl.shipment_id
      GROUP BY
        sl.shipment_id,
        sl.shipment_number,
        sl.display_name,
        sl.buyer,
        sl.status,
        sl.expected_arrival_at,
        sl.actual_arrival_at,
        sl.commitment_date,
        sl.commitment_basis,
        sl.department_number,
        sl.department_name,
        sl.category_number
      ORDER BY
        sl.commitment_date ASC NULLS LAST,
        sl.shipment_number ASC,
        sl.department_number ASC NULLS LAST,
        sl.category_number ASC NULLS LAST
    `,
    ...values,
  );

  const commitments = rows.map(mapImportOtbCommitment);
  const totalEstimatedHnl = round2(
    commitments
      .filter((row) => row.commitmentBasis === 'ESTIMATED')
      .reduce((sum, row) => sum + row.landedHnlTotal, 0),
  );
  const totalFinalHnl = round2(
    commitments
      .filter((row) => row.commitmentBasis === 'FINAL')
      .reduce((sum, row) => sum + row.landedHnlTotal, 0),
  );

  return {
    commitments,
    summary: summarizeImportOtbCommitments(commitments),
    totalEstimatedHnl,
    totalFinalHnl,
    totalHnl: round2(totalEstimatedHnl + totalFinalHnl),
  };
}

export async function createImportShipment(
  input: CreateImportShipmentInput,
  actor: string | null,
): Promise<ImportShipmentDetail> {
  const shipmentNumber = requiredString(input.shipmentNumber, 'shipmentNumber');
  const displayName = requiredString(input.displayName, 'displayName');
  const createdBy = actor?.trim() || 'system';

  if (await shipmentNumberExists(prisma, shipmentNumber)) {
    throw duplicateShipmentNumberError(shipmentNumber);
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      INSERT INTO app.import_shipment (
        shipment_number, display_name, buyer, origin_port, destination_port, carrier,
        freight_forwarder, customs_policy_number, bl_number, expected_departure_at,
        expected_arrival_at, actual_arrival_at, source_workbook_name, notes, created_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10::date,
        $11::date, $12::date, $13, $14, $15
      )
      ON CONFLICT (shipment_number) DO NOTHING
      RETURNING id
    `,
    shipmentNumber,
    displayName,
    cleanString(input.buyer),
    cleanString(input.originPort),
    cleanString(input.destinationPort),
    cleanString(input.carrier),
    cleanString(input.freightForwarder),
    cleanString(input.customsPolicyNumber),
    cleanString(input.blNumber),
    optionalDate(input.expectedDepartureAt, 'expectedDepartureAt'),
    optionalDate(input.expectedArrivalAt, 'expectedArrivalAt'),
    optionalDate(input.actualArrivalAt, 'actualArrivalAt'),
    cleanString(input.sourceWorkbookName),
    cleanString(input.notes),
    createdBy,
  );

  if (!rows[0]?.id) {
    throw duplicateShipmentNumberError(shipmentNumber);
  }

  return getImportShipmentById(rows[0]!.id) as Promise<ImportShipmentDetail>;
}

export async function getImportShipmentById(shipmentId: string): Promise<ImportShipmentDetail | null> {
  const summaryRows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        s.id,
        s.shipment_number AS "shipmentNumber",
        s.display_name AS "displayName",
        s.status,
        s.buyer,
        s.origin_port AS "originPort",
        s.destination_port AS "destinationPort",
        s.carrier,
        s.freight_forwarder AS "freightForwarder",
        s.customs_policy_number AS "customsPolicyNumber",
        s.bl_number AS "blNumber",
        s.expected_departure_at AS "expectedDepartureAt",
        s.expected_arrival_at AS "expectedArrivalAt",
        s.actual_arrival_at AS "actualArrivalAt",
        s.base_currency AS "baseCurrency",
        s.source_workbook_name AS "sourceWorkbookName",
        s.notes,
        s.approved_estimate_at AS "approvedEstimateAt",
        s.approved_estimate_by AS "approvedEstimateBy",
        s.final_liquidation_at AS "finalLiquidationAt",
        s.closed_at AS "closedAt",
        s.created_by AS "createdBy",
        s.created_at AS "createdAt",
        s.updated_at AS "updatedAt",
        COALESCE(inv.invoice_hnl_total, 0) + COALESCE(exp.expected_hnl_total, 0) AS "invoiceHnlTotal",
        COALESCE(ch.charge_hnl_total, 0) AS "chargeHnlTotal",
        GREATEST(
          COALESCE(inv.landed_hnl_total, 0) + COALESCE(exp.landed_hnl_total, 0),
          COALESCE(inv.invoice_hnl_total, 0) + COALESCE(exp.expected_hnl_total, 0) + COALESCE(ch.charge_hnl_total, 0)
        ) AS "landedHnlTotal",
        COALESCE(inv.invoice_count, 0) AS "invoiceCount",
        COALESCE(inv.line_count, 0) + COALESCE(exp.line_count, 0) AS "lineCount",
        COALESCE(ch.charge_count, 0) AS "chargeCount"
      FROM app.import_shipment s
      LEFT JOIN (
        SELECT
          si.shipment_id,
          SUM(il.hnl_amount) AS invoice_hnl_total,
          SUM(CASE
            WHEN il.receipt_policy = 'RECEIVE_TO_STOCK'
            THEN il.quantity * COALESCE(
              sl_match.landed_unit_cost_hnl,
              il.landed_unit_cost_hnl,
              il.commercial_unit_cost_hnl,
              il.base_unit_cost_hnl
            )
            ELSE 0
          END) AS landed_hnl_total,
          COUNT(DISTINCT si.id) AS invoice_count,
          COUNT(il.id) AS line_count
        FROM app.import_supplier_invoice si
        LEFT JOIN app.import_invoice_line il ON il.invoice_id = si.id
        LEFT JOIN app.import_shipment_line sl_match
          ON sl_match.invoice_line_id = il.id
         AND sl_match.status <> 'CANCELLED'
         AND il.receipt_policy = 'RECEIVE_TO_STOCK'
        GROUP BY si.shipment_id
      ) inv ON inv.shipment_id = s.id
      LEFT JOIN (
        SELECT
          shipment_id,
          SUM(CASE WHEN cost_treatment = 'ALLOCATE_TO_LANDED' THEN hnl_amount ELSE 0 END) AS charge_hnl_total,
          COUNT(*) AS charge_count
        FROM app.import_charge
        GROUP BY shipment_id
      ) ch ON ch.shipment_id = s.id
      LEFT JOIN (
        SELECT
          shipment_id,
          SUM(expected_quantity * commercial_unit_cost_hnl) AS expected_hnl_total,
          SUM(expected_quantity * COALESCE(landed_unit_cost_hnl, estimated_landed_unit_cost_hnl)) AS landed_hnl_total,
          COUNT(*) AS line_count
        FROM app.import_shipment_line
        WHERE invoice_line_id IS NULL
          AND status <> 'CANCELLED'
        GROUP BY shipment_id
      ) exp ON exp.shipment_id = s.id
      WHERE s.id = $1::uuid
      LIMIT 1
    `,
    shipmentId,
  );

  const row = summaryRows[0];
  if (!row) return null;

  const [
    containers,
    shipmentLines,
    invoices,
    lines,
    charges,
    allocations,
    costBuildRows,
    componentAllocationRows,
    gitRecords,
    checks,
    suggestedPrices,
  ] =
    await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            id, shipment_id AS "shipmentId", container_number AS "containerNumber",
            container_type AS "containerType", seal_number AS "sealNumber",
            cargo_group AS "cargoGroup", status, expected_arrival_at AS "expectedArrivalAt",
            actual_arrival_at AS "actualArrivalAt", notes
          FROM app.import_container
          WHERE shipment_id = $1::uuid
          ORDER BY created_at ASC
        `,
        shipmentId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            sl.id,
            sl.shipment_id AS "shipmentId",
            po.id AS "purchaseOrderId",
            po.po_number AS "purchaseOrderNumber",
            po.status AS "purchaseOrderStatus",
            sl.purchase_order_line_id AS "purchaseOrderLineId",
            po.vendor_code AS "vendorCode",
            COALESCE(vo.mail_name, v.mail_name, vo.short_name, v.short_name) AS "vendorName",
            po.buyer,
            sl.container_id AS "containerId",
            COALESCE(ic.container_number, ic.cargo_group) AS "containerLabel",
            sl.invoice_line_id AS "invoiceLineId",
            si.invoice_number AS "invoiceNumber",
            il.quantity AS "invoiceQuantity",
            il.source_currency AS "invoiceSourceCurrency",
            il.hnl_amount AS "invoiceHnlAmount",
            pol.sku_id AS "skuId",
            COALESCE(sku.code, sku.provisional_code) AS "skuCode",
            COALESCE(sku.description_web, sku.description_rics, sku.comment) AS "description",
            sl.expected_quantity AS "expectedQuantity",
            sl.source_unit_cost AS "sourceUnitCost",
            sl.source_currency AS "sourceCurrency",
            sl.fx_rate AS "fxRate",
            sl.fx_date AS "fxDate",
            sl.incoterm_code AS "incotermCode",
            sl.incoterm_place AS "incotermPlace",
            sl.commercial_unit_cost_hnl AS "commercialUnitCostHnl",
            sl.estimated_landed_unit_cost_hnl AS "estimatedLandedUnitCostHnl",
            sl.allocated_landed_cost_hnl AS "allocatedLandedCostHnl",
            sl.landed_unit_cost_hnl AS "landedUnitCostHnl",
            sl.invoice_match_approved_at AS "invoiceMatchApprovedAt",
            sl.invoice_match_approved_by AS "invoiceMatchApprovedBy",
            sl.invoice_match_approval_reason AS "invoiceMatchApprovalReason",
            sl.status,
            sl.notes
          FROM app.import_shipment_line sl
          JOIN app.purchase_order_line pol ON pol.id = sl.purchase_order_line_id
          JOIN app.purchase_order po ON po.id = pol.po_id
          LEFT JOIN app.vendor v ON v.code = po.vendor_code
          LEFT JOIN app.vendor_overlay vo ON vo.code = po.vendor_code AND (vo.source IS NULL OR vo.source <> 'tombstone')
          LEFT JOIN app.import_container ic ON ic.id = sl.container_id
          LEFT JOIN app.import_invoice_line il ON il.id = sl.invoice_line_id
          LEFT JOIN app.import_supplier_invoice si ON si.id = il.invoice_id
          LEFT JOIN app.sku sku ON sku.id = pol.sku_id
          WHERE sl.shipment_id = $1::uuid
          ORDER BY po.po_number ASC, sl.created_at ASC
        `,
        shipmentId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            id, shipment_id AS "shipmentId", invoice_number AS "invoiceNumber",
            supplier_code AS "supplierCode", supplier_name AS "supplierName",
            invoice_date AS "invoiceDate", invoice_group AS "invoiceGroup",
            invoice_kind AS "invoiceKind", source_amount AS "sourceAmount",
            source_currency AS "sourceCurrency", fx_rate AS "fxRate", fx_date AS "fxDate",
            hnl_amount AS "hnlAmount", notes
          FROM app.import_supplier_invoice
          WHERE shipment_id = $1::uuid
          ORDER BY invoice_date NULLS LAST, invoice_number ASC
        `,
        shipmentId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            il.id, il.invoice_id AS "invoiceId", il.sku_id AS "skuId",
            COALESCE(sku.code, sku.provisional_code) AS "skuCode",
            il.purchase_order_line_id AS "purchaseOrderLineId",
            il.line_number AS "lineNumber", il.item_code AS "itemCode",
            il.style_code AS "styleCode", il.description, il.material_meters AS "materialMeters",
            il.carton_count AS "cartonCount", il.weight_kg AS "weightKg", il.volume_cbm AS "volumeCbm",
            il.quantity, il.unit_of_measure AS "unitOfMeasure", il.source_unit_cost AS "sourceUnitCost",
            il.source_amount AS "sourceAmount", il.source_currency AS "sourceCurrency",
            il.fx_rate AS "fxRate", il.fx_date AS "fxDate", il.hnl_amount AS "hnlAmount",
            il.base_unit_cost_hnl AS "baseUnitCostHnl",
            il.commercial_unit_cost_hnl AS "commercialUnitCostHnl",
            il.component_allocated_cost_hnl AS "componentAllocatedCostHnl",
            il.allocated_landed_cost_hnl AS "allocatedLandedCostHnl",
            il.landed_unit_cost_hnl AS "landedUnitCostHnl",
            il.cost_role AS "costRole",
            il.receipt_policy AS "receiptPolicy",
            il.allocation_group_key AS "allocationGroupKey",
            il.taxable
          FROM app.import_invoice_line il
          JOIN app.import_supplier_invoice si ON si.id = il.invoice_id
          LEFT JOIN app.sku sku ON sku.id = il.sku_id
          WHERE si.shipment_id = $1::uuid
          ORDER BY si.invoice_number ASC, il.line_number ASC
        `,
        shipmentId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            id, shipment_id AS "shipmentId", charge_type AS "chargeType",
            counterparty, document_number AS "documentNumber",
            source_amount AS "sourceAmount", source_currency AS "sourceCurrency",
            fx_rate AS "fxRate", fx_date AS "fxDate", hnl_amount AS "hnlAmount",
            allocation_basis AS "allocationBasis", cost_treatment AS "costTreatment",
            taxable, estimated, final, notes
          FROM app.import_charge
          WHERE shipment_id = $1::uuid
          ORDER BY created_at ASC
        `,
        shipmentId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            id, shipment_id AS "shipmentId", charge_id AS "chargeId",
            invoice_line_id AS "invoiceLineId", shipment_line_id AS "shipmentLineId",
            allocation_basis AS "allocationBasis",
            allocated_hnl_amount AS "allocatedHnlAmount"
          FROM app.import_landed_cost_allocation
          WHERE shipment_id = $1::uuid
          ORDER BY charge_id ASC, invoice_line_id ASC
        `,
        shipmentId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            cb.id::text AS id,
            cb.shipment_id::text AS "shipmentId",
            cb.build_code AS "buildCode",
            cb.description,
            cb.output_invoice_line_id::text AS "outputInvoiceLineId",
            cb.output_shipment_line_id::text AS "outputShipmentLineId",
            cb.output_sku_id::text AS "outputSkuId",
            COALESCE(output_sku.code, output_sku.provisional_code, output_line.item_code) AS "outputSkuCode",
            output_line.item_code AS "outputItemCode",
            output_line.style_code AS "outputStyleCode",
            COALESCE(output_line.description, output_sku.description_web, output_sku.description_rics, output_sku.comment) AS "outputDescription",
            cb.output_quantity AS "outputQuantity",
            cb.allocation_basis AS "allocationBasis",
            COALESCE(SUM(ca.allocated_hnl_amount), 0) AS "componentAllocatedHnlAmount",
            COUNT(ca.id) AS "componentCount",
            cb.created_by AS "createdBy",
            cb.created_at AS "createdAt",
            cb.updated_at AS "updatedAt"
          FROM app.import_cost_build cb
          LEFT JOIN app.import_invoice_line output_line ON output_line.id = cb.output_invoice_line_id
          LEFT JOIN app.import_shipment_line output_shipment_line ON output_shipment_line.id = cb.output_shipment_line_id
          LEFT JOIN app.purchase_order_line output_pol ON output_pol.id = output_shipment_line.purchase_order_line_id
          LEFT JOIN app.sku output_sku ON output_sku.id = COALESCE(cb.output_sku_id, output_line.sku_id, output_pol.sku_id)
          LEFT JOIN app.import_cost_component_allocation ca ON ca.build_id = cb.id
          WHERE cb.shipment_id = $1::uuid
          GROUP BY
            cb.id, output_sku.code, output_sku.provisional_code, output_line.item_code,
            output_line.style_code, output_line.description, output_sku.description_web,
            output_sku.description_rics, output_sku.comment
          ORDER BY cb.build_code ASC
        `,
        shipmentId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            ca.id::text AS id,
            ca.shipment_id::text AS "shipmentId",
            ca.build_id::text AS "buildId",
            ca.component_invoice_line_id::text AS "componentInvoiceLineId",
            ca.output_invoice_line_id::text AS "outputInvoiceLineId",
            ca.output_shipment_line_id::text AS "outputShipmentLineId",
            ca.allocation_basis AS "allocationBasis",
            ca.allocated_hnl_amount AS "allocatedHnlAmount",
            ca.allocated_quantity AS "allocatedQuantity",
            component_invoice.invoice_number AS "componentInvoiceNumber",
            component_invoice.supplier_name AS "componentSupplierName",
            component_line.item_code AS "componentItemCode",
            component_line.style_code AS "componentStyleCode",
            component_line.description AS "componentDescription",
            component_line.cost_role AS "componentCostRole",
            component_line.receipt_policy AS "componentReceiptPolicy",
            component_line.allocation_group_key AS "componentAllocationGroupKey",
            output_invoice.invoice_number AS "outputInvoiceNumber",
            output_po.po_number AS "outputPurchaseOrderNumber",
            COALESCE(output_sku.code, output_sku.provisional_code, output_line.item_code) AS "outputSkuCode",
            output_line.item_code AS "outputItemCode",
            output_line.style_code AS "outputStyleCode",
            COALESCE(output_line.description, output_sku.description_web, output_sku.description_rics, output_sku.comment) AS "outputDescription"
          FROM app.import_cost_component_allocation ca
          JOIN app.import_invoice_line component_line ON component_line.id = ca.component_invoice_line_id
          JOIN app.import_supplier_invoice component_invoice ON component_invoice.id = component_line.invoice_id
          LEFT JOIN app.import_invoice_line output_line ON output_line.id = ca.output_invoice_line_id
          LEFT JOIN app.import_supplier_invoice output_invoice ON output_invoice.id = output_line.invoice_id
          LEFT JOIN app.import_shipment_line output_shipment_line ON output_shipment_line.id = ca.output_shipment_line_id
          LEFT JOIN app.purchase_order_line output_pol ON output_pol.id = output_shipment_line.purchase_order_line_id
          LEFT JOIN app.purchase_order output_po ON output_po.id = output_pol.po_id
          LEFT JOIN app.sku output_sku ON output_sku.id = COALESCE(output_line.sku_id, output_pol.sku_id)
          WHERE ca.shipment_id = $1::uuid
          ORDER BY component_invoice.invoice_number ASC, component_line.line_number ASC
        `,
        shipmentId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            id, shipment_id AS "shipmentId", container_id AS "containerId",
            invoice_line_id AS "invoiceLineId", shipment_line_id AS "shipmentLineId", status,
            ownership_transfer_at AS "ownershipTransferAt",
            expected_receipt_at AS "expectedReceiptAt", received_at AS "receivedAt",
            quantity_in_transit AS "quantityInTransit", audit_reason AS "auditReason"
          FROM app.goods_in_transit_record
          WHERE shipment_id = $1::uuid
          ORDER BY created_at ASC
        `,
        shipmentId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            id, shipment_id AS "shipmentId", check_code AS "checkCode", status,
            expected_hnl_amount AS "expectedHnlAmount", actual_hnl_amount AS "actualHnlAmount",
            variance_hnl_amount AS "varianceHnlAmount", message
          FROM app.import_verification_check
          WHERE shipment_id = $1::uuid
          ORDER BY check_code ASC
        `,
        shipmentId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            id, shipment_id AS "shipmentId", invoice_line_id AS "invoiceLineId",
            sku_id AS "skuId", landed_unit_cost_hnl AS "landedUnitCostHnl",
            markup_factor AS "markupFactor", suggested_retail_hnl AS "suggestedRetailHnl",
            approval_status AS "approvalStatus", approved_by AS "approvedBy",
            approved_at AS "approvedAt"
          FROM app.import_suggested_price
          WHERE shipment_id = $1::uuid
          ORDER BY created_at ASC
        `,
        shipmentId,
      ),
    ]);

  const linesByInvoice = new Map<string, ImportInvoiceLineRecord[]>();
  for (const line of lines.map(mapInvoiceLine)) {
    const arr = linesByInvoice.get(line.invoiceId) ?? [];
    arr.push(line);
    linesByInvoice.set(line.invoiceId, arr);
  }
  const componentAllocationRecords = componentAllocationRows.map(mapImportCostComponentAllocation);
  const componentAllocationsByBuild = new Map<string, ImportCostComponentAllocationRecord[]>();
  for (const allocation of componentAllocationRecords) {
    const arr = componentAllocationsByBuild.get(allocation.buildId) ?? [];
    arr.push(allocation);
    componentAllocationsByBuild.set(allocation.buildId, arr);
  }
  const supplierInvoices = invoices.map((invoice) => mapInvoice(invoice, linesByInvoice.get(String(invoice.id)) ?? []));

  return {
    ...mapShipmentSummary(row),
    originPort: row.originPort ?? null,
    destinationPort: row.destinationPort ?? null,
    carrier: row.carrier ?? null,
    freightForwarder: row.freightForwarder ?? null,
    customsPolicyNumber: row.customsPolicyNumber ?? null,
    blNumber: row.blNumber ?? null,
    expectedDepartureAt: dateOnly(row.expectedDepartureAt),
    actualArrivalAt: dateOnly(row.actualArrivalAt),
    baseCurrency: 'HNL',
    notes: row.notes ?? null,
    approvedEstimateAt: nullableDateTime(row.approvedEstimateAt),
    approvedEstimateBy: row.approvedEstimateBy ?? null,
    finalLiquidationAt: nullableDateTime(row.finalLiquidationAt),
    closedAt: nullableDateTime(row.closedAt),
    createdBy: String(row.createdBy),
    containers: containers.map((c): ImportContainerRecord => ({
      id: String(c.id),
      shipmentId: String(c.shipmentId),
      containerNumber: c.containerNumber ?? null,
      containerType: c.containerType as ImportContainerType,
      sealNumber: c.sealNumber ?? null,
      cargoGroup: c.cargoGroup ?? null,
      status: c.status as ImportContainerStatus,
      expectedArrivalAt: dateOnly(c.expectedArrivalAt),
      actualArrivalAt: dateOnly(c.actualArrivalAt),
      notes: c.notes ?? null,
    })),
    shipmentLines: shipmentLines.map(mapImportShipmentLine),
    supplierInvoices,
    charges: charges.map(mapCharge),
    allocations: allocations.map((a): ImportLandedCostAllocationRecord => ({
      id: String(a.id),
      shipmentId: String(a.shipmentId),
      chargeId: String(a.chargeId),
      invoiceLineId: a.invoiceLineId ? String(a.invoiceLineId) : null,
      shipmentLineId: a.shipmentLineId ? String(a.shipmentLineId) : null,
      allocationBasis: 'PRODUCT_COST_SHARE',
      allocatedHnlAmount: toNumber(a.allocatedHnlAmount),
    })),
    costBuilds: costBuildRows.map((build) =>
      mapImportCostBuild(build, componentAllocationsByBuild.get(String(build.id)) ?? []),
    ),
    costBuildPreviews: buildImportCostBuildPreviews(supplierInvoices),
    goodsInTransit: gitRecords.map((g): GoodsInTransitRecordDto => ({
      id: String(g.id),
      shipmentId: String(g.shipmentId),
      containerId: g.containerId ?? null,
      invoiceLineId: g.invoiceLineId ?? null,
      shipmentLineId: g.shipmentLineId ?? null,
      status: g.status as GoodsInTransitStatus,
      ownershipTransferAt: dateOnly(g.ownershipTransferAt),
      expectedReceiptAt: dateOnly(g.expectedReceiptAt),
      receivedAt: dateOnly(g.receivedAt),
      quantityInTransit: nullableNumber(g.quantityInTransit),
      auditReason: g.auditReason ?? null,
    })),
    verificationChecks: checks.map((c): ImportVerificationCheckRecord => ({
      id: String(c.id),
      shipmentId: String(c.shipmentId),
      checkCode: String(c.checkCode),
      status: c.status,
      expectedHnlAmount: nullableNumber(c.expectedHnlAmount),
      actualHnlAmount: nullableNumber(c.actualHnlAmount),
      varianceHnlAmount: nullableNumber(c.varianceHnlAmount),
      message: c.message ?? null,
    })),
    suggestedPrices: suggestedPrices.map((p): ImportSuggestedPriceRecord => ({
      id: String(p.id),
      shipmentId: String(p.shipmentId),
      invoiceLineId: String(p.invoiceLineId),
      skuId: p.skuId ?? null,
      landedUnitCostHnl: toNumber(p.landedUnitCostHnl),
      markupFactor: toNumber(p.markupFactor),
      suggestedRetailHnl: toNumber(p.suggestedRetailHnl),
      approvalStatus: p.approvalStatus,
      approvedBy: p.approvedBy ?? null,
      approvedAt: nullableDateTime(p.approvedAt),
    })),
  };
}

export async function listImportShipmentAuditEvents(
  shipmentId: string,
  limit = 50,
): Promise<PlatformAuditEvent[]> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }

  const boundedLimit = Math.min(Math.max(limit, 1), 200);
  const [shipmentEvents, relatedEvents] = await Promise.all([
    listPlatformAuditEvents(prisma, {
      eventType: 'import_management',
      resourceType: 'import.shipment',
      resourceId: shipmentId,
      limit: boundedLimit,
    }),
    listPlatformAuditEvents(prisma, {
      eventType: 'import_management',
      metadataJsonContains: { shipmentId },
      limit: boundedLimit,
    }),
  ]);

  return [...new Map([...shipmentEvents, ...relatedEvents].map((event) => [event.id, event])).values()]
    .sort((a, b) => (
      b.createdAt.localeCompare(a.createdAt) ||
      b.id.localeCompare(a.id)
    ))
    .slice(0, boundedLimit);
}

export async function listImportShipmentLineCandidates(
  shipmentId: string,
  params: {
    q?: string;
    vendorCode?: string;
    buyer?: string;
    sourceCurrency?: ImportSourceCurrency;
    incotermCode?: string;
    poStatus?: string;
  } = {},
): Promise<ImportShipmentLineCandidate[]> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }

  const values: unknown[] = [];
  const where: string[] = [
    `po.status IN ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED')`,
    `GREATEST(pol.quantity_ordered - pol.quantity_received - COALESCE(ap.quantity_planned, 0), 0) > 0`,
    `NOT EXISTS (
      SELECT 1
      FROM app.import_shipment_line current_sl
      WHERE current_sl.shipment_id = $1::uuid
        AND current_sl.purchase_order_line_id = pol.id
        AND current_sl.status <> 'CANCELLED'
    )`,
  ];
  values.push(shipmentId);
  if (params.vendorCode?.trim()) {
    values.push(params.vendorCode.trim().toUpperCase());
    where.push(`UPPER(po.vendor_code) = $${values.length}`);
  }
  if (params.buyer?.trim()) {
    values.push(params.buyer.trim());
    where.push(`po.buyer = $${values.length}`);
  }
  if (params.sourceCurrency?.trim()) {
    values.push(params.sourceCurrency.trim().toUpperCase());
    where.push(`po.source_currency = $${values.length}`);
  }
  if (params.incotermCode?.trim()) {
    values.push(params.incotermCode.trim().toUpperCase());
    where.push(`po.incoterm_code = $${values.length}`);
  }
  if (params.poStatus?.trim()) {
    values.push(params.poStatus.trim().toUpperCase());
    where.push(`po.status = $${values.length}`);
  }
  if (params.q?.trim()) {
    values.push(`%${params.q.trim()}%`);
    where.push(`(
      po.po_number ILIKE $${values.length}
      OR po.vendor_code ILIKE $${values.length}
      OR COALESCE(sku.code, sku.provisional_code, '') ILIKE $${values.length}
      OR COALESCE(sku.description_web, sku.description_rics, sku.comment, '') ILIKE $${values.length}
      OR COALESCE(vo.mail_name, v.mail_name, vo.short_name, v.short_name, '') ILIKE $${values.length}
    )`);
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      WITH active_plans AS (
        SELECT
          sl.purchase_order_line_id,
          SUM(sl.expected_quantity) AS quantity_planned,
          STRING_AGG(
            s.shipment_number || ' (' || TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM sl.expected_quantity::text)) || ')',
            ', '
            ORDER BY s.shipment_number
          ) AS planned_shipments
        FROM app.import_shipment_line sl
        JOIN app.import_shipment s ON s.id = sl.shipment_id
        WHERE sl.status <> 'CANCELLED'
          AND s.status <> 'CANCELLED'
        GROUP BY sl.purchase_order_line_id
      )
      SELECT
        po.id AS "purchaseOrderId",
        po.po_number AS "purchaseOrderNumber",
        po.status AS "purchaseOrderStatus",
        pol.id AS "purchaseOrderLineId",
        po.vendor_code AS "vendorCode",
        COALESCE(vo.mail_name, v.mail_name, vo.short_name, v.short_name) AS "vendorName",
        po.buyer,
        po.source_currency AS "sourceCurrency",
        po.fx_rate AS "fxRate",
        po.fx_date AS "fxDate",
        po.incoterm_code AS "incotermCode",
        po.incoterm_place AS "incotermPlace",
        po.cost_basis AS "costBasis",
        pol.sku_id AS "skuId",
        COALESCE(sku.code, sku.provisional_code) AS "skuCode",
        COALESCE(sku.description_web, sku.description_rics, sku.comment) AS "description",
        pol.quantity_ordered AS "quantityOrdered",
        pol.quantity_received AS "quantityReceived",
        GREATEST(pol.quantity_ordered - pol.quantity_received, 0) AS "quantityOpen",
        COALESCE(ap.quantity_planned, 0) AS "quantityAlreadyPlanned",
        ap.planned_shipments AS "plannedShipments",
        GREATEST(pol.quantity_ordered - pol.quantity_received - COALESCE(ap.quantity_planned, 0), 0) AS "quantityAvailable",
        pol.source_unit_cost AS "sourceUnitCost",
        COALESCE(pol.commercial_unit_cost_hnl, pol.unit_cost) AS "commercialUnitCostHnl",
        COALESCE(pol.estimated_landed_unit_cost_hnl, pol.unit_cost) AS "estimatedLandedUnitCostHnl"
      FROM app.purchase_order_line pol
      JOIN app.purchase_order po ON po.id = pol.po_id
      LEFT JOIN app.vendor v ON v.code = po.vendor_code
      LEFT JOIN app.vendor_overlay vo ON vo.code = po.vendor_code AND (vo.source IS NULL OR vo.source <> 'tombstone')
      LEFT JOIN app.sku sku ON sku.id = pol.sku_id
      LEFT JOIN active_plans ap ON ap.purchase_order_line_id = pol.id
      WHERE ${where.join(' AND ')}
      ORDER BY po.po_number ASC, pol.line_sequence ASC
      LIMIT 100
    `,
    ...values,
  );
  return rows.map(mapImportShipmentLineCandidate);
}

export async function addImportShipmentLine(
  shipmentId: string,
  input: AddImportShipmentLineInput,
): Promise<ImportShipmentDetail> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }
  await assertShipmentLandedCostEditable(prisma, shipmentId);
  await assertContainerBelongsToShipment(prisma, shipmentId, input.containerId);

  const purchaseOrderLineId = requiredString(input.purchaseOrderLineId, 'purchaseOrderLineId');
  const existingRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      SELECT id
      FROM app.import_shipment_line
      WHERE shipment_id = $1::uuid
        AND purchase_order_line_id = $2::uuid
      LIMIT 1
    `,
    shipmentId,
    purchaseOrderLineId,
  );
  if (existingRows.length > 0) {
    throw new ImportManagementServiceError(409, 'SHIPMENT_LINE_EXISTS', 'This purchase-order line is already in the shipment.');
  }

  const candidate = await readPoLineShipmentCandidate(prisma, purchaseOrderLineId);
  if (!candidate) {
    throw new ImportManagementServiceError(404, 'PO_LINE_NOT_FOUND', 'Open purchase-order line not found.');
  }
  const expectedQuantity = input.expectedQuantity == null ? candidate.quantityAvailable : input.expectedQuantity;
  if (!Number.isFinite(expectedQuantity) || expectedQuantity <= 0) {
    throw new ImportManagementServiceError(422, 'INVALID_EXPECTED_QUANTITY', 'Expected quantity must be greater than zero.');
  }
  if (expectedQuantity > candidate.quantityAvailable) {
    throw new ImportManagementServiceError(
      409,
      'EXPECTED_QUANTITY_EXCEEDS_OPEN_PO',
      'Expected shipment quantity exceeds the remaining open quantity across active shipments.',
    );
  }
  const estimatedLandedUnitCostHnl =
    input.estimatedLandedUnitCostHnl == null
      ? candidate.estimatedLandedUnitCostHnl
      : input.estimatedLandedUnitCostHnl;
  if (!Number.isFinite(estimatedLandedUnitCostHnl) || estimatedLandedUnitCostHnl < 0) {
    throw new ImportManagementServiceError(422, 'INVALID_ESTIMATED_COST', 'Estimated landed unit cost must be non-negative.');
  }

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO app.import_shipment_line (
        shipment_id, purchase_order_line_id, container_id, expected_quantity,
        source_unit_cost, source_currency, fx_rate, fx_date,
        incoterm_code, incoterm_place, commercial_unit_cost_hnl, estimated_landed_unit_cost_hnl,
        allocated_landed_cost_hnl, landed_unit_cost_hnl, status, notes
      )
      VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4,
        $5, $6, $7, $8::date,
        $9, $10, $11, $12,
        0, $12, 'EXPECTED', $13
      )
    `,
    shipmentId,
    purchaseOrderLineId,
    cleanString(input.containerId),
    round4(expectedQuantity),
    candidate.sourceUnitCost,
    candidate.sourceCurrency,
    candidate.fxRate,
    candidate.fxDate,
    candidate.incotermCode,
    candidate.incotermPlace,
    candidate.commercialUnitCostHnl,
    estimatedLandedUnitCostHnl,
    cleanString(input.notes),
  );
  await markLandedCostStale(prisma, shipmentId);
  await refreshShipmentLineMatchVerification(prisma, shipmentId);
  await touchShipment(shipmentId);
  await recordImportAudit({
    action: 'ADD_EXPECTED_PO_LINE',
    resourceType: 'import.shipment_line',
    resourceId: null,
    metadataJson: {
      shipmentId,
      purchaseOrderLineId,
      expectedQuantity: round4(expectedQuantity),
      estimatedLandedUnitCostHnl,
    },
  });
  return getImportShipmentById(shipmentId) as Promise<ImportShipmentDetail>;
}

export async function updateImportShipmentLine(
  shipmentLineId: string,
  input: UpdateImportShipmentLineInput,
): Promise<ImportShipmentDetail> {
  const context = await getShipmentLineContext(prisma, shipmentLineId);
  if (!context) {
    throw new ImportManagementServiceError(404, 'SHIPMENT_LINE_NOT_FOUND', 'Import shipment line not found.');
  }
  const shipmentId = context.shipmentId;
  await assertShipmentLandedCostEditable(prisma, shipmentId);

  const candidate = await readPoLineShipmentCandidate(prisma, context.purchaseOrderLineId, shipmentLineId);
  if (!candidate) {
    throw new ImportManagementServiceError(404, 'PO_LINE_NOT_FOUND', 'Open purchase-order line not found.');
  }
  const nextContainerId = hasOwn(input, 'containerId') ? cleanString(input.containerId) : undefined;
  if (nextContainerId !== undefined) {
    await assertContainerBelongsToShipment(prisma, shipmentId, nextContainerId);
  }

  const nextQuantity = hasOwn(input, 'expectedQuantity') && input.expectedQuantity != null
    ? input.expectedQuantity
    : context.expectedQuantity;
  if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
    throw new ImportManagementServiceError(422, 'INVALID_EXPECTED_QUANTITY', 'Expected quantity must be greater than zero.');
  }
  if (nextQuantity > candidate.quantityAvailable) {
    throw new ImportManagementServiceError(
      409,
      'EXPECTED_QUANTITY_EXCEEDS_OPEN_PO',
      'Expected shipment quantity exceeds the remaining open quantity across active shipments.',
    );
  }

  const nextEstimate = hasOwn(input, 'estimatedLandedUnitCostHnl') && input.estimatedLandedUnitCostHnl != null
    ? input.estimatedLandedUnitCostHnl
    : candidate.estimatedLandedUnitCostHnl;
  if (!Number.isFinite(nextEstimate) || nextEstimate < 0) {
    throw new ImportManagementServiceError(422, 'INVALID_ESTIMATED_COST', 'Estimated landed unit cost must be non-negative.');
  }
  const nextStatus = hasOwn(input, 'status') ? normalizeShipmentLineStatus(input.status) : undefined;

  await prisma.$executeRawUnsafe(
    `
      UPDATE app.import_shipment_line
      SET container_id = CASE WHEN $2::boolean THEN $3::uuid ELSE container_id END,
          expected_quantity = $4,
          estimated_landed_unit_cost_hnl = $5,
          landed_unit_cost_hnl = $5,
          status = COALESCE($6, status),
          notes = CASE WHEN $7::boolean THEN $8 ELSE notes END,
          invoice_match_approved_at = CASE WHEN $9::boolean THEN NULL ELSE invoice_match_approved_at END,
          invoice_match_approved_by = CASE WHEN $9::boolean THEN NULL ELSE invoice_match_approved_by END,
          invoice_match_approval_reason = CASE WHEN $9::boolean THEN NULL ELSE invoice_match_approval_reason END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid
    `,
    shipmentLineId,
    hasOwn(input, 'containerId'),
    nextContainerId,
    round4(nextQuantity),
    nextEstimate,
    nextStatus ?? null,
    hasOwn(input, 'notes'),
    hasOwn(input, 'notes') ? cleanString(input.notes) : null,
    hasOwn(input, 'expectedQuantity') || hasOwn(input, 'estimatedLandedUnitCostHnl'),
  );
  await markLandedCostStale(prisma, shipmentId);
  await refreshShipmentLineMatchVerification(prisma, shipmentId);
  await touchShipment(shipmentId);
  await recordImportAudit({
    action: 'UPDATE_EXPECTED_PO_LINE',
    resourceType: 'import.shipment_line',
    resourceId: shipmentLineId,
    afterJson: input,
    metadataJson: {
      shipmentId,
      purchaseOrderLineId: context.purchaseOrderLineId,
      expectedQuantity: round4(nextQuantity),
      estimatedLandedUnitCostHnl: nextEstimate,
    },
  });
  return getImportShipmentById(shipmentId) as Promise<ImportShipmentDetail>;
}

export async function removeImportShipmentLine(shipmentLineId: string): Promise<ImportShipmentDetail> {
  const context = await getShipmentLineContext(prisma, shipmentLineId);
  if (!context) {
    throw new ImportManagementServiceError(404, 'SHIPMENT_LINE_NOT_FOUND', 'Import shipment line not found.');
  }
  await assertShipmentLandedCostEditable(prisma, context.shipmentId);
  await prisma.$executeRawUnsafe(`DELETE FROM app.import_shipment_line WHERE id = $1::uuid`, shipmentLineId);
  await markLandedCostStale(prisma, context.shipmentId);
  await refreshShipmentLineMatchVerification(prisma, context.shipmentId);
  await touchShipment(context.shipmentId);
  return getImportShipmentById(context.shipmentId) as Promise<ImportShipmentDetail>;
}

export async function matchImportShipmentLineInvoice(
  shipmentLineId: string,
  input: MatchImportShipmentLineInvoiceInput,
): Promise<ImportShipmentDetail> {
  const context = await getShipmentLineContext(prisma, shipmentLineId);
  if (!context) {
    throw new ImportManagementServiceError(404, 'SHIPMENT_LINE_NOT_FOUND', 'Import shipment line not found.');
  }
  await assertShipmentLandedCostEditable(prisma, context.shipmentId);
  const invoiceLineId = cleanString(input.invoiceLineId);

  if (!invoiceLineId) {
    await prisma.$executeRawUnsafe(
      `
        UPDATE app.import_shipment_line
        SET invoice_line_id = NULL,
            status = 'EXPECTED',
            invoice_match_approved_at = NULL,
            invoice_match_approved_by = NULL,
            invoice_match_approval_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      shipmentLineId,
    );
    await markLandedCostStale(prisma, context.shipmentId);
    await refreshShipmentLineMatchVerification(prisma, context.shipmentId);
    await touchShipment(context.shipmentId);
    await recordImportAudit({
      action: 'CLEAR_INVOICE_MATCH',
      resourceType: 'import.shipment_line',
      resourceId: shipmentLineId,
      metadataJson: { shipmentId: context.shipmentId, previousInvoiceLineId: context.invoiceLineId },
    });
    return getImportShipmentById(context.shipmentId) as Promise<ImportShipmentDetail>;
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        si.shipment_id AS "shipmentId",
        il.purchase_order_line_id AS "invoicePurchaseOrderLineId",
        il.sku_id AS "invoiceSkuId",
        pol.sku_id AS "poSkuId",
        EXISTS (
          SELECT 1
          FROM app.import_shipment_line other
          WHERE other.invoice_line_id = il.id
            AND other.id <> $2::uuid
        ) AS "alreadyMatched"
      FROM app.import_invoice_line il
      JOIN app.import_supplier_invoice si ON si.id = il.invoice_id
      JOIN app.purchase_order_line pol ON pol.id = $3::uuid
      WHERE il.id = $1::uuid
      LIMIT 1
    `,
    invoiceLineId,
    shipmentLineId,
    context.purchaseOrderLineId,
  );
  const row = rows[0];
  if (!row) {
    throw new ImportManagementServiceError(404, 'INVOICE_LINE_NOT_FOUND', 'Import invoice line not found.');
  }
  if (String(row.shipmentId) !== context.shipmentId) {
    throw new ImportManagementServiceError(409, 'LINE_SHIPMENT_MISMATCH', 'Invoice line belongs to a different shipment.');
  }
  if (row.alreadyMatched) {
    throw new ImportManagementServiceError(409, 'INVOICE_LINE_ALREADY_MATCHED', 'Invoice line is already matched to another expected PO line.');
  }
  if (row.invoicePurchaseOrderLineId && String(row.invoicePurchaseOrderLineId) !== context.purchaseOrderLineId) {
    throw new ImportManagementServiceError(409, 'INVOICE_LINE_PO_MISMATCH', 'Invoice line is linked to a different purchase-order line.');
  }
  if (row.invoiceSkuId && row.poSkuId && String(row.invoiceSkuId) !== String(row.poSkuId)) {
    throw new ImportManagementServiceError(409, 'INVOICE_LINE_SKU_MISMATCH', 'Invoice line SKU does not match the purchase-order line SKU.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `
        UPDATE app.import_invoice_line
        SET purchase_order_line_id = $2::uuid,
            sku_id = COALESCE(sku_id, $3::uuid),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      invoiceLineId,
      context.purchaseOrderLineId,
      String(row.poSkuId),
    );
    await tx.$executeRawUnsafe(
      `
        UPDATE app.import_shipment_line
        SET invoice_line_id = $2::uuid,
            status = 'MATCHED',
            invoice_match_approved_at = NULL,
            invoice_match_approved_by = NULL,
            invoice_match_approval_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      shipmentLineId,
      invoiceLineId,
    );
    await markLandedCostStale(tx, context.shipmentId);
    await refreshShipmentLineMatchVerification(tx, context.shipmentId);
    await tx.$executeRawUnsafe(
      `UPDATE app.import_shipment SET updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
      context.shipmentId,
    );
  });

  await recordImportAudit({
    action: 'MATCH_INVOICE_LINE',
    resourceType: 'import.shipment_line',
    resourceId: shipmentLineId,
    afterJson: { invoiceLineId },
    metadataJson: { shipmentId: context.shipmentId, purchaseOrderLineId: context.purchaseOrderLineId },
  });
  return getImportShipmentById(context.shipmentId) as Promise<ImportShipmentDetail>;
}

export async function approveImportShipmentLineInvoiceMatch(
  shipmentLineId: string,
  input: ApproveImportShipmentLineInvoiceMatchInput,
  actor?: string | null,
): Promise<ImportShipmentDetail> {
  const context = await getShipmentLineContext(prisma, shipmentLineId);
  if (!context) {
    throw new ImportManagementServiceError(404, 'SHIPMENT_LINE_NOT_FOUND', 'Import shipment line not found.');
  }
  await assertShipmentLandedCostEditable(prisma, context.shipmentId);
  if (!context.invoiceLineId) {
    throw new ImportManagementServiceError(409, 'SHIPMENT_LINE_NOT_MATCHED', 'Expected PO line is not matched to a supplier invoice line.');
  }

  if (!input.approved) {
    await prisma.$executeRawUnsafe(
      `
        UPDATE app.import_shipment_line
        SET invoice_match_approved_at = NULL,
            invoice_match_approved_by = NULL,
            invoice_match_approval_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      shipmentLineId,
    );
    await refreshShipmentLineMatchVerification(prisma, context.shipmentId);
    await touchShipment(context.shipmentId);
    await recordImportAudit({
      action: 'CLEAR_INVOICE_MATCH_APPROVAL',
      resourceType: 'import.shipment_line',
      resourceId: shipmentLineId,
      actor,
      metadataJson: { shipmentId: context.shipmentId, invoiceLineId: context.invoiceLineId },
    });
    return getImportShipmentById(context.shipmentId) as Promise<ImportShipmentDetail>;
  }

  const reason = cleanString(input.reason);
  if (!reason) {
    throw new ImportManagementServiceError(422, 'MATCH_APPROVAL_REASON_REQUIRED', 'Approval reason is required for invoice match mismatches.');
  }
  const approvedBy = cleanString(input.approvedBy) ?? cleanString(actor) ?? 'system';

  await prisma.$executeRawUnsafe(
    `
      UPDATE app.import_shipment_line
      SET invoice_match_approved_at = CURRENT_TIMESTAMP,
          invoice_match_approved_by = $2,
          invoice_match_approval_reason = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid
    `,
    shipmentLineId,
    approvedBy,
    reason,
  );
  await refreshShipmentLineMatchVerification(prisma, context.shipmentId);
  await touchShipment(context.shipmentId);
  await recordImportAudit({
    action: 'APPROVE_INVOICE_MATCH_MISMATCH',
    resourceType: 'import.shipment_line',
    resourceId: shipmentLineId,
    actor: approvedBy,
    reason,
    afterJson: { approvedBy, reason },
    metadataJson: { shipmentId: context.shipmentId, invoiceLineId: context.invoiceLineId },
  });
  return getImportShipmentById(context.shipmentId) as Promise<ImportShipmentDetail>;
}

function normalizedMatchText(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
}

function buildMatchWarnings(input: {
  expectedQuantity: number;
  invoiceQuantity: number;
  expectedSourceCurrency: ImportSourceCurrency;
  invoiceSourceCurrency: ImportSourceCurrency;
  expectedHnlAmount: number;
  invoiceHnlAmount: number;
}): string[] {
  const warnings: string[] = [];
  if (Math.abs(input.invoiceQuantity - input.expectedQuantity) > 0.0001) {
    warnings.push(`Quantity differs: invoice ${round4(input.invoiceQuantity)} vs expected ${round4(input.expectedQuantity)}.`);
  }
  if (input.invoiceSourceCurrency !== input.expectedSourceCurrency) {
    warnings.push(`Currency differs: invoice ${input.invoiceSourceCurrency} vs expected ${input.expectedSourceCurrency}.`);
  }
  if (Math.abs(round2(input.invoiceHnlAmount) - round2(input.expectedHnlAmount)) > 0.01) {
    warnings.push(`HNL amount differs: invoice ${round2(input.invoiceHnlAmount)} vs expected ${round2(input.expectedHnlAmount)}.`);
  }
  return warnings;
}

export async function listImportInvoiceMatchSuggestions(
  shipmentId: string,
): Promise<ImportInvoiceMatchSuggestion[]> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }

  const [shipmentLineRows, invoiceLineRows] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `
        SELECT
          sl.id AS "shipmentLineId",
          sl.purchase_order_line_id AS "purchaseOrderLineId",
          po.po_number AS "purchaseOrderNumber",
          COALESCE(sku.code, sku.provisional_code) AS "expectedSkuCode",
          COALESCE(sku.description_web, sku.description_rics, sku.comment) AS "expectedDescription",
          sl.expected_quantity AS "expectedQuantity",
          sl.source_currency AS "expectedSourceCurrency",
          sl.expected_quantity * sl.commercial_unit_cost_hnl AS "expectedHnlAmount",
          pol.sku_id AS "expectedSkuId"
        FROM app.import_shipment_line sl
        JOIN app.purchase_order_line pol ON pol.id = sl.purchase_order_line_id
        JOIN app.purchase_order po ON po.id = pol.po_id
        LEFT JOIN app.sku sku ON sku.id = pol.sku_id
        WHERE sl.shipment_id = $1::uuid
          AND sl.status <> 'CANCELLED'
          AND sl.invoice_line_id IS NULL
        ORDER BY po.po_number ASC, pol.line_sequence ASC
      `,
      shipmentId,
    ),
    prisma.$queryRawUnsafe<any[]>(
      `
        SELECT
          il.id AS "invoiceLineId",
          si.invoice_number AS "invoiceNumber",
          il.purchase_order_line_id AS "invoicePurchaseOrderLineId",
          COALESCE(il.sku_id, pol.sku_id) AS "invoiceSkuId",
          COALESCE(sku.code, sku.provisional_code) AS "invoiceSkuCode",
          il.item_code AS "invoiceItemCode",
          il.description AS "invoiceDescription",
          il.quantity AS "invoiceQuantity",
          il.source_currency AS "invoiceSourceCurrency",
          il.hnl_amount AS "invoiceHnlAmount"
        FROM app.import_supplier_invoice si
        JOIN app.import_invoice_line il ON il.invoice_id = si.id
        LEFT JOIN app.purchase_order_line pol ON pol.id = il.purchase_order_line_id
        LEFT JOIN app.sku sku ON sku.id = COALESCE(il.sku_id, pol.sku_id)
        WHERE si.shipment_id = $1::uuid
          AND NOT EXISTS (
            SELECT 1
            FROM app.import_shipment_line sl
            WHERE sl.invoice_line_id = il.id
              AND sl.status <> 'CANCELLED'
          )
        ORDER BY si.invoice_number ASC, il.line_number ASC
      `,
      shipmentId,
    ),
  ]);

  const suggestions: ImportInvoiceMatchSuggestion[] = [];
  for (const sl of shipmentLineRows) {
    const expectedQuantity = toNumber(sl.expectedQuantity);
    const expectedHnlAmount = round2(toNumber(sl.expectedHnlAmount));
    const expectedSkuId = sl.expectedSkuId ? String(sl.expectedSkuId) : null;
    const expectedSkuCode = sl.expectedSkuCode ?? null;
    const expectedText = normalizedMatchText(`${expectedSkuCode ?? ''} ${sl.expectedDescription ?? ''}`);

    const ranked = invoiceLineRows.map((il) => {
      const invoiceQuantity = toNumber(il.invoiceQuantity);
      const invoiceHnlAmount = round2(toNumber(il.invoiceHnlAmount));
      const invoiceSkuId = il.invoiceSkuId ? String(il.invoiceSkuId) : null;
      const invoiceSkuCode = il.invoiceSkuCode ?? null;
      const invoiceText = normalizedMatchText(`${invoiceSkuCode ?? ''} ${il.invoiceItemCode ?? ''} ${il.invoiceDescription ?? ''}`);
      const reasons: string[] = [];
      let score = 0;

      if (il.invoicePurchaseOrderLineId && String(il.invoicePurchaseOrderLineId) === String(sl.purchaseOrderLineId)) {
        score += 55;
        reasons.push('PO line matches');
      }
      if (expectedSkuId && invoiceSkuId && expectedSkuId === invoiceSkuId) {
        score += 25;
        reasons.push('SKU matches');
      } else if (expectedSkuCode && invoiceText.includes(normalizedMatchText(expectedSkuCode))) {
        score += 15;
        reasons.push('SKU code appears on invoice line');
      }
      if (Math.abs(invoiceQuantity - expectedQuantity) <= 0.0001) {
        score += 15;
        reasons.push('quantity matches');
      } else if (expectedQuantity > 0 && Math.abs(invoiceQuantity - expectedQuantity) / expectedQuantity <= 0.05) {
        score += 8;
        reasons.push('quantity is close');
      }
      if (il.invoiceSourceCurrency === sl.expectedSourceCurrency) {
        score += 5;
        reasons.push('currency matches');
      }
      if (expectedHnlAmount > 0 && Math.abs(invoiceHnlAmount - expectedHnlAmount) / expectedHnlAmount <= 0.01) {
        score += 10;
        reasons.push('HNL amount matches');
      } else if (expectedHnlAmount > 0 && Math.abs(invoiceHnlAmount - expectedHnlAmount) / expectedHnlAmount <= 0.05) {
        score += 5;
        reasons.push('HNL amount is close');
      }
      if (expectedText && invoiceText && (invoiceText.includes(expectedText) || expectedText.includes(invoiceText))) {
        score += 5;
        reasons.push('description is similar');
      }

      const warnings = buildMatchWarnings({
        expectedQuantity,
        invoiceQuantity,
        expectedSourceCurrency: sl.expectedSourceCurrency as ImportSourceCurrency,
        invoiceSourceCurrency: il.invoiceSourceCurrency as ImportSourceCurrency,
        expectedHnlAmount,
        invoiceHnlAmount,
      });

      return {
        shipmentLineId: String(sl.shipmentLineId),
        purchaseOrderLineId: String(sl.purchaseOrderLineId),
        purchaseOrderNumber: String(sl.purchaseOrderNumber),
        expectedSkuCode,
        expectedDescription: sl.expectedDescription ?? null,
        expectedQuantity,
        expectedSourceCurrency: sl.expectedSourceCurrency as ImportSourceCurrency,
        expectedHnlAmount,
        invoiceLineId: String(il.invoiceLineId),
        invoiceNumber: String(il.invoiceNumber),
        invoiceSkuCode,
        invoiceItemCode: il.invoiceItemCode ?? null,
        invoiceDescription: il.invoiceDescription ?? null,
        invoiceQuantity,
        invoiceSourceCurrency: il.invoiceSourceCurrency as ImportSourceCurrency,
        invoiceHnlAmount,
        score: Math.min(100, score),
        reasons,
        warnings,
      };
    })
      .filter((suggestion) => suggestion.score >= 35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    suggestions.push(...ranked);
  }

  return suggestions.sort((a, b) =>
    a.purchaseOrderNumber.localeCompare(b.purchaseOrderNumber) ||
    b.score - a.score ||
    a.invoiceNumber.localeCompare(b.invoiceNumber),
  );
}

export async function applyImportInvoiceMatchSuggestions(
  shipmentId: string,
  input: ApplyImportInvoiceMatchSuggestionsInput = {},
): Promise<ApplyImportInvoiceMatchSuggestionsResult> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }
  await assertShipmentLandedCostEditable(prisma, shipmentId);

  const minScore = input.minScore ?? 85;
  const allowWarnings = Boolean(input.allowWarnings);
  const scopedShipmentLineIds = new Set((input.shipmentLineIds ?? []).map(String));
  const suggestions = await listImportInvoiceMatchSuggestions(shipmentId);
  const ranked = suggestions
    .filter((suggestion) =>
      (scopedShipmentLineIds.size === 0 || scopedShipmentLineIds.has(suggestion.shipmentLineId)) &&
      suggestion.score >= minScore,
    )
    .sort((a, b) =>
      b.score - a.score ||
      a.purchaseOrderNumber.localeCompare(b.purchaseOrderNumber) ||
      a.invoiceNumber.localeCompare(b.invoiceNumber),
    );

  const appliedCandidates: ImportInvoiceMatchSuggestion[] = [];
  const skipped: ApplyImportInvoiceMatchSuggestionsResult['skipped'] = [];
  const usedShipmentLines = new Set<string>();
  const usedInvoiceLines = new Set<string>();

  for (const suggestion of ranked) {
    if (usedShipmentLines.has(suggestion.shipmentLineId)) {
      skipped.push({
        shipmentLineId: suggestion.shipmentLineId,
        invoiceLineId: suggestion.invoiceLineId,
        purchaseOrderNumber: suggestion.purchaseOrderNumber,
        invoiceNumber: suggestion.invoiceNumber,
        score: suggestion.score,
        warnings: suggestion.warnings,
        reason: 'A higher-ranked invoice suggestion was already selected for this expected PO line.',
      });
      continue;
    }
    if (usedInvoiceLines.has(suggestion.invoiceLineId)) {
      skipped.push({
        shipmentLineId: suggestion.shipmentLineId,
        invoiceLineId: suggestion.invoiceLineId,
        purchaseOrderNumber: suggestion.purchaseOrderNumber,
        invoiceNumber: suggestion.invoiceNumber,
        score: suggestion.score,
        warnings: suggestion.warnings,
        reason: 'This invoice line was already selected for another expected PO line.',
      });
      continue;
    }
    if (!allowWarnings && suggestion.warnings.length > 0) {
      skipped.push({
        shipmentLineId: suggestion.shipmentLineId,
        invoiceLineId: suggestion.invoiceLineId,
        purchaseOrderNumber: suggestion.purchaseOrderNumber,
        invoiceNumber: suggestion.invoiceNumber,
        score: suggestion.score,
        warnings: suggestion.warnings,
        reason: 'Suggestion has warnings and requires manual review.',
      });
      continue;
    }

    usedShipmentLines.add(suggestion.shipmentLineId);
    usedInvoiceLines.add(suggestion.invoiceLineId);
    appliedCandidates.push(suggestion);
  }

  const applied: ImportInvoiceMatchSuggestion[] = [];
  if (appliedCandidates.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const suggestion of appliedCandidates) {
        const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `
            UPDATE app.import_shipment_line sl
            SET invoice_line_id = $2::uuid,
                status = 'MATCHED',
                invoice_match_approved_at = NULL,
                invoice_match_approved_by = NULL,
                invoice_match_approval_reason = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE sl.id = $1::uuid
              AND sl.shipment_id = $3::uuid
              AND sl.status <> 'CANCELLED'
              AND sl.invoice_line_id IS NULL
              AND NOT EXISTS (
                SELECT 1
                FROM app.import_shipment_line existing
                WHERE existing.invoice_line_id = $2::uuid
                  AND existing.status <> 'CANCELLED'
              )
            RETURNING sl.id
          `,
          suggestion.shipmentLineId,
          suggestion.invoiceLineId,
          shipmentId,
        );
        if (rows.length > 0) {
          applied.push(suggestion);
        } else {
          skipped.push({
            shipmentLineId: suggestion.shipmentLineId,
            invoiceLineId: suggestion.invoiceLineId,
            purchaseOrderNumber: suggestion.purchaseOrderNumber,
            invoiceNumber: suggestion.invoiceNumber,
            score: suggestion.score,
            warnings: suggestion.warnings,
            reason: 'Expected PO line or invoice line was matched by another action before bulk apply completed.',
          });
        }
      }
      await markLandedCostStale(tx, shipmentId);
      await refreshShipmentLineMatchVerification(tx, shipmentId);
      await tx.$executeRawUnsafe(
        `UPDATE app.import_shipment SET updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
        shipmentId,
      );
    });
  }

  const shipment = await getImportShipmentById(shipmentId);
  if (!shipment) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }

  return {
    shipment,
    appliedCount: applied.length,
    skippedCount: skipped.length,
    applied,
    skipped,
  };
}

export async function addImportSupplierInvoice(
  shipmentId: string,
  input: CreateImportSupplierInvoiceInput,
): Promise<ImportShipmentDetail> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }
  const money = normalizeMoney(input);
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO app.import_supplier_invoice (
        shipment_id, invoice_number, supplier_code, supplier_name, invoice_date,
        invoice_group, invoice_kind, source_amount, source_currency, fx_rate,
        fx_date, hnl_amount, notes
      )
      VALUES (
        $1::uuid, $2, $3, $4, $5::date,
        $6, $7, $8, $9, $10,
        $11::date, $12, $13
      )
    `,
    shipmentId,
    requiredString(input.invoiceNumber, 'invoiceNumber'),
    cleanString(input.supplierCode),
    requiredString(input.supplierName, 'supplierName'),
    optionalDate(input.invoiceDate, 'invoiceDate'),
    input.invoiceGroup ?? 'TAXABLE',
    input.invoiceKind ?? 'MERCHANDISE',
    money.sourceAmount,
    money.sourceCurrency,
    money.fxRate,
    money.fxDate,
    money.hnlAmount,
    cleanString(input.notes),
  );
  await touchShipment(shipmentId);
  await recordImportAudit({
    action: 'CREATE_SUPPLIER_INVOICE',
    resourceType: 'import.supplier_invoice',
    resourceId: null,
    afterJson: {
      invoiceNumber: input.invoiceNumber,
      supplierCode: input.supplierCode ?? null,
      supplierName: input.supplierName,
      invoiceKind: input.invoiceKind ?? 'MERCHANDISE',
      sourceAmount: money.sourceAmount,
      sourceCurrency: money.sourceCurrency,
      fxRate: money.fxRate,
      fxDate: money.fxDate,
      hnlAmount: money.hnlAmount,
    },
    metadataJson: { shipmentId },
  });
  return getImportShipmentById(shipmentId) as Promise<ImportShipmentDetail>;
}

export async function updateImportSupplierInvoice(
  invoiceId: string,
  input: UpdateImportSupplierInvoiceInput,
): Promise<ImportShipmentDetail> {
  const shipmentId = await getSupplierInvoiceShipmentId(invoiceId);
  if (!shipmentId) {
    throw new ImportManagementServiceError(404, 'INVOICE_NOT_FOUND', 'Import supplier invoice not found.');
  }

  await assertImportPayableSourceNotSent(prisma, 'SUPPLIER_INVOICE', invoiceId);
  const money = normalizeMoney(input);
  await prisma.$executeRawUnsafe(
    `
      UPDATE app.import_supplier_invoice
      SET invoice_number = $2,
          supplier_code = $3,
          supplier_name = $4,
          invoice_date = $5::date,
          invoice_group = $6,
          invoice_kind = $7,
          source_amount = $8,
          source_currency = $9,
          fx_rate = $10,
          fx_date = $11::date,
          hnl_amount = $12,
          notes = $13,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid
    `,
    invoiceId,
    requiredString(input.invoiceNumber, 'invoiceNumber'),
    cleanString(input.supplierCode),
    requiredString(input.supplierName, 'supplierName'),
    optionalDate(input.invoiceDate, 'invoiceDate'),
    input.invoiceGroup ?? 'TAXABLE',
    input.invoiceKind ?? 'MERCHANDISE',
    money.sourceAmount,
    money.sourceCurrency,
    money.fxRate,
    money.fxDate,
    money.hnlAmount,
    cleanString(input.notes),
  );
  await touchShipment(shipmentId);
  await recordImportAudit({
    action: 'UPDATE_SUPPLIER_INVOICE_COST',
    resourceType: 'import.supplier_invoice',
    resourceId: invoiceId,
    afterJson: {
      invoiceNumber: input.invoiceNumber,
      supplierCode: input.supplierCode ?? null,
      supplierName: input.supplierName,
      invoiceKind: input.invoiceKind ?? 'MERCHANDISE',
      sourceAmount: money.sourceAmount,
      sourceCurrency: money.sourceCurrency,
      fxRate: money.fxRate,
      fxDate: money.fxDate,
      hnlAmount: money.hnlAmount,
    },
    metadataJson: { shipmentId },
  });
  return getImportShipmentById(shipmentId) as Promise<ImportShipmentDetail>;
}

async function getInvoiceDefaults(invoiceId: string): Promise<{
  shipmentId: string;
  sourceCurrency: ImportSourceCurrency;
  fxRate: number;
  fxDate: string;
  nextLineNumber: number;
} | null> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        si.shipment_id AS "shipmentId",
        si.source_currency AS "sourceCurrency",
        si.fx_rate AS "fxRate",
        si.fx_date AS "fxDate",
        COALESCE(MAX(il.line_number), 0) + 1 AS "nextLineNumber"
      FROM app.import_supplier_invoice si
      LEFT JOIN app.import_invoice_line il ON il.invoice_id = si.id
      WHERE si.id = $1::uuid
      GROUP BY si.id
      LIMIT 1
    `,
    invoiceId,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    shipmentId: String(row.shipmentId),
    sourceCurrency: row.sourceCurrency,
    fxRate: toNumber(row.fxRate),
    fxDate: dateOnly(row.fxDate) ?? '',
    nextLineNumber: toNumber(row.nextLineNumber),
  };
}

async function getSupplierInvoiceShipmentId(invoiceId: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ shipmentId: string }>>(
    `SELECT shipment_id AS "shipmentId" FROM app.import_supplier_invoice WHERE id = $1::uuid LIMIT 1`,
    invoiceId,
  );
  return rows[0]?.shipmentId ? String(rows[0].shipmentId) : null;
}

async function getInvoiceLineContext(invoiceLineId: string): Promise<{
  shipmentId: string;
  invoiceId: string;
  sourceCurrency: ImportSourceCurrency;
  fxRate: number;
  fxDate: string;
  lineNumber: number;
  costRole: ImportInvoiceLineCostRole;
  receiptPolicy: ImportInvoiceLineReceiptPolicy;
  allocationGroupKey: string | null;
} | null> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        si.shipment_id AS "shipmentId",
        il.invoice_id AS "invoiceId",
        il.source_currency AS "sourceCurrency",
        il.fx_rate AS "fxRate",
        il.fx_date AS "fxDate",
        il.line_number AS "lineNumber",
        il.cost_role AS "costRole",
        il.receipt_policy AS "receiptPolicy",
        il.allocation_group_key AS "allocationGroupKey"
      FROM app.import_invoice_line il
      JOIN app.import_supplier_invoice si ON si.id = il.invoice_id
      WHERE il.id = $1::uuid
      LIMIT 1
    `,
    invoiceLineId,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    shipmentId: String(row.shipmentId),
    invoiceId: String(row.invoiceId),
    sourceCurrency: row.sourceCurrency as ImportSourceCurrency,
    fxRate: toNumber(row.fxRate),
    fxDate: dateOnly(row.fxDate) ?? '',
    lineNumber: toNumber(row.lineNumber),
    costRole: mapCostRole(row.costRole),
    receiptPolicy: mapReceiptPolicy(row.receiptPolicy, mapCostRole(row.costRole)),
    allocationGroupKey: row.allocationGroupKey ?? null,
  };
}

async function getImportPayableHandoffStatus(
  client: SqlClient,
  sourceType: ImportPayableSourceType,
  sourceId: string,
): Promise<ImportPayableHandoffStatus | null> {
  const rows = await client.$queryRawUnsafe<Array<{ handoffStatus: ImportPayableHandoffStatus }>>(
    `
      SELECT handoff_status AS "handoffStatus"
      FROM app.import_payable_handoff
      WHERE source_type = $1
        AND source_id = $2::uuid
      LIMIT 1
    `,
    sourceType,
    sourceId,
  );
  return rows[0]?.handoffStatus ?? null;
}

async function assertImportPayableSourceNotSent(
  client: SqlClient,
  sourceType: ImportPayableSourceType,
  sourceId: string,
): Promise<void> {
  assertImportPayableSourceEditable(
    sourceType,
    await getImportPayableHandoffStatus(client, sourceType, sourceId),
  );
}

async function assertShipmentLandedCostEditable(client: SqlClient, shipmentId: string): Promise<void> {
  const rows = await client.$queryRawUnsafe<Array<{ postedSuggestedPriceCount: unknown }>>(
    `
      SELECT COUNT(*) AS "postedSuggestedPriceCount"
      FROM app.import_suggested_price
      WHERE shipment_id = $1::uuid
        AND approval_status = 'POSTED'
    `,
    shipmentId,
  );
  assertImportLandedCostEditable(toNumber(rows[0]?.postedSuggestedPriceCount ?? 0));
}

async function markLandedCostStale(client: SqlClient, shipmentId: string): Promise<void> {
  await assertShipmentLandedCostEditable(client, shipmentId);
  await client.$executeRawUnsafe(
    `DELETE FROM app.import_cost_component_allocation WHERE shipment_id = $1::uuid`,
    shipmentId,
  );
  await client.$executeRawUnsafe(
    `DELETE FROM app.import_cost_build WHERE shipment_id = $1::uuid`,
    shipmentId,
  );
  await client.$executeRawUnsafe(
    `DELETE FROM app.import_landed_cost_allocation WHERE shipment_id = $1::uuid`,
    shipmentId,
  );
  await client.$executeRawUnsafe(
    `DELETE FROM app.import_suggested_price WHERE shipment_id = $1::uuid`,
    shipmentId,
  );
  await client.$executeRawUnsafe(
    `
      UPDATE app.import_invoice_line il
      SET allocated_landed_cost_hnl = 0,
          component_allocated_cost_hnl = 0,
          commercial_unit_cost_hnl = il.base_unit_cost_hnl,
          landed_unit_cost_hnl = CASE
            WHEN il.receipt_policy = 'RECEIVE_TO_STOCK' THEN il.base_unit_cost_hnl
            ELSE NULL
          END,
          updated_at = CURRENT_TIMESTAMP
      FROM app.import_supplier_invoice si
      WHERE si.id = il.invoice_id
        AND si.shipment_id = $1::uuid
    `,
    shipmentId,
  );
  await client.$executeRawUnsafe(
    `
      UPDATE app.import_shipment_line
      SET allocated_landed_cost_hnl = 0,
          landed_unit_cost_hnl = estimated_landed_unit_cost_hnl,
          updated_at = CURRENT_TIMESTAMP
      WHERE shipment_id = $1::uuid
    `,
    shipmentId,
  );
  await upsertVerificationCheck(client, shipmentId, {
    checkCode: 'ALLOCATION_RECONCILES',
    status: 'PENDING',
    message: 'Landed-cost allocation must be rerun after invoice lines or charges changed.',
  });
}

export async function addImportInvoiceLine(
  invoiceId: string,
  input: CreateImportInvoiceLineInput,
): Promise<ImportShipmentDetail> {
  const defaults = await getInvoiceDefaults(invoiceId);
  if (!defaults) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import supplier invoice not found.');
  }
  await assertImportPayableSourceNotSent(prisma, 'SUPPLIER_INVOICE', invoiceId);
  await assertShipmentLandedCostEditable(prisma, defaults.shipmentId);
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new ImportManagementServiceError(422, 'INVALID_QUANTITY', 'quantity must be greater than zero.');
  }

  const sourceAmount =
    input.sourceAmount ?? (input.sourceUnitCost != null ? round4(input.sourceUnitCost * input.quantity) : null);
  if (sourceAmount == null) {
    throw new ImportManagementServiceError(422, 'INVALID_AMOUNT', 'sourceAmount or sourceUnitCost is required.');
  }
  const money = normalizeMoney({
    sourceAmount,
    sourceCurrency: input.sourceCurrency ?? defaults.sourceCurrency,
    fxRate: input.fxRate ?? defaults.fxRate,
    fxDate: input.fxDate ?? defaults.fxDate,
    hnlAmount: input.hnlAmount,
  });
  const lineNumber = input.lineNumber ?? defaults.nextLineNumber;
  const baseUnitCostHnl = round4(money.hnlAmount / input.quantity);
  const { costRole, receiptPolicy } = normalizeImportInvoiceLineRoleState(input);
  const allocationGroupKey = cleanString(input.allocationGroupKey);
  const landedUnitCostHnl = isReceiptablePolicy(receiptPolicy) ? baseUnitCostHnl : null;

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO app.import_invoice_line (
        invoice_id, sku_id, purchase_order_line_id, line_number, item_code,
        style_code, description, material_meters, carton_count, weight_kg, volume_cbm,
        quantity, unit_of_measure, source_unit_cost, source_amount, source_currency,
        fx_rate, fx_date, hnl_amount, base_unit_cost_hnl, commercial_unit_cost_hnl,
        landed_unit_cost_hnl, cost_role, receipt_policy, allocation_group_key,
        component_allocated_cost_hnl, taxable
      )
      VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18::date, $19, $20, $20,
        $21, $22, $23, $24,
        0, $25
      )
    `,
    invoiceId,
    cleanString(input.skuId),
    cleanString(input.purchaseOrderLineId),
    lineNumber,
    cleanString(input.itemCode),
    cleanString(input.styleCode),
    cleanString(input.description),
    input.materialMeters ?? null,
    input.cartonCount ?? null,
    input.weightKg ?? null,
    input.volumeCbm ?? null,
    input.quantity,
    cleanString(input.unitOfMeasure) ?? 'UNIT',
    input.sourceUnitCost ?? (sourceAmount / input.quantity),
    money.sourceAmount,
    money.sourceCurrency,
    money.fxRate,
    money.fxDate,
    money.hnlAmount,
    baseUnitCostHnl,
    landedUnitCostHnl,
    costRole,
    receiptPolicy,
    allocationGroupKey,
    input.taxable ?? true,
  );
  await markLandedCostStale(prisma, defaults.shipmentId);
  await touchShipment(defaults.shipmentId);
  await recordImportAudit({
    action: 'CREATE_INVOICE_LINE_COST',
    resourceType: 'import.invoice_line',
    resourceId: null,
    afterJson: {
      invoiceId,
      skuId: input.skuId ?? null,
      purchaseOrderLineId: input.purchaseOrderLineId ?? null,
      lineNumber,
      quantity: input.quantity,
      sourceUnitCost: input.sourceUnitCost ?? (sourceAmount / input.quantity),
      sourceAmount: money.sourceAmount,
      sourceCurrency: money.sourceCurrency,
      fxRate: money.fxRate,
      fxDate: money.fxDate,
      hnlAmount: money.hnlAmount,
      baseUnitCostHnl,
      commercialUnitCostHnl: baseUnitCostHnl,
      costRole,
      receiptPolicy,
      allocationGroupKey,
    },
    metadataJson: { shipmentId: defaults.shipmentId },
  });
  return getImportShipmentById(defaults.shipmentId) as Promise<ImportShipmentDetail>;
}

export async function updateImportInvoiceLine(
  invoiceLineId: string,
  input: UpdateImportInvoiceLineInput,
): Promise<ImportShipmentDetail> {
  const context = await getInvoiceLineContext(invoiceLineId);
  if (!context) {
    throw new ImportManagementServiceError(404, 'INVOICE_LINE_NOT_FOUND', 'Import invoice line not found.');
  }
  await assertImportPayableSourceNotSent(prisma, 'SUPPLIER_INVOICE', context.invoiceId);
  await assertShipmentLandedCostEditable(prisma, context.shipmentId);
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new ImportManagementServiceError(422, 'INVALID_QUANTITY', 'quantity must be greater than zero.');
  }

  const sourceAmount =
    input.sourceAmount ?? (input.sourceUnitCost != null ? round4(input.sourceUnitCost * input.quantity) : null);
  if (sourceAmount == null) {
    throw new ImportManagementServiceError(422, 'INVALID_AMOUNT', 'sourceAmount or sourceUnitCost is required.');
  }
  const money = normalizeMoney({
    sourceAmount,
    sourceCurrency: input.sourceCurrency ?? context.sourceCurrency,
    fxRate: input.fxRate ?? context.fxRate,
    fxDate: input.fxDate ?? context.fxDate,
    hnlAmount: input.hnlAmount,
  });
  const baseUnitCostHnl = round4(money.hnlAmount / input.quantity);
  const { costRole, receiptPolicy } = normalizeImportInvoiceLineRoleState({
    costRole: input.costRole ?? context.costRole,
    receiptPolicy: input.receiptPolicy ?? context.receiptPolicy,
  });
  const allocationGroupKey = hasOwn(input, 'allocationGroupKey')
    ? cleanString(input.allocationGroupKey)
    : context.allocationGroupKey;
  const landedUnitCostHnl = isReceiptablePolicy(receiptPolicy) ? baseUnitCostHnl : null;

  await prisma.$executeRawUnsafe(
    `
      UPDATE app.import_invoice_line
      SET sku_id = $2::uuid,
          purchase_order_line_id = $3::uuid,
          line_number = $4,
          item_code = $5,
          style_code = $6,
          description = $7,
          material_meters = $8,
          carton_count = $9,
          weight_kg = $10,
          volume_cbm = $11,
          quantity = $12,
          unit_of_measure = $13,
          source_unit_cost = $14,
          source_amount = $15,
          source_currency = $16,
          fx_rate = $17,
          fx_date = $18::date,
          hnl_amount = $19,
          base_unit_cost_hnl = $20,
          commercial_unit_cost_hnl = $20,
          landed_unit_cost_hnl = $21,
          cost_role = $22,
          receipt_policy = $23,
          allocation_group_key = $24,
          component_allocated_cost_hnl = 0,
          taxable = $25,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid
    `,
    invoiceLineId,
    cleanString(input.skuId),
    cleanString(input.purchaseOrderLineId),
    input.lineNumber ?? context.lineNumber,
    cleanString(input.itemCode),
    cleanString(input.styleCode),
    cleanString(input.description),
    input.materialMeters ?? null,
    input.cartonCount ?? null,
    input.weightKg ?? null,
    input.volumeCbm ?? null,
    input.quantity,
    cleanString(input.unitOfMeasure) ?? 'UNIT',
    input.sourceUnitCost ?? (sourceAmount / input.quantity),
    money.sourceAmount,
    money.sourceCurrency,
    money.fxRate,
    money.fxDate,
    money.hnlAmount,
    baseUnitCostHnl,
    landedUnitCostHnl,
    costRole,
    receiptPolicy,
    allocationGroupKey,
    input.taxable ?? true,
  );
  await markLandedCostStale(prisma, context.shipmentId);
  await refreshShipmentLineMatchVerification(prisma, context.shipmentId);
  await touchShipment(context.shipmentId);
  await recordImportAudit({
    action: 'UPDATE_INVOICE_LINE_COST',
    resourceType: 'import.invoice_line',
    resourceId: invoiceLineId,
    afterJson: {
      invoiceId: context.invoiceId,
      skuId: input.skuId ?? null,
      purchaseOrderLineId: input.purchaseOrderLineId ?? null,
      quantity: input.quantity,
      sourceUnitCost: input.sourceUnitCost ?? (sourceAmount / input.quantity),
      sourceAmount: money.sourceAmount,
      sourceCurrency: money.sourceCurrency,
      fxRate: money.fxRate,
      fxDate: money.fxDate,
      hnlAmount: money.hnlAmount,
      baseUnitCostHnl,
      commercialUnitCostHnl: baseUnitCostHnl,
      costRole,
      receiptPolicy,
      allocationGroupKey,
    },
    metadataJson: { shipmentId: context.shipmentId },
  });
  return getImportShipmentById(context.shipmentId) as Promise<ImportShipmentDetail>;
}

export async function addImportCharge(
  shipmentId: string,
  input: CreateImportChargeInput,
): Promise<ImportShipmentDetail> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }
  await assertShipmentLandedCostEditable(prisma, shipmentId);
  const chargeType = normalizeChargeType(input.chargeType);
  const costTreatment = await defaultChargeCostTreatmentForShipment(prisma, shipmentId, chargeType, input.costTreatment);
  const money = normalizeMoney(input);
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO app.import_charge (
        shipment_id, charge_type, counterparty, document_number, source_amount,
        source_currency, fx_rate, fx_date, hnl_amount, allocation_basis,
        cost_treatment, taxable, estimated, final, notes
      )
      VALUES (
        $1::uuid, $2, $3, $4, $5,
        $6, $7, $8::date, $9, $10,
        $11, $12, $13, $14, $15
      )
    `,
    shipmentId,
    chargeType,
    cleanString(input.counterparty),
    cleanString(input.documentNumber),
    money.sourceAmount,
    money.sourceCurrency,
    money.fxRate,
    money.fxDate,
    money.hnlAmount,
    input.allocationBasis ?? 'PRODUCT_COST_SHARE',
    costTreatment,
    input.taxable ?? false,
    input.estimated ?? true,
    input.final ?? false,
    cleanString(input.notes),
  );
  await markLandedCostStale(prisma, shipmentId);
  await touchShipment(shipmentId);
  await recordImportAudit({
    action: 'CREATE_IMPORT_CHARGE_COST',
    resourceType: 'import.charge',
    resourceId: null,
    afterJson: {
      chargeType,
      counterparty: input.counterparty ?? null,
      documentNumber: input.documentNumber ?? null,
      sourceAmount: money.sourceAmount,
      sourceCurrency: money.sourceCurrency,
      fxRate: money.fxRate,
      fxDate: money.fxDate,
      hnlAmount: money.hnlAmount,
      costTreatment,
      final: input.final ?? false,
    },
    metadataJson: { shipmentId },
  });
  return getImportShipmentById(shipmentId) as Promise<ImportShipmentDetail>;
}

export async function updateImportCharge(
  chargeId: string,
  input: UpdateImportChargeInput,
): Promise<ImportShipmentDetail> {
  const chargeRows = await prisma.$queryRawUnsafe<Array<{ shipmentId: string; hnlAmount: unknown; costTreatment: string }>>(
    `
      SELECT shipment_id AS "shipmentId", hnl_amount AS "hnlAmount", cost_treatment AS "costTreatment"
      FROM app.import_charge
      WHERE id = $1::uuid
      LIMIT 1
    `,
    chargeId,
  );
  const currentCharge = chargeRows[0];
  if (!currentCharge) {
    throw new ImportManagementServiceError(404, 'CHARGE_NOT_FOUND', 'Import charge not found.');
  }
  const shipmentId = String(currentCharge.shipmentId);

  await assertImportPayableSourceNotSent(prisma, 'LANDED_COST_CHARGE', chargeId);
  const chargeType = normalizeChargeType(input.chargeType);
  const costTreatment = normalizeChargeCostTreatment((input.costTreatment ?? currentCharge.costTreatment) as ImportChargeCostTreatment);
  const money = normalizeMoney(input);
  const landedCostChanged =
    Math.abs(toNumber(currentCharge.hnlAmount) - money.hnlAmount) > 0.01 ||
    currentCharge.costTreatment !== costTreatment;
  if (landedCostChanged) {
    await assertShipmentLandedCostEditable(prisma, shipmentId);
  }
  await prisma.$executeRawUnsafe(
    `
      UPDATE app.import_charge
      SET charge_type = $2,
          counterparty = $3,
          document_number = $4,
          source_amount = $5,
          source_currency = $6,
          fx_rate = $7,
          fx_date = $8::date,
          hnl_amount = $9,
          allocation_basis = $10,
          cost_treatment = $11,
          taxable = $12,
          estimated = $13,
          final = $14,
          notes = $15,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid
    `,
    chargeId,
    chargeType,
    cleanString(input.counterparty),
    cleanString(input.documentNumber),
    money.sourceAmount,
    money.sourceCurrency,
    money.fxRate,
    money.fxDate,
    money.hnlAmount,
    input.allocationBasis ?? 'PRODUCT_COST_SHARE',
    costTreatment,
    input.taxable ?? false,
    input.estimated ?? true,
    input.final ?? false,
    cleanString(input.notes),
  );
  if (landedCostChanged) {
    await markLandedCostStale(prisma, shipmentId);
  }
  await touchShipment(shipmentId);
  await recordImportAudit({
    action: 'UPDATE_IMPORT_CHARGE_COST',
    resourceType: 'import.charge',
    resourceId: chargeId,
    afterJson: {
      chargeType,
      counterparty: input.counterparty ?? null,
      documentNumber: input.documentNumber ?? null,
      sourceAmount: money.sourceAmount,
      sourceCurrency: money.sourceCurrency,
      fxRate: money.fxRate,
      fxDate: money.fxDate,
      hnlAmount: money.hnlAmount,
      costTreatment,
      final: input.final ?? false,
      landedCostChanged,
    },
    metadataJson: { shipmentId },
  });
  return getImportShipmentById(shipmentId) as Promise<ImportShipmentDetail>;
}

export async function addImportContainer(
  shipmentId: string,
  input: CreateImportContainerInput,
): Promise<ImportShipmentDetail> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO app.import_container (
        shipment_id, container_number, container_type, seal_number, cargo_group,
        status, expected_arrival_at, actual_arrival_at, notes
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::date, $8::date, $9)
    `,
    shipmentId,
    cleanString(input.containerNumber),
    normalizeContainerType(input.containerType),
    cleanString(input.sealNumber),
    cleanString(input.cargoGroup),
    normalizeContainerStatus(input.status),
    optionalDate(input.expectedArrivalAt, 'expectedArrivalAt'),
    optionalDate(input.actualArrivalAt, 'actualArrivalAt'),
    cleanString(input.notes),
  );
  await touchShipment(shipmentId);
  return getImportShipmentById(shipmentId) as Promise<ImportShipmentDetail>;
}

export async function updateImportContainer(
  containerId: string,
  input: UpdateImportContainerInput,
): Promise<ImportShipmentDetail> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        id,
        shipment_id AS "shipmentId",
        container_number AS "containerNumber",
        container_type AS "containerType",
        seal_number AS "sealNumber",
        cargo_group AS "cargoGroup",
        status,
        expected_arrival_at AS "expectedArrivalAt",
        actual_arrival_at AS "actualArrivalAt",
        notes
      FROM app.import_container
      WHERE id = $1::uuid
      LIMIT 1
    `,
    containerId,
  );
  const row = rows[0];
  if (!row) {
    throw new ImportManagementServiceError(404, 'CONTAINER_NOT_FOUND', 'Import container not found.');
  }

  const shipmentId = String(row.shipmentId);
  const nextType = hasOwn(input, 'containerType')
    ? normalizeContainerType(input.containerType)
    : (row.containerType as ImportContainerType);
  const nextStatus = hasOwn(input, 'status')
    ? normalizeContainerStatus(input.status)
    : (row.status as ImportContainerStatus);

  await prisma.$executeRawUnsafe(
    `
      UPDATE app.import_container
      SET container_number = $2,
          container_type = $3,
          seal_number = $4,
          cargo_group = $5,
          status = $6,
          expected_arrival_at = $7::date,
          actual_arrival_at = $8::date,
          notes = $9,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid
    `,
    containerId,
    hasOwn(input, 'containerNumber') ? cleanString(input.containerNumber) : row.containerNumber ?? null,
    nextType,
    hasOwn(input, 'sealNumber') ? cleanString(input.sealNumber) : row.sealNumber ?? null,
    hasOwn(input, 'cargoGroup') ? cleanString(input.cargoGroup) : row.cargoGroup ?? null,
    nextStatus,
    hasOwn(input, 'expectedArrivalAt')
      ? optionalDate(input.expectedArrivalAt, 'expectedArrivalAt')
      : dateOnly(row.expectedArrivalAt),
    hasOwn(input, 'actualArrivalAt')
      ? optionalDate(input.actualArrivalAt, 'actualArrivalAt')
      : dateOnly(row.actualArrivalAt),
    hasOwn(input, 'notes') ? cleanString(input.notes) : row.notes ?? null,
  );
  await touchShipment(shipmentId);
  return getImportShipmentById(shipmentId) as Promise<ImportShipmentDetail>;
}

export async function addGoodsInTransitRecord(
  shipmentId: string,
  input: CreateGoodsInTransitRecordInput,
): Promise<ImportShipmentDetail> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }
  await assertContainerBelongsToShipment(prisma, shipmentId, input.containerId);
  if (input.invoiceLineId && input.shipmentLineId) {
    throw new ImportManagementServiceError(
      422,
      'TOO_MANY_GIT_LINE_REFERENCES',
      'Goods-in-transit records can reference either an invoice line or a shipment line, not both.',
    );
  }
  const invoiceLine = await assertInvoiceLineBelongsToShipment(prisma, shipmentId, input.invoiceLineId);
  const shipmentLine = await assertShipmentLineBelongsToShipment(prisma, shipmentId, input.shipmentLineId);
  const status = normalizeGoodsInTransitStatus(input.status);
  const auditReason = cleanString(input.auditReason);
  validateTransitAudit(status, auditReason);
  const quantity = validateQuantity(input.quantityInTransit) ?? shipmentLine?.quantity ?? invoiceLine?.quantity ?? null;

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO app.goods_in_transit_record (
        shipment_id, container_id, invoice_line_id, shipment_line_id, status, ownership_transfer_at,
        expected_receipt_at, received_at, quantity_in_transit, audit_reason
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::date, $7::date, $8::date, $9, $10)
    `,
    shipmentId,
    cleanString(input.containerId),
    cleanString(input.invoiceLineId),
    cleanString(input.shipmentLineId),
    status,
    optionalDate(input.ownershipTransferAt, 'ownershipTransferAt'),
    optionalDate(input.expectedReceiptAt, 'expectedReceiptAt'),
    optionalDate(input.receivedAt, 'receivedAt'),
    quantity,
    auditReason,
  );
  await touchShipment(shipmentId);
  return getImportShipmentById(shipmentId) as Promise<ImportShipmentDetail>;
}

export async function createGoodsInTransitForShipment(
  shipmentId: string,
  input: CreateGoodsInTransitForShipmentInput,
): Promise<CreateGoodsInTransitForShipmentResult> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }
  await assertContainerBelongsToShipment(prisma, shipmentId, input.containerId);
  const status = normalizeGoodsInTransitStatus(input.status);
  const auditReason = cleanString(input.auditReason);
  validateTransitAudit(status, auditReason);

  const lineRows = await prisma.$queryRawUnsafe<Array<{ invoiceLineId: string | null; shipmentLineId: string | null; quantity: unknown }>>(
    `
      SELECT
        NULL::uuid AS "invoiceLineId",
        sl.id AS "shipmentLineId",
        sl.expected_quantity AS quantity,
        po.po_number AS sort_po,
        0 AS sort_group,
        0 AS sort_line
      FROM app.import_shipment_line sl
      JOIN app.purchase_order_line pol ON pol.id = sl.purchase_order_line_id
      JOIN app.purchase_order po ON po.id = pol.po_id
      LEFT JOIN app.import_invoice_line il ON il.id = sl.invoice_line_id
      WHERE sl.shipment_id = $1::uuid
        AND sl.status <> 'CANCELLED'
        AND (il.id IS NULL OR il.receipt_policy = 'RECEIVE_TO_STOCK')
        AND NOT EXISTS (
          SELECT 1
          FROM app.goods_in_transit_record git
          WHERE git.shipment_id = $1::uuid
            AND git.shipment_line_id = sl.id
        )
      UNION ALL
      SELECT
        il.id AS "invoiceLineId",
        NULL::uuid AS "shipmentLineId",
        il.quantity,
        si.invoice_number AS sort_po,
        1 AS sort_group,
        il.line_number AS sort_line
      FROM app.import_invoice_line il
      JOIN app.import_supplier_invoice si ON si.id = il.invoice_id
      WHERE si.shipment_id = $1::uuid
        AND il.receipt_policy = 'RECEIVE_TO_STOCK'
        AND NOT EXISTS (
          SELECT 1
          FROM app.import_shipment_line sl
          WHERE sl.invoice_line_id = il.id
            AND sl.status <> 'CANCELLED'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM app.goods_in_transit_record git
          WHERE git.shipment_id = $1::uuid
            AND git.invoice_line_id = il.id
        )
      ORDER BY sort_group ASC, sort_po ASC, sort_line ASC
    `,
    shipmentId,
  );
  if (lineRows.length === 0) {
    return {
      shipment: (await getImportShipmentById(shipmentId)) as ImportShipmentDetail,
      createdCount: 0,
    };
  }

  await prisma.$transaction(async (tx) => {
    for (const line of lineRows) {
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.goods_in_transit_record (
            shipment_id, container_id, invoice_line_id, shipment_line_id, status, ownership_transfer_at,
            expected_receipt_at, quantity_in_transit, audit_reason
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::date, $7::date, $8, $9)
        `,
        shipmentId,
        cleanString(input.containerId),
        line.invoiceLineId ? String(line.invoiceLineId) : null,
        line.shipmentLineId ? String(line.shipmentLineId) : null,
        status,
        optionalDate(input.ownershipTransferAt, 'ownershipTransferAt'),
        optionalDate(input.expectedReceiptAt, 'expectedReceiptAt'),
        toNumber(line.quantity),
        auditReason,
      );
    }
    await tx.$executeRawUnsafe(
      `UPDATE app.import_shipment SET updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
      shipmentId,
    );
  });

  return {
    shipment: (await getImportShipmentById(shipmentId)) as ImportShipmentDetail,
    createdCount: lineRows.length,
  };
}

export async function updateGoodsInTransitRecord(
  recordId: string,
  input: UpdateGoodsInTransitRecordInput,
): Promise<ImportShipmentDetail> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        id,
        shipment_id AS "shipmentId",
        container_id AS "containerId",
        invoice_line_id AS "invoiceLineId",
        shipment_line_id AS "shipmentLineId",
        status,
        ownership_transfer_at AS "ownershipTransferAt",
        expected_receipt_at AS "expectedReceiptAt",
        received_at AS "receivedAt",
        quantity_in_transit AS "quantityInTransit",
        audit_reason AS "auditReason"
      FROM app.goods_in_transit_record
      WHERE id = $1::uuid
      LIMIT 1
    `,
    recordId,
  );
  const row = rows[0];
  if (!row) {
    throw new ImportManagementServiceError(404, 'GIT_RECORD_NOT_FOUND', 'Goods-in-transit record not found.');
  }
  const shipmentId = String(row.shipmentId);
  const nextContainerId = hasOwn(input, 'containerId') ? cleanString(input.containerId) : row.containerId ?? null;
  await assertContainerBelongsToShipment(prisma, shipmentId, nextContainerId);
  const nextShipmentLineId = hasOwn(input, 'shipmentLineId') ? cleanString(input.shipmentLineId) : row.shipmentLineId ?? null;
  await assertShipmentLineBelongsToShipment(prisma, shipmentId, nextShipmentLineId);
  if (row.invoiceLineId && nextShipmentLineId) {
    throw new ImportManagementServiceError(
      422,
      'TOO_MANY_GIT_LINE_REFERENCES',
      'Goods-in-transit records can reference either an invoice line or a shipment line, not both.',
    );
  }
  const nextStatus = hasOwn(input, 'status')
    ? normalizeGoodsInTransitStatus(input.status)
    : (row.status as GoodsInTransitStatus);
  const nextAuditReason = hasOwn(input, 'auditReason') ? cleanString(input.auditReason) : row.auditReason ?? null;
  validateTransitAudit(nextStatus, nextAuditReason);

  await prisma.$executeRawUnsafe(
    `
      UPDATE app.goods_in_transit_record
      SET container_id = $2::uuid,
          shipment_line_id = $3::uuid,
          status = $4,
          ownership_transfer_at = $5::date,
          expected_receipt_at = $6::date,
          received_at = $7::date,
          quantity_in_transit = $8,
          audit_reason = $9,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid
    `,
    recordId,
    nextContainerId,
    nextShipmentLineId,
    nextStatus,
    hasOwn(input, 'ownershipTransferAt')
      ? optionalDate(input.ownershipTransferAt, 'ownershipTransferAt')
      : dateOnly(row.ownershipTransferAt),
    hasOwn(input, 'expectedReceiptAt')
      ? optionalDate(input.expectedReceiptAt, 'expectedReceiptAt')
      : dateOnly(row.expectedReceiptAt),
    hasOwn(input, 'receivedAt') ? optionalDate(input.receivedAt, 'receivedAt') : dateOnly(row.receivedAt),
    hasOwn(input, 'quantityInTransit') ? validateQuantity(input.quantityInTransit) : nullableNumber(row.quantityInTransit),
    nextAuditReason,
  );
  await touchShipment(shipmentId);
  return getImportShipmentById(shipmentId) as Promise<ImportShipmentDetail>;
}

async function touchShipment(shipmentId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE app.import_shipment SET updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
    shipmentId,
  );
}

async function upsertVerificationCheck(
  client: SqlClient,
  shipmentId: string,
  input: {
    checkCode: string;
    status: 'PENDING' | 'PASS' | 'WARN' | 'FAIL';
    expectedHnlAmount?: number | null;
    actualHnlAmount?: number | null;
    varianceHnlAmount?: number | null;
    message?: string | null;
  },
): Promise<void> {
  await client.$executeRawUnsafe(
    `
      INSERT INTO app.import_verification_check (
        shipment_id, check_code, status, expected_hnl_amount, actual_hnl_amount,
        variance_hnl_amount, message
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (shipment_id, check_code)
      DO UPDATE SET
        status = EXCLUDED.status,
        expected_hnl_amount = EXCLUDED.expected_hnl_amount,
        actual_hnl_amount = EXCLUDED.actual_hnl_amount,
        variance_hnl_amount = EXCLUDED.variance_hnl_amount,
        message = EXCLUDED.message,
        updated_at = CURRENT_TIMESTAMP
    `,
    shipmentId,
    input.checkCode,
    input.status,
    input.expectedHnlAmount ?? null,
    input.actualHnlAmount ?? null,
    input.varianceHnlAmount ?? null,
    input.message ?? null,
  );
}

async function refreshShipmentLineMatchVerification(client: SqlClient, shipmentId: string): Promise<void> {
  const rows = await client.$queryRawUnsafe<Array<{
    expectedLineCount: unknown;
    matchedLineCount: unknown;
    quantityMismatchCount: unknown;
    currencyMismatchCount: unknown;
    amountMismatchCount: unknown;
    approvedMismatchCount: unknown;
    unresolvedMismatchCount: unknown;
  }>>(
    `
      SELECT
        COUNT(sl.id) AS "expectedLineCount",
        COALESCE(SUM(CASE WHEN il.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS "matchedLineCount",
        COALESCE(SUM(CASE
          WHEN il.id IS NOT NULL AND ABS(il.quantity - sl.expected_quantity) > 0.0001 THEN 1
          ELSE 0
        END), 0) AS "quantityMismatchCount",
        COALESCE(SUM(CASE
          WHEN il.id IS NOT NULL AND il.source_currency <> sl.source_currency THEN 1
          ELSE 0
        END), 0) AS "currencyMismatchCount",
        COALESCE(SUM(CASE
          WHEN il.id IS NOT NULL AND ABS(il.hnl_amount - (sl.expected_quantity * sl.commercial_unit_cost_hnl)) > 0.01 THEN 1
          ELSE 0
        END), 0) AS "amountMismatchCount",
        COALESCE(SUM(CASE
          WHEN il.id IS NOT NULL
           AND sl.invoice_match_approved_at IS NOT NULL
           AND (
             ABS(il.quantity - sl.expected_quantity) > 0.0001
             OR il.source_currency <> sl.source_currency
             OR ABS(il.hnl_amount - (sl.expected_quantity * sl.commercial_unit_cost_hnl)) > 0.01
           ) THEN 1
          ELSE 0
        END), 0) AS "approvedMismatchCount",
        COALESCE(SUM(CASE
          WHEN il.id IS NOT NULL
           AND sl.invoice_match_approved_at IS NULL
           AND (
             ABS(il.quantity - sl.expected_quantity) > 0.0001
             OR il.source_currency <> sl.source_currency
             OR ABS(il.hnl_amount - (sl.expected_quantity * sl.commercial_unit_cost_hnl)) > 0.01
           ) THEN 1
          ELSE 0
        END), 0) AS "unresolvedMismatchCount"
      FROM app.import_shipment_line sl
      LEFT JOIN app.import_invoice_line il ON il.id = sl.invoice_line_id
      WHERE sl.shipment_id = $1::uuid
        AND sl.status <> 'CANCELLED'
    `,
    shipmentId,
  );
  const row = rows[0];
  const expectedLineCount = toNumber(row?.expectedLineCount);
  const matchedLineCount = toNumber(row?.matchedLineCount);
  const quantityMismatchCount = toNumber(row?.quantityMismatchCount);
  const currencyMismatchCount = toNumber(row?.currencyMismatchCount);
  const amountMismatchCount = toNumber(row?.amountMismatchCount);
  const approvedMismatchCount = toNumber(row?.approvedMismatchCount);
  const unresolvedMismatchCount = toNumber(row?.unresolvedMismatchCount);

  if (expectedLineCount === 0) {
    await upsertVerificationCheck(client, shipmentId, {
      checkCode: 'PO_INVOICE_MATCH',
      status: 'PASS',
      message: 'No expected PO lines require invoice matching.',
    });
    return;
  }

  if (unresolvedMismatchCount > 0) {
    await upsertVerificationCheck(client, shipmentId, {
      checkCode: 'PO_INVOICE_MATCH',
      status: 'WARN',
      message:
        `${matchedLineCount}/${expectedLineCount} expected PO lines matched. ` +
        `${quantityMismatchCount} quantity, ${currencyMismatchCount} currency, and ${amountMismatchCount} amount mismatches need review.`,
    });
    return;
  }

  await upsertVerificationCheck(client, shipmentId, {
    checkCode: 'PO_INVOICE_MATCH',
    status: matchedLineCount === expectedLineCount ? 'PASS' : 'WARN',
    message:
      approvedMismatchCount > 0
        ? `${matchedLineCount}/${expectedLineCount} expected PO lines are matched; ${approvedMismatchCount} mismatched lines were approved.`
        : `${matchedLineCount}/${expectedLineCount} expected PO lines are matched to supplier invoice lines.`,
  });
}

export async function recordImportVerificationCheck(
  shipmentId: string,
  input: {
    checkCode: string;
    status: 'PENDING' | 'PASS' | 'WARN' | 'FAIL';
    expectedHnlAmount?: number | null;
    actualHnlAmount?: number | null;
    varianceHnlAmount?: number | null;
    message?: string | null;
  },
): Promise<ImportShipmentDetail> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }
  await upsertVerificationCheck(prisma, shipmentId, input);
  await touchShipment(shipmentId);
  return getImportShipmentById(shipmentId) as Promise<ImportShipmentDetail>;
}

function liquidationCheck(
  checkCode: string,
  status: ImportLiquidationReadinessCheck['status'],
  blocking: boolean,
  message: string,
): ImportLiquidationReadinessCheck {
  return { checkCode, status, blocking, message };
}

export async function getImportLiquidationReadiness(shipmentId: string): Promise<ImportLiquidationReadiness> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }

  const [lineRows, chargeRows, verificationRows, allocationRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ lineCount: unknown; unallocatedLineCount: unknown }>>(
      `
        WITH lines AS (
          SELECT sl.id, sl.landed_unit_cost_hnl
          FROM app.import_shipment_line sl
          LEFT JOIN app.import_invoice_line il ON il.id = sl.invoice_line_id
          WHERE sl.shipment_id = $1::uuid
            AND sl.status <> 'CANCELLED'
            AND (il.id IS NULL OR il.receipt_policy = 'RECEIVE_TO_STOCK')
          UNION ALL
          SELECT il.id, il.landed_unit_cost_hnl
          FROM app.import_supplier_invoice si
          JOIN app.import_invoice_line il ON il.invoice_id = si.id
          WHERE si.shipment_id = $1::uuid
            AND il.receipt_policy = 'RECEIVE_TO_STOCK'
            AND NOT EXISTS (
              SELECT 1
              FROM app.import_shipment_line sl
              WHERE sl.invoice_line_id = il.id
                AND sl.status <> 'CANCELLED'
            )
        )
        SELECT
          COUNT(id) AS "lineCount",
          COALESCE(SUM(CASE WHEN landed_unit_cost_hnl IS NULL THEN 1 ELSE 0 END), 0) AS "unallocatedLineCount"
        FROM lines
      `,
      shipmentId,
    ),
    prisma.$queryRawUnsafe<Array<{
      chargeCount: unknown;
      finalChargeCount: unknown;
      estimatedChargeCount: unknown;
    }>>(
      `
        SELECT
          COUNT(*) AS "chargeCount",
          COALESCE(SUM(CASE WHEN final THEN 1 ELSE 0 END), 0) AS "finalChargeCount",
          COALESCE(SUM(CASE WHEN NOT final THEN 1 ELSE 0 END), 0) AS "estimatedChargeCount"
        FROM app.import_charge
        WHERE shipment_id = $1::uuid
      `,
      shipmentId,
    ),
    prisma.$queryRawUnsafe<Array<{ failedVerificationCount: unknown; warningVerificationCount: unknown }>>(
      `
        SELECT
          COALESCE(SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END), 0) AS "failedVerificationCount",
          COALESCE(SUM(CASE WHEN status IN ('WARN', 'PENDING') THEN 1 ELSE 0 END), 0) AS "warningVerificationCount"
        FROM app.import_verification_check
        WHERE shipment_id = $1::uuid
      `,
      shipmentId,
    ),
    prisma.$queryRawUnsafe<Array<{ status: string | null; message: string | null }>>(
      `
        SELECT status, message
        FROM app.import_verification_check
        WHERE shipment_id = $1::uuid
          AND check_code = 'ALLOCATION_RECONCILES'
        LIMIT 1
      `,
      shipmentId,
    ),
  ]);

  const lineStats = lineRows[0] ?? { lineCount: 0, unallocatedLineCount: 0 };
  const chargeStats = chargeRows[0] ?? { chargeCount: 0, finalChargeCount: 0, estimatedChargeCount: 0 };
  const verificationStats = verificationRows[0] ?? { failedVerificationCount: 0, warningVerificationCount: 0 };
  const allocationCheck = allocationRows[0] ?? null;

  const invoiceLineCount = toNumber(lineStats.lineCount);
  const unallocatedLineCount = toNumber(lineStats.unallocatedLineCount);
  const chargeCount = toNumber(chargeStats.chargeCount);
  const finalChargeCount = toNumber(chargeStats.finalChargeCount);
  const estimatedChargeCount = toNumber(chargeStats.estimatedChargeCount);
  const failedVerificationCount = toNumber(verificationStats.failedVerificationCount);
  const warningVerificationCount = toNumber(verificationStats.warningVerificationCount);

  const checks: ImportLiquidationReadinessCheck[] = [];
  checks.push(
    invoiceLineCount > 0
      ? liquidationCheck('INVOICE_LINES_PRESENT', 'PASS', true, `${invoiceLineCount} shipment or invoice lines are ready for costing.`)
      : liquidationCheck('INVOICE_LINES_PRESENT', 'FAIL', true, 'Add expected PO lines or supplier invoice lines before final liquidation.'),
  );
  checks.push(
    unallocatedLineCount === 0 && invoiceLineCount > 0
      ? liquidationCheck('LANDED_UNIT_COSTS_READY', 'PASS', true, 'Every shipment or invoice line has a landed unit cost.')
      : liquidationCheck(
          'LANDED_UNIT_COSTS_READY',
          'FAIL',
          true,
          `${unallocatedLineCount} shipment or invoice lines need landed-cost allocation.`,
        ),
  );
  checks.push(
    allocationCheck?.status === 'PASS'
      ? liquidationCheck(
          'ALLOCATION_RECONCILES',
          'PASS',
          true,
          allocationCheck.message ?? 'Landed-cost allocation reconciles to shipment totals.',
        )
      : liquidationCheck(
          'ALLOCATION_RECONCILES',
          'FAIL',
          true,
          allocationCheck?.message ?? 'Run landed-cost allocation and resolve allocation variances.',
        ),
  );
  checks.push(
    chargeCount === 0
      ? liquidationCheck('FINAL_CHARGES_COMPLETE', 'FAIL', true, 'Add freight, insurance, customs, tax, or other landed-cost charges.')
      : estimatedChargeCount === 0
        ? liquidationCheck('FINAL_CHARGES_COMPLETE', 'PASS', true, `${finalChargeCount} landed-cost charges are marked final.`)
        : liquidationCheck(
            'FINAL_CHARGES_COMPLETE',
            'FAIL',
            true,
            `${estimatedChargeCount} landed-cost charges are still estimated.`,
          ),
  );
  checks.push(
    failedVerificationCount === 0
      ? warningVerificationCount === 0
        ? liquidationCheck('VERIFICATION_CHECKS_CLEAR', 'PASS', false, 'No failed or warning verification checks remain.')
        : liquidationCheck(
            'VERIFICATION_CHECKS_CLEAR',
            'WARN',
            false,
            `${warningVerificationCount} verification checks are warnings or pending.`,
          )
      : liquidationCheck(
          'VERIFICATION_CHECKS_CLEAR',
          'FAIL',
          true,
          `${failedVerificationCount} verification checks are failing.`,
        ),
  );

  return {
    shipmentId,
    canFinalize: checks.every((check) => !(check.blocking && check.status === 'FAIL')),
    invoiceLineCount,
    chargeCount,
    finalChargeCount,
    estimatedChargeCount,
    unallocatedLineCount,
    failedVerificationCount,
    warningVerificationCount,
    checks,
  };
}

async function assertLiquidationReadyForStatus(shipmentId: string, status: ImportShipmentStatus): Promise<void> {
  if (!FINAL_LIQUIDATION_STATUSES.has(status)) return;
  const readiness = await getImportLiquidationReadiness(shipmentId);
  const blocker = readiness.checks.find((check) => check.blocking && check.status === 'FAIL');
  if (blocker) {
    throw new ImportManagementServiceError(
      409,
      'LIQUIDATION_NOT_READY',
      `Import shipment is not ready for ${status}: ${blocker.message}`,
    );
  }
}

function mapImportPayable(row: any): ImportPayableRecord {
  return {
    handoffId: row.handoffId ? String(row.handoffId) : null,
    shipmentId: String(row.shipmentId),
    sourceType: row.sourceType as ImportPayableSourceType,
    sourceId: String(row.sourceId),
    counterparty: String(row.counterparty),
    documentNumber: row.documentNumber ?? null,
    payableKind: String(row.payableKind),
    sourceAmount: toNumber(row.sourceAmount),
    sourceCurrency: row.sourceCurrency as ImportSourceCurrency,
    fxRate: toNumber(row.fxRate),
    fxDate: dateOnly(row.fxDate) ?? '',
    hnlAmount: toNumber(row.hnlAmount),
    final: Boolean(row.final),
    readyForAp: Boolean(row.readyForAp),
    handoffStatus: row.handoffStatus as ImportPayableHandoffStatus,
    apReference: row.apReference ?? null,
    sentToApBy: row.sentToApBy ?? null,
    sentToApAt: nullableDateTime(row.sentToApAt),
    paymentReference: row.paymentReference ?? null,
    paidBy: row.paidBy ?? null,
    paidAt: dateOnly(row.paidAt),
    voidedBy: row.voidedBy ?? null,
    voidedAt: dateOnly(row.voidedAt),
    voidReason: row.voidReason ?? null,
    notes: row.notes ?? null,
  };
}

function summarizeImportPayables(shipmentId: string, payables: ImportPayableRecord[]): ImportPayablesEnvelope {
  return {
    shipmentId,
    payables,
    totalHnlAmount: round2(payables.reduce((sum, row) => sum + row.hnlAmount, 0)),
    readyHnlAmount: round2(payables.filter((row) => row.readyForAp).reduce((sum, row) => sum + row.hnlAmount, 0)),
    stagedCount: payables.filter((row) => row.handoffId != null).length,
    sentCount: payables.filter((row) => row.handoffStatus === 'SENT_TO_AP').length,
    paidCount: payables.filter((row) => row.handoffStatus === 'PAID').length,
    voidedCount: payables.filter((row) => row.handoffStatus === 'VOIDED').length,
    blockedCount: payables.filter((row) => !row.readyForAp).length,
  };
}

async function readImportPayables(shipmentId: string): Promise<ImportPayableRecord[]> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      WITH source_payables AS (
        SELECT
          si.shipment_id AS "shipmentId",
          'SUPPLIER_INVOICE'::text AS "sourceType",
          si.id AS "sourceId",
          si.supplier_name AS "counterparty",
          si.invoice_number AS "documentNumber",
          si.invoice_kind AS "payableKind",
          si.source_amount AS "sourceAmount",
          si.source_currency AS "sourceCurrency",
          si.fx_rate AS "fxRate",
          si.fx_date AS "fxDate",
          si.hnl_amount AS "hnlAmount",
          true AS "final",
          true AS "readyForAp",
          si.notes AS "notes"
        FROM app.import_supplier_invoice si
        WHERE si.shipment_id = $1::uuid
        UNION ALL
        SELECT
          c.shipment_id AS "shipmentId",
          'LANDED_COST_CHARGE'::text AS "sourceType",
          c.id AS "sourceId",
          COALESCE(NULLIF(c.counterparty, ''), c.charge_type) AS "counterparty",
          c.document_number AS "documentNumber",
          c.charge_type AS "payableKind",
          c.source_amount AS "sourceAmount",
          c.source_currency AS "sourceCurrency",
          c.fx_rate AS "fxRate",
          c.fx_date AS "fxDate",
          c.hnl_amount AS "hnlAmount",
          c.final AS "final",
          c.final AS "readyForAp",
          c.notes AS "notes"
        FROM app.import_charge c
        WHERE c.shipment_id = $1::uuid
      )
      SELECT
        sp.*,
        h.id AS "handoffId",
        COALESCE(h.handoff_status, 'NOT_STAGED') AS "handoffStatus",
        h.ap_reference AS "apReference",
        h.sent_to_ap_by AS "sentToApBy",
        h.sent_to_ap_at AS "sentToApAt",
        h.payment_reference AS "paymentReference",
        h.paid_by AS "paidBy",
        h.paid_at AS "paidAt",
        h.voided_by AS "voidedBy",
        h.voided_at AS "voidedAt",
        h.void_reason AS "voidReason"
      FROM source_payables sp
      LEFT JOIN app.import_payable_handoff h
        ON h.source_type = sp."sourceType"
       AND h.source_id = sp."sourceId"
      ORDER BY
        CASE sp."sourceType" WHEN 'SUPPLIER_INVOICE' THEN 0 ELSE 1 END,
        sp."counterparty" ASC,
        sp."documentNumber" ASC NULLS LAST
    `,
    shipmentId,
  );
  return rows.map(mapImportPayable);
}

export async function listImportPayables(shipmentId: string): Promise<ImportPayablesEnvelope> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }
  return summarizeImportPayables(shipmentId, await readImportPayables(shipmentId));
}

function reportFilenameBase(shipmentNumber: string, reportKey: ImportShipmentReportKey): string {
  const safeShipment = shipmentNumber
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'shipment';
  return `import-${safeShipment}-${reportKey}`;
}

function reportContainerLabel(container: ImportContainerRecord | null | undefined): string | null {
  if (!container) return null;
  return container.containerNumber || container.cargoGroup || container.containerType;
}

function buildShipmentReport(
  detail: ImportShipmentDetail,
  reportKey: ImportShipmentReportKey,
  sheetName: string,
  columns: ImportShipmentReportColumn[],
  rows: ImportShipmentReport['rows'],
): ImportShipmentReport {
  return {
    reportKey,
    shipmentId: detail.id,
    shipmentNumber: detail.shipmentNumber,
    displayName: detail.displayName,
    sheetName,
    filenameBase: reportFilenameBase(detail.shipmentNumber, reportKey),
    columns,
    rows,
  };
}

export async function getImportShipmentReport(
  shipmentId: string,
  reportKey: ImportShipmentReportKey,
): Promise<ImportShipmentReport> {
  const detail = await getImportShipmentById(shipmentId);
  if (!detail) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }

  const containersById = new Map(detail.containers.map((container) => [container.id, container]));
  const invoiceLines = detail.supplierInvoices.flatMap((invoice) =>
    invoice.lines.map((line) => ({
      ...line,
      invoiceNumber: invoice.invoiceNumber,
      supplierCode: invoice.supplierCode,
      supplierName: invoice.supplierName,
      invoiceKind: invoice.invoiceKind,
      invoiceGroup: invoice.invoiceGroup,
    })),
  );
  const invoiceLineById = new Map(invoiceLines.map((line) => [line.id, line]));
  const shipmentLineById = new Map(detail.shipmentLines.map((line) => [line.id, line]));
  const shipmentLineByInvoiceLineId = new Map(
    detail.shipmentLines
      .filter((line) => line.invoiceLineId)
      .map((line) => [line.invoiceLineId as string, line]),
  );
  const chargeById = new Map(detail.charges.map((charge) => [charge.id, charge]));

  if (reportKey === 'shipment-liquidation') {
    const rows = [
      ...invoiceLines.map((line) => {
        const shipmentLine = shipmentLineByInvoiceLineId.get(line.id);
        return {
          rowType: 'INVOICE_LINE',
          shipmentNumber: detail.shipmentNumber,
          supplierOrCounterparty: line.supplierName,
          documentNumber: line.invoiceNumber,
          payableKind: line.invoiceKind,
          costRole: line.costRole,
          receiptPolicy: line.receiptPolicy,
          allocationGroupKey: line.allocationGroupKey,
          skuCode: line.skuCode,
          itemCode: line.itemCode,
          styleCode: line.styleCode,
          description: line.description,
          poNumber: shipmentLine?.purchaseOrderNumber ?? null,
          container: shipmentLine?.containerLabel ?? null,
          quantity: line.quantity,
          sourceAmount: line.sourceAmount,
          sourceCurrency: line.sourceCurrency,
          fxRate: line.fxRate,
          fxDate: line.fxDate,
          hnlAmount: line.hnlAmount,
          commercialUnitCostHnl: line.commercialUnitCostHnl,
          componentAllocatedCostHnl: line.componentAllocatedCostHnl,
          commercialLineHnl: line.commercialUnitCostHnl == null ? null : round2(line.quantity * line.commercialUnitCostHnl),
          allocatedLandedCostHnl: line.allocatedLandedCostHnl,
          landedUnitCostHnl: line.landedUnitCostHnl,
          landedLineHnl: line.landedUnitCostHnl == null ? null : round2(line.quantity * line.landedUnitCostHnl),
          final: true,
          costTreatment: null,
        };
      }),
      ...detail.charges.map((charge) => ({
        rowType: 'CHARGE',
        shipmentNumber: detail.shipmentNumber,
        supplierOrCounterparty: charge.counterparty,
        documentNumber: charge.documentNumber,
        payableKind: charge.chargeType,
        costRole: null,
        receiptPolicy: null,
        allocationGroupKey: null,
        skuCode: null,
        itemCode: null,
        styleCode: null,
        description: charge.notes,
        poNumber: null,
        container: null,
        quantity: null,
        sourceAmount: charge.sourceAmount,
        sourceCurrency: charge.sourceCurrency,
        fxRate: charge.fxRate,
        fxDate: charge.fxDate,
        hnlAmount: charge.hnlAmount,
        commercialUnitCostHnl: null,
        componentAllocatedCostHnl: null,
        commercialLineHnl: null,
        allocatedLandedCostHnl: charge.costTreatment === 'ALLOCATE_TO_LANDED' ? charge.hnlAmount : 0,
        landedUnitCostHnl: null,
        landedLineHnl: null,
        final: charge.final,
        costTreatment: charge.costTreatment,
      })),
    ];
    return buildShipmentReport(detail, reportKey, 'Liquidation', [
      { key: 'rowType', header: 'Row Type', width: 16 },
      { key: 'shipmentNumber', header: 'Shipment', width: 18 },
      { key: 'supplierOrCounterparty', header: 'Supplier / Counterparty', width: 28 },
      { key: 'documentNumber', header: 'Document', width: 18 },
      { key: 'payableKind', header: 'Kind', width: 16 },
      { key: 'costRole', header: 'Cost Role', width: 18 },
      { key: 'receiptPolicy', header: 'Receipt Policy', width: 18 },
      { key: 'allocationGroupKey', header: 'Allocation Group', width: 24 },
      { key: 'skuCode', header: 'SKU', width: 18 },
      { key: 'itemCode', header: 'Item Code', width: 18 },
      { key: 'styleCode', header: 'Style', width: 16 },
      { key: 'description', header: 'Description', width: 36 },
      { key: 'poNumber', header: 'PO', width: 18 },
      { key: 'container', header: 'Container', width: 18 },
      { key: 'quantity', header: 'Quantity', width: 12, numFmt: 'decimal2' },
      { key: 'sourceAmount', header: 'Source Amount', width: 16, numFmt: 'money' },
      { key: 'sourceCurrency', header: 'Currency', width: 10 },
      { key: 'fxRate', header: 'FX Rate', width: 12, numFmt: 'decimal2' },
      { key: 'fxDate', header: 'FX Date', width: 12, numFmt: 'date' },
      { key: 'hnlAmount', header: 'HNL Amount', width: 16, numFmt: 'money' },
      { key: 'commercialUnitCostHnl', header: 'Commercial Unit HNL', width: 20, numFmt: 'money' },
      { key: 'componentAllocatedCostHnl', header: 'Component Allocated HNL', width: 24, numFmt: 'money' },
      { key: 'commercialLineHnl', header: 'Commercial Line HNL', width: 20, numFmt: 'money' },
      { key: 'allocatedLandedCostHnl', header: 'Allocated Landed HNL', width: 20, numFmt: 'money' },
      { key: 'landedUnitCostHnl', header: 'Landed Unit HNL', width: 18, numFmt: 'money' },
      { key: 'landedLineHnl', header: 'Landed Line HNL', width: 18, numFmt: 'money' },
      { key: 'final', header: 'Final', width: 10 },
      { key: 'costTreatment', header: 'Cost Treatment', width: 24 },
    ], rows);
  }

  if (reportKey === 'goods-in-transit') {
    const rows = detail.goodsInTransit.map((record) => {
      const invoiceLine = record.invoiceLineId ? invoiceLineById.get(record.invoiceLineId) : null;
      const shipmentLine = record.shipmentLineId ? shipmentLineById.get(record.shipmentLineId) : null;
      const container = record.containerId ? containersById.get(record.containerId) : null;
      return {
        shipmentNumber: detail.shipmentNumber,
        status: record.status,
        container: reportContainerLabel(container),
        invoiceNumber: invoiceLine?.invoiceNumber ?? null,
        poNumber: shipmentLine?.purchaseOrderNumber ?? null,
        skuCode: invoiceLine?.skuCode ?? shipmentLine?.skuCode ?? null,
        costRole: invoiceLine?.costRole ?? null,
        receiptPolicy: invoiceLine?.receiptPolicy ?? null,
        allocationGroupKey: invoiceLine?.allocationGroupKey ?? null,
        description: invoiceLine?.description ?? shipmentLine?.description ?? null,
        quantityInTransit: record.quantityInTransit,
        commercialUnitCostHnl: invoiceLine?.commercialUnitCostHnl ?? shipmentLine?.commercialUnitCostHnl ?? null,
        componentAllocatedCostHnl: invoiceLine?.componentAllocatedCostHnl ?? null,
        landedUnitCostHnl: invoiceLine?.landedUnitCostHnl ?? shipmentLine?.landedUnitCostHnl ?? null,
        ownershipTransferAt: record.ownershipTransferAt,
        expectedReceiptAt: record.expectedReceiptAt,
        receivedAt: record.receivedAt,
        auditReason: record.auditReason,
      };
    });
    return buildShipmentReport(detail, reportKey, 'Goods In Transit', [
      { key: 'shipmentNumber', header: 'Shipment', width: 18 },
      { key: 'status', header: 'Status', width: 18 },
      { key: 'container', header: 'Container', width: 18 },
      { key: 'invoiceNumber', header: 'Invoice', width: 18 },
      { key: 'poNumber', header: 'PO', width: 18 },
      { key: 'skuCode', header: 'SKU', width: 18 },
      { key: 'costRole', header: 'Cost Role', width: 18 },
      { key: 'receiptPolicy', header: 'Receipt Policy', width: 18 },
      { key: 'allocationGroupKey', header: 'Allocation Group', width: 24 },
      { key: 'description', header: 'Description', width: 36 },
      { key: 'quantityInTransit', header: 'Quantity In Transit', width: 20, numFmt: 'decimal2' },
      { key: 'commercialUnitCostHnl', header: 'Commercial Unit HNL', width: 20, numFmt: 'money' },
      { key: 'componentAllocatedCostHnl', header: 'Component Allocated HNL', width: 24, numFmt: 'money' },
      { key: 'landedUnitCostHnl', header: 'Landed Unit HNL', width: 18, numFmt: 'money' },
      { key: 'ownershipTransferAt', header: 'Ownership Date', width: 16, numFmt: 'date' },
      { key: 'expectedReceiptAt', header: 'Expected Receipt', width: 18, numFmt: 'date' },
      { key: 'receivedAt', header: 'Received At', width: 16, numFmt: 'date' },
      { key: 'auditReason', header: 'Audit Reason', width: 36 },
    ], rows);
  }

  if (reportKey === 'expected-po-shipment') {
    const rows = detail.shipmentLines.map((line) => ({
      shipmentNumber: detail.shipmentNumber,
      status: line.status,
      purchaseOrderNumber: line.purchaseOrderNumber,
      vendorCode: line.vendorCode,
      vendorName: line.vendorName,
      buyer: line.buyer,
      container: line.containerLabel,
      invoiceNumber: line.invoiceNumber,
      invoiceMatchReviewStatus: line.invoiceMatchReviewStatus,
      skuCode: line.skuCode,
      description: line.description,
      expectedQuantity: line.expectedQuantity,
      sourceUnitCost: line.sourceUnitCost,
      sourceCurrency: line.sourceCurrency,
      fxRate: line.fxRate,
      fxDate: line.fxDate,
      incotermCode: line.incotermCode,
      commercialUnitCostHnl: line.commercialUnitCostHnl,
      estimatedLandedUnitCostHnl: line.estimatedLandedUnitCostHnl,
      allocatedLandedCostHnl: line.allocatedLandedCostHnl,
      landedUnitCostHnl: line.landedUnitCostHnl,
      notes: line.notes,
    }));
    return buildShipmentReport(detail, reportKey, 'Expected POs', [
      { key: 'shipmentNumber', header: 'Shipment', width: 18 },
      { key: 'status', header: 'Status', width: 14 },
      { key: 'purchaseOrderNumber', header: 'PO', width: 18 },
      { key: 'vendorCode', header: 'Vendor Code', width: 14 },
      { key: 'vendorName', header: 'Vendor Name', width: 24 },
      { key: 'buyer', header: 'Buyer', width: 12 },
      { key: 'container', header: 'Container', width: 18 },
      { key: 'invoiceNumber', header: 'Invoice', width: 18 },
      { key: 'invoiceMatchReviewStatus', header: 'Invoice Match', width: 22 },
      { key: 'skuCode', header: 'SKU', width: 18 },
      { key: 'description', header: 'Description', width: 36 },
      { key: 'expectedQuantity', header: 'Expected Qty', width: 14, numFmt: 'decimal2' },
      { key: 'sourceUnitCost', header: 'Source Unit Cost', width: 18, numFmt: 'money' },
      { key: 'sourceCurrency', header: 'Currency', width: 10 },
      { key: 'fxRate', header: 'FX Rate', width: 12, numFmt: 'decimal2' },
      { key: 'fxDate', header: 'FX Date', width: 12, numFmt: 'date' },
      { key: 'incotermCode', header: 'Incoterm', width: 12 },
      { key: 'commercialUnitCostHnl', header: 'Commercial Unit HNL', width: 20, numFmt: 'money' },
      { key: 'estimatedLandedUnitCostHnl', header: 'Estimated Landed Unit HNL', width: 24, numFmt: 'money' },
      { key: 'allocatedLandedCostHnl', header: 'Allocated Landed HNL', width: 20, numFmt: 'money' },
      { key: 'landedUnitCostHnl', header: 'Final Landed Unit HNL', width: 22, numFmt: 'money' },
      { key: 'notes', header: 'Notes', width: 36 },
    ], rows);
  }

  if (reportKey === 'landed-cost-allocation') {
    const componentRows = await prisma.$queryRawUnsafe<Array<{
      allocationId: string;
      allocationBasis: string;
      allocatedHnlAmount: unknown;
      allocatedQuantity: unknown;
      buildCode: string;
      buildDescription: string | null;
      componentInvoiceLineId: string;
      componentInvoiceNumber: string;
      componentSupplierName: string;
      componentItemCode: string | null;
      componentStyleCode: string | null;
      componentDescription: string | null;
      componentCostRole: string | null;
      componentReceiptPolicy: string | null;
      allocationGroupKey: string | null;
      outputInvoiceLineId: string | null;
      outputInvoiceNumber: string | null;
      outputPoNumber: string | null;
      outputSkuCode: string | null;
      outputItemCode: string | null;
      outputStyleCode: string | null;
      outputDescription: string | null;
    }>>(
      `
        SELECT
          ca.id::text AS "allocationId",
          ca.allocation_basis AS "allocationBasis",
          ca.allocated_hnl_amount AS "allocatedHnlAmount",
          ca.allocated_quantity AS "allocatedQuantity",
          cb.build_code AS "buildCode",
          cb.description AS "buildDescription",
          component_line.id::text AS "componentInvoiceLineId",
          component_invoice.invoice_number AS "componentInvoiceNumber",
          component_invoice.supplier_name AS "componentSupplierName",
          component_line.item_code AS "componentItemCode",
          component_line.style_code AS "componentStyleCode",
          component_line.description AS "componentDescription",
          component_line.cost_role AS "componentCostRole",
          component_line.receipt_policy AS "componentReceiptPolicy",
          COALESCE(output_line.allocation_group_key, component_line.allocation_group_key) AS "allocationGroupKey",
          output_line.id::text AS "outputInvoiceLineId",
          output_invoice.invoice_number AS "outputInvoiceNumber",
          output_po.po_number AS "outputPoNumber",
          COALESCE(output_sku.code, output_sku.provisional_code, output_line.item_code) AS "outputSkuCode",
          output_line.item_code AS "outputItemCode",
          output_line.style_code AS "outputStyleCode",
          COALESCE(output_line.description, output_pol.description) AS "outputDescription"
        FROM app.import_cost_component_allocation ca
        JOIN app.import_cost_build cb ON cb.id = ca.build_id
        JOIN app.import_invoice_line component_line ON component_line.id = ca.component_invoice_line_id
        JOIN app.import_supplier_invoice component_invoice ON component_invoice.id = component_line.invoice_id
        LEFT JOIN app.import_invoice_line output_line ON output_line.id = ca.output_invoice_line_id
        LEFT JOIN app.import_supplier_invoice output_invoice ON output_invoice.id = output_line.invoice_id
        LEFT JOIN app.import_shipment_line output_shipment_line ON output_shipment_line.id = ca.output_shipment_line_id
        LEFT JOIN app.purchase_order_line output_pol ON output_pol.id = output_shipment_line.purchase_order_line_id
        LEFT JOIN app.purchase_order output_po ON output_po.id = output_pol.purchase_order_id
        LEFT JOIN app.sku output_sku ON output_sku.id = COALESCE(output_line.sku_id, output_pol.sku_id)
        WHERE ca.shipment_id = $1::uuid
        ORDER BY cb.build_code ASC, component_invoice.invoice_number ASC, component_line.line_number ASC
      `,
      shipmentId,
    );
    const landedRows = detail.allocations.map((allocation) => {
      const charge = chargeById.get(allocation.chargeId);
      const invoiceLine = allocation.invoiceLineId ? invoiceLineById.get(allocation.invoiceLineId) : null;
      const shipmentLine = allocation.shipmentLineId ? shipmentLineById.get(allocation.shipmentLineId) : null;
      return {
        allocationType: 'LANDED_CHARGE',
        shipmentNumber: detail.shipmentNumber,
        buildCode: null,
        chargeType: charge?.chargeType ?? null,
        chargeDocument: charge?.documentNumber ?? null,
        counterparty: charge?.counterparty ?? null,
        costTreatment: charge?.costTreatment ?? null,
        allocationBasis: allocation.allocationBasis,
        allocatedHnlAmount: allocation.allocatedHnlAmount,
        allocatedQuantity: null,
        invoiceNumber: invoiceLine?.invoiceNumber ?? shipmentLine?.invoiceNumber ?? null,
        poNumber: shipmentLine?.purchaseOrderNumber ?? null,
        skuCode: invoiceLine?.skuCode ?? shipmentLine?.skuCode ?? null,
        itemCode: invoiceLine?.itemCode ?? null,
        styleCode: invoiceLine?.styleCode ?? null,
        description: invoiceLine?.description ?? shipmentLine?.description ?? null,
        componentInvoiceNumber: null,
        componentSupplierName: null,
        componentItemCode: null,
        componentStyleCode: null,
        componentCostRole: null,
        componentReceiptPolicy: null,
        componentDescription: null,
        allocationGroupKey: null,
      };
    });
    const componentReportRows = componentRows.map((row) => ({
      allocationType: 'COMPONENT_COST',
      shipmentNumber: detail.shipmentNumber,
      buildCode: row.buildCode,
      chargeType: null,
      chargeDocument: row.componentInvoiceNumber,
      counterparty: row.componentSupplierName,
      costTreatment: 'ROLL_TO_OUTPUT',
      allocationBasis: row.allocationBasis,
      allocatedHnlAmount: toNumber(row.allocatedHnlAmount),
      allocatedQuantity: nullableNumber(row.allocatedQuantity),
      invoiceNumber: row.outputInvoiceNumber,
      poNumber: row.outputPoNumber,
      skuCode: row.outputSkuCode,
      itemCode: row.outputItemCode,
      styleCode: row.outputStyleCode,
      description: row.outputDescription,
      componentInvoiceNumber: row.componentInvoiceNumber,
      componentSupplierName: row.componentSupplierName,
      componentItemCode: row.componentItemCode,
      componentStyleCode: row.componentStyleCode,
      componentCostRole: row.componentCostRole,
      componentReceiptPolicy: row.componentReceiptPolicy,
      componentDescription: row.componentDescription,
      allocationGroupKey: row.allocationGroupKey,
    }));
    const rows = [...landedRows, ...componentReportRows];
    return buildShipmentReport(detail, reportKey, 'Allocation', [
      { key: 'allocationType', header: 'Allocation Type', width: 20 },
      { key: 'shipmentNumber', header: 'Shipment', width: 18 },
      { key: 'buildCode', header: 'Build Code', width: 24 },
      { key: 'chargeType', header: 'Charge Type', width: 18 },
      { key: 'chargeDocument', header: 'Charge Document', width: 20 },
      { key: 'counterparty', header: 'Counterparty', width: 28 },
      { key: 'costTreatment', header: 'Cost Treatment', width: 24 },
      { key: 'allocationBasis', header: 'Allocation Basis', width: 24 },
      { key: 'allocatedHnlAmount', header: 'Allocated HNL', width: 16, numFmt: 'money' },
      { key: 'allocatedQuantity', header: 'Allocated Qty', width: 14, numFmt: 'decimal2' },
      { key: 'invoiceNumber', header: 'Invoice', width: 18 },
      { key: 'poNumber', header: 'PO', width: 18 },
      { key: 'skuCode', header: 'SKU', width: 18 },
      { key: 'itemCode', header: 'Item Code', width: 18 },
      { key: 'styleCode', header: 'Style', width: 16 },
      { key: 'description', header: 'Description', width: 36 },
      { key: 'componentInvoiceNumber', header: 'Component Invoice', width: 20 },
      { key: 'componentSupplierName', header: 'Component Supplier', width: 28 },
      { key: 'componentItemCode', header: 'Component Item', width: 18 },
      { key: 'componentStyleCode', header: 'Component Style', width: 18 },
      { key: 'componentCostRole', header: 'Component Role', width: 18 },
      { key: 'componentReceiptPolicy', header: 'Component Receipt Policy', width: 24 },
      { key: 'componentDescription', header: 'Component Description', width: 36 },
      { key: 'allocationGroupKey', header: 'Allocation Group', width: 24 },
    ], rows);
  }

  if (reportKey === 'suggested-pricing-review') {
    const rows = detail.suggestedPrices.map((price) => {
      const invoiceLine = invoiceLineById.get(price.invoiceLineId);
      return {
        shipmentNumber: detail.shipmentNumber,
        invoiceNumber: invoiceLine?.invoiceNumber ?? null,
        skuCode: invoiceLine?.skuCode ?? null,
        itemCode: invoiceLine?.itemCode ?? null,
        description: invoiceLine?.description ?? null,
        landedUnitCostHnl: price.landedUnitCostHnl,
        markupFactor: price.markupFactor,
        suggestedRetailHnl: price.suggestedRetailHnl,
        approvalStatus: price.approvalStatus,
        approvedBy: price.approvedBy,
        approvedAt: price.approvedAt,
      };
    });
    return buildShipmentReport(detail, reportKey, 'Suggested Pricing', [
      { key: 'shipmentNumber', header: 'Shipment', width: 18 },
      { key: 'invoiceNumber', header: 'Invoice', width: 18 },
      { key: 'skuCode', header: 'SKU', width: 18 },
      { key: 'itemCode', header: 'Item Code', width: 18 },
      { key: 'description', header: 'Description', width: 36 },
      { key: 'landedUnitCostHnl', header: 'Landed Unit HNL', width: 18, numFmt: 'money' },
      { key: 'markupFactor', header: 'Markup Factor', width: 16, numFmt: 'decimal2' },
      { key: 'suggestedRetailHnl', header: 'Suggested Retail HNL', width: 22, numFmt: 'money' },
      { key: 'approvalStatus', header: 'Approval Status', width: 18 },
      { key: 'approvedBy', header: 'Approved By', width: 20 },
      { key: 'approvedAt', header: 'Approved At', width: 18 },
    ], rows);
  }

  const payables = await listImportPayables(shipmentId);
  const rows = payables.payables.map((payable) => ({
    shipmentNumber: detail.shipmentNumber,
    sourceType: payable.sourceType,
    counterparty: payable.counterparty,
    documentNumber: payable.documentNumber,
    payableKind: payable.payableKind,
    sourceAmount: payable.sourceAmount,
    sourceCurrency: payable.sourceCurrency,
    fxRate: payable.fxRate,
    fxDate: payable.fxDate,
    hnlAmount: payable.hnlAmount,
    final: payable.final,
    readyForAp: payable.readyForAp,
    handoffStatus: payable.handoffStatus,
    apReference: payable.apReference,
    sentToApBy: payable.sentToApBy,
    sentToApAt: payable.sentToApAt,
    paymentReference: payable.paymentReference,
    paidBy: payable.paidBy,
    paidAt: payable.paidAt,
    voidedBy: payable.voidedBy,
    voidedAt: payable.voidedAt,
    voidReason: payable.voidReason,
  }));
  return buildShipmentReport(detail, reportKey, 'AP Handoff', [
    { key: 'shipmentNumber', header: 'Shipment', width: 18 },
    { key: 'sourceType', header: 'Source Type', width: 22 },
    { key: 'counterparty', header: 'Counterparty', width: 28 },
    { key: 'documentNumber', header: 'Document', width: 18 },
    { key: 'payableKind', header: 'Kind', width: 16 },
    { key: 'sourceAmount', header: 'Source Amount', width: 16, numFmt: 'money' },
    { key: 'sourceCurrency', header: 'Currency', width: 10 },
    { key: 'fxRate', header: 'FX Rate', width: 12, numFmt: 'decimal2' },
    { key: 'fxDate', header: 'FX Date', width: 12, numFmt: 'date' },
    { key: 'hnlAmount', header: 'HNL Amount', width: 16, numFmt: 'money' },
    { key: 'final', header: 'Final', width: 10 },
    { key: 'readyForAp', header: 'Ready For AP', width: 14 },
    { key: 'handoffStatus', header: 'Handoff Status', width: 18 },
    { key: 'apReference', header: 'AP Reference', width: 18 },
    { key: 'sentToApBy', header: 'Sent By', width: 20 },
    { key: 'sentToApAt', header: 'Sent At', width: 20 },
    { key: 'paymentReference', header: 'Payment Reference', width: 22 },
    { key: 'paidBy', header: 'Paid By', width: 20 },
    { key: 'paidAt', header: 'Paid At', width: 20 },
    { key: 'voidedBy', header: 'Voided By', width: 20 },
    { key: 'voidedAt', header: 'Voided At', width: 20 },
    { key: 'voidReason', header: 'Void Reason', width: 36 },
  ], rows);
}

interface ImportPurchaseOrderShipmentRow {
  id: string;
  shipmentNumber: string;
  displayName: string;
  status: ImportShipmentStatus;
  buyer: string | null;
}

interface ImportPurchaseOrderLineRow {
  sourceType: 'INVOICE_LINE' | 'EXPECTED_PO_LINE';
  shipmentId: string;
  shipmentNumber: string;
  displayName: string;
  status: ImportShipmentStatus;
  shipmentLineId: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  supplierCode: string | null;
  supplierName: string;
  invoiceLineId: string | null;
  purchaseOrderLineId: string | null;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  purchaseOrderStatus: string | null;
  purchaseOrderVendorCode: string | null;
  skuId: string | null;
  poLineSkuId: string | null;
  skuCode: string | null;
  itemCode: string | null;
  styleCode: string | null;
  description: string | null;
  quantity: unknown;
  unitOfMeasure: string;
  sourceUnitCost: unknown;
  sourceCurrency: ImportSourceCurrency;
  fxRate: unknown;
  fxDate: unknown;
  baseUnitCostHnl: unknown;
  commercialUnitCostHnl: unknown;
  componentAllocatedCostHnl: unknown;
  landedUnitCostHnl: unknown;
  costRole: unknown;
  receiptPolicy: unknown;
  allocationGroupKey: string | null;
  poUnitCostHnl: unknown;
}

function isWholeUnitQuantity(value: number): boolean {
  return Number.isInteger(value) || Math.abs(value - Math.round(value)) < 0.000001;
}

function importPoLineBlockingReason(
  line: Pick<
    ImportPurchaseOrderLinkLine,
    | 'purchaseOrderLineId'
    | 'skuId'
    | 'skuCode'
    | 'quantity'
    | 'baseUnitCostHnl'
    | 'commercialUnitCostHnl'
    | 'landedUnitCostHnl'
    | 'receiptPolicy'
  >,
  unitCostSource: ImportPoUnitCostSource,
): string | null {
  if (line.purchaseOrderLineId) return 'Already linked to a purchase-order line.';
  if (line.receiptPolicy !== 'RECEIVE_TO_STOCK') {
    return 'Import cost component lines are rolled into receiptable output lines.';
  }
  if (!line.skuId) return 'Link the import line to an app SKU before creating a PO.';
  if (!line.skuCode) return 'Linked SKU was not found.';
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) return 'Quantity must be greater than zero.';
  if (!isWholeUnitQuantity(line.quantity)) return 'Native purchase-order lines require whole-unit quantities.';

  const unitCost = unitCostSource === 'LANDED'
    ? line.landedUnitCostHnl
    : line.commercialUnitCostHnl ?? line.baseUnitCostHnl;
  if (unitCost == null || !Number.isFinite(unitCost) || unitCost <= 0) {
    return unitCostSource === 'LANDED'
      ? 'Allocate landed cost before creating a landed-cost draft PO.'
      : 'Base unit cost must be greater than zero.';
  }
  return null;
}

function mapImportPurchaseOrderLinkLine(row: ImportPurchaseOrderLineRow): ImportPurchaseOrderLinkLine {
  const costRole = mapCostRole(row.costRole);
  const receiptPolicy = mapReceiptPolicy(row.receiptPolicy, costRole);
  const line: ImportPurchaseOrderLinkLine = {
    sourceType: row.sourceType,
    shipmentId: String(row.shipmentId),
    shipmentLineId: row.shipmentLineId ? String(row.shipmentLineId) : null,
    invoiceId: row.invoiceId ? String(row.invoiceId) : null,
    invoiceNumber: row.invoiceNumber ?? null,
    supplierCode: row.supplierCode ?? null,
    supplierName: String(row.supplierName),
    invoiceLineId: row.invoiceLineId ? String(row.invoiceLineId) : null,
    purchaseOrderLineId: row.purchaseOrderLineId ? String(row.purchaseOrderLineId) : null,
    purchaseOrderId: row.purchaseOrderId ? String(row.purchaseOrderId) : null,
    purchaseOrderNumber: row.purchaseOrderNumber ?? null,
    purchaseOrderStatus: row.purchaseOrderStatus ?? null,
    purchaseOrderVendorCode: row.purchaseOrderVendorCode ?? null,
    skuId: row.skuId ? String(row.skuId) : null,
    poLineSkuId: row.poLineSkuId ? String(row.poLineSkuId) : null,
    skuCode: row.skuCode ?? null,
    itemCode: row.itemCode ?? null,
    styleCode: row.styleCode ?? null,
    description: row.description ?? null,
    quantity: toNumber(row.quantity),
    unitOfMeasure: String(row.unitOfMeasure),
    sourceUnitCost: nullableNumber(row.sourceUnitCost),
    sourceCurrency: row.sourceCurrency,
    fxRate: toNumber(row.fxRate),
    fxDate: dateOnly(row.fxDate) ?? '',
    baseUnitCostHnl: toNumber(row.baseUnitCostHnl),
    commercialUnitCostHnl: nullableNumber(row.commercialUnitCostHnl),
    componentAllocatedCostHnl: toNumber(row.componentAllocatedCostHnl),
    landedUnitCostHnl: nullableNumber(row.landedUnitCostHnl),
    costRole,
    receiptPolicy,
    allocationGroupKey: row.allocationGroupKey ?? null,
    poUnitCostHnl: nullableNumber(row.poUnitCostHnl),
    canCreatePurchaseOrderLine: false,
    blockingReason: null,
  };
  line.blockingReason = importPoLineBlockingReason(line, 'BASE');
  line.canCreatePurchaseOrderLine = line.blockingReason == null;
  return line;
}

async function readImportPurchaseOrderLinking(
  client: SqlClient,
  shipmentId: string,
): Promise<ImportPurchaseOrderLinkingEnvelope> {
  const shipmentRows = await client.$queryRawUnsafe<ImportPurchaseOrderShipmentRow[]>(
    `
      SELECT
        id,
        shipment_number AS "shipmentNumber",
        display_name AS "displayName",
        status,
        buyer
      FROM app.import_shipment
      WHERE id = $1::uuid
      LIMIT 1
    `,
    shipmentId,
  );
  const shipment = shipmentRows[0];
  if (!shipment) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }

  const rows = await client.$queryRawUnsafe<ImportPurchaseOrderLineRow[]>(
    `
      SELECT
        *
      FROM (
        SELECT
          'INVOICE_LINE'::text AS "sourceType",
          si.shipment_id AS "shipmentId",
          s.shipment_number AS "shipmentNumber",
          s.display_name AS "displayName",
          s.status,
          NULL::uuid AS "shipmentLineId",
          si.id AS "invoiceId",
          si.invoice_number AS "invoiceNumber",
          si.supplier_code AS "supplierCode",
          si.supplier_name AS "supplierName",
          il.id AS "invoiceLineId",
          il.purchase_order_line_id AS "purchaseOrderLineId",
          po.id AS "purchaseOrderId",
          po.po_number AS "purchaseOrderNumber",
          po.status AS "purchaseOrderStatus",
          po.vendor_code AS "purchaseOrderVendorCode",
          COALESCE(il.sku_id, pol.sku_id) AS "skuId",
          pol.sku_id AS "poLineSkuId",
          COALESCE(sku.code, sku.provisional_code) AS "skuCode",
          il.item_code AS "itemCode",
          il.style_code AS "styleCode",
          il.description,
          il.quantity,
          il.unit_of_measure AS "unitOfMeasure",
          il.source_unit_cost AS "sourceUnitCost",
          il.source_currency AS "sourceCurrency",
          il.fx_rate AS "fxRate",
          il.fx_date AS "fxDate",
          il.base_unit_cost_hnl AS "baseUnitCostHnl",
          COALESCE(il.commercial_unit_cost_hnl, il.base_unit_cost_hnl) AS "commercialUnitCostHnl",
          COALESCE(il.component_allocated_cost_hnl, 0) AS "componentAllocatedCostHnl",
          il.landed_unit_cost_hnl AS "landedUnitCostHnl",
          il.cost_role AS "costRole",
          il.receipt_policy AS "receiptPolicy",
          il.allocation_group_key AS "allocationGroupKey",
          pol.unit_cost AS "poUnitCostHnl",
          si.invoice_number AS "sortDocument",
          il.line_number AS "sortLine"
        FROM app.import_supplier_invoice si
        JOIN app.import_shipment s ON s.id = si.shipment_id
        JOIN app.import_invoice_line il ON il.invoice_id = si.id
        LEFT JOIN app.purchase_order_line pol ON pol.id = il.purchase_order_line_id
        LEFT JOIN app.purchase_order po ON po.id = pol.po_id
        LEFT JOIN app.sku sku ON sku.id = COALESCE(il.sku_id, pol.sku_id)
        WHERE si.shipment_id = $1::uuid
        UNION ALL
        SELECT
          'EXPECTED_PO_LINE'::text AS "sourceType",
          sl.shipment_id AS "shipmentId",
          s.shipment_number AS "shipmentNumber",
          s.display_name AS "displayName",
          s.status,
          sl.id AS "shipmentLineId",
          NULL::uuid AS "invoiceId",
          NULL::text AS "invoiceNumber",
          po.vendor_code AS "supplierCode",
          COALESCE(vo.mail_name, v.mail_name, vo.short_name, v.short_name, po.vendor_code) AS "supplierName",
          NULL::uuid AS "invoiceLineId",
          sl.purchase_order_line_id AS "purchaseOrderLineId",
          po.id AS "purchaseOrderId",
          po.po_number AS "purchaseOrderNumber",
          po.status AS "purchaseOrderStatus",
          po.vendor_code AS "purchaseOrderVendorCode",
          pol.sku_id AS "skuId",
          pol.sku_id AS "poLineSkuId",
          COALESCE(sku.code, sku.provisional_code) AS "skuCode",
          NULL::text AS "itemCode",
          NULL::text AS "styleCode",
          COALESCE(sku.description_web, sku.description_rics, sku.comment) AS "description",
          sl.expected_quantity AS quantity,
          'EA'::text AS "unitOfMeasure",
          sl.source_unit_cost AS "sourceUnitCost",
          sl.source_currency AS "sourceCurrency",
          sl.fx_rate AS "fxRate",
          sl.fx_date AS "fxDate",
          sl.commercial_unit_cost_hnl AS "baseUnitCostHnl",
          sl.commercial_unit_cost_hnl AS "commercialUnitCostHnl",
          0::numeric AS "componentAllocatedCostHnl",
          sl.landed_unit_cost_hnl AS "landedUnitCostHnl",
          'FINISHED_GOOD'::text AS "costRole",
          'RECEIVE_TO_STOCK'::text AS "receiptPolicy",
          NULL::text AS "allocationGroupKey",
          pol.unit_cost AS "poUnitCostHnl",
          po.po_number AS "sortDocument",
          pol.line_sequence AS "sortLine"
        FROM app.import_shipment_line sl
        JOIN app.import_shipment s ON s.id = sl.shipment_id
        JOIN app.purchase_order_line pol ON pol.id = sl.purchase_order_line_id
        JOIN app.purchase_order po ON po.id = pol.po_id
        LEFT JOIN app.vendor v ON v.code = po.vendor_code
        LEFT JOIN app.vendor_overlay vo ON vo.code = po.vendor_code AND (vo.source IS NULL OR vo.source <> 'tombstone')
        LEFT JOIN app.sku sku ON sku.id = pol.sku_id
        WHERE sl.shipment_id = $1::uuid
          AND sl.status <> 'CANCELLED'
          AND sl.invoice_line_id IS NULL
      ) link_rows
      ORDER BY "sortDocument" ASC, "sortLine" ASC
    `,
    shipmentId,
  );

  const lines = rows.map(mapImportPurchaseOrderLinkLine);
  const linkedLineCount = lines.filter((line) => line.purchaseOrderLineId).length;
  const creatableLineCount = lines.filter((line) => line.canCreatePurchaseOrderLine).length;
  return {
    shipmentId: String(shipment.id),
    shipmentNumber: String(shipment.shipmentNumber),
    displayName: String(shipment.displayName),
    status: shipment.status,
    lineCount: lines.length,
    linkedLineCount,
    unlinkedLineCount: lines.length - linkedLineCount,
    creatableLineCount,
    lines,
  };
}

export async function getImportPurchaseOrderLinking(
  shipmentId: string,
): Promise<ImportPurchaseOrderLinkingEnvelope> {
  return readImportPurchaseOrderLinking(prisma, shipmentId);
}

function importVendorEffectiveCte(): string {
  return `
    WITH vendor_effective AS (
      SELECT
        COALESCE(o.code, v.code) AS code
      FROM app.vendor v
      FULL OUTER JOIN app.vendor_overlay o ON o.code = v.code
      WHERE (o.source IS NULL OR o.source <> 'tombstone')
        AND (v.code IS NOT NULL OR o.code IS NOT NULL)
    )
  `;
}

async function importVendorExists(client: SqlClient, vendorCode: string): Promise<boolean> {
  const rows = await client.$queryRawUnsafe<Array<{ code: string }>>(
    `
      ${importVendorEffectiveCte()}
      SELECT code
      FROM vendor_effective
      WHERE UPPER(code) = $1
      LIMIT 1
    `,
    vendorCode.trim().toUpperCase(),
  );
  return rows.length > 0;
}

async function importPoNumberExists(client: SqlClient, poNumber: string): Promise<boolean> {
  const rows = await client.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id::text FROM app.purchase_order WHERE UPPER(po_number) = $1 LIMIT 1`,
    poNumber.trim().toUpperCase(),
  );
  return rows.length > 0;
}

function isReservedImportPoNumber(poNumber: string): boolean {
  return /^[AV]/i.test(poNumber.trim());
}

function importPoNumberBase(shipmentNumber: string, supplierCode: string | null): string {
  const raw = `IMP-${shipmentNumber}${supplierCode ? `-${supplierCode}` : ''}`;
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return (normalized || 'IMP').slice(0, 32);
}

async function resolveImportPoNumber(
  client: SqlClient,
  shipmentNumber: string,
  supplierCode: string | null,
  requestedPoNumber: string | null,
): Promise<string> {
  if (requestedPoNumber) {
    const poNumber = requestedPoNumber.trim().toUpperCase();
    if (poNumber.length > 32) {
      throw new ImportManagementServiceError(422, 'INVALID_PO_NUMBER', 'poNumber must be 32 characters or less.');
    }
    if (isReservedImportPoNumber(poNumber)) {
      throw new ImportManagementServiceError(409, 'RESERVED_PO_PREFIX', 'Manual PO numbers cannot start with A or V.');
    }
    if (await importPoNumberExists(client, poNumber)) {
      throw new ImportManagementServiceError(409, 'PO_NUMBER_EXISTS', 'Purchase-order number already exists.');
    }
    return poNumber;
  }

  const base = importPoNumberBase(shipmentNumber, supplierCode);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`;
    if (!(await importPoNumberExists(client, candidate))) return candidate;
  }
  throw new ImportManagementServiceError(409, 'PO_NUMBER_EXISTS', 'Could not generate a unique import PO number.');
}

function normalizeImportPoUnitCostSource(value: ImportPoUnitCostSource | undefined): ImportPoUnitCostSource {
  return value === 'LANDED' ? 'LANDED' : 'BASE';
}

function importPoUnitCost(line: ImportPurchaseOrderLinkLine, unitCostSource: ImportPoUnitCostSource): number {
  const unitCost = unitCostSource === 'LANDED'
    ? line.landedUnitCostHnl
    : line.commercialUnitCostHnl ?? line.baseUnitCostHnl;
  return round2(unitCost ?? 0);
}

function commonImportPoSourceCurrency(lines: ImportPurchaseOrderLinkLine[]): ImportSourceCurrency {
  const currencies = new Set(lines.map((line) => line.sourceCurrency));
  return currencies.size === 1 ? lines[0]?.sourceCurrency ?? 'HNL' : 'HNL';
}

function commonImportPoFxRate(lines: ImportPurchaseOrderLinkLine[]): number {
  const first = lines[0];
  if (!first) return 1;
  return lines.every((line) => line.sourceCurrency === first.sourceCurrency && Math.abs(line.fxRate - first.fxRate) <= 0.000001)
    ? first.fxRate
    : 1;
}

function commonImportPoFxDate(lines: ImportPurchaseOrderLinkLine[]): string {
  const first = lines[0];
  if (!first) return new Date().toISOString().slice(0, 10);
  return lines.every((line) => line.fxDate === first.fxDate)
    ? first.fxDate
    : new Date().toISOString().slice(0, 10);
}

export async function createImportPurchaseOrderDraft(
  shipmentId: string,
  input: CreateImportPurchaseOrderDraftInput,
  actor: string | null,
): Promise<CreateImportPurchaseOrderDraftResult> {
  const vendorCode = requiredString(input.vendorCode, 'vendorCode').toUpperCase();
  if (vendorCode.length > 4) {
    throw new ImportManagementServiceError(422, 'INVALID_VENDOR_CODE', 'vendorCode must be 4 characters or less.');
  }
  const supplierInvoiceId = cleanString(input.supplierInvoiceId);
  const unitCostSource = normalizeImportPoUnitCostSource(input.unitCostSource);
  const createdBy = cleanString(input.createdBy) ?? cleanString(actor) ?? 'system';

  let purchaseOrderId = '';
  let purchaseOrderNumber = '';
  let createdLineCount = 0;

  await prisma.$transaction(async (tx) => {
    if (!(await importVendorExists(tx, vendorCode))) {
      throw new ImportManagementServiceError(422, 'VENDOR_NOT_FOUND', 'Vendor code was not found.');
    }

    const linking = await readImportPurchaseOrderLinking(tx, shipmentId);
    const selectedLines = supplierInvoiceId
      ? linking.lines.filter((line) => line.invoiceId === supplierInvoiceId)
      : linking.lines;
    if (supplierInvoiceId && selectedLines.length === 0) {
      throw new ImportManagementServiceError(404, 'INVOICE_NOT_FOUND', 'Import supplier invoice not found for shipment.');
    }

    const targetLines = selectedLines.filter((line) => importPoLineBlockingReason(line, unitCostSource) == null);
    if (targetLines.length === 0) {
      const firstBlocked = selectedLines.find((line) => importPoLineBlockingReason(line, unitCostSource));
      throw new ImportManagementServiceError(
        409,
        'NO_PO_LINES_READY',
        firstBlocked?.blockingReason ?? 'No unlinked SKU-ready import lines are available for draft PO creation.',
      );
    }

    const poId = uuidv4();
    const supplierSuffix = targetLines.find((line) => line.supplierCode)?.supplierCode ?? null;
    const poNumber = await resolveImportPoNumber(
      tx,
      linking.shipmentNumber,
      supplierSuffix,
      cleanString(input.poNumber),
    );
    const comments = [
      `Import shipment ${linking.shipmentNumber}`,
      cleanString(input.notes),
    ].filter(Boolean).join(' - ');
    const poSourceCurrency = commonImportPoSourceCurrency(targetLines);
    const poFxRate = poSourceCurrency === 'HNL' ? 1 : commonImportPoFxRate(targetLines);
    const poFxDate = poSourceCurrency === 'HNL'
      ? new Date().toISOString().slice(0, 10)
      : commonImportPoFxDate(targetLines);
    const costBasis = unitCostSource === 'LANDED' ? 'IMPORT_LANDED_ESTIMATE_HNL' : 'IMPORT_COMMERCIAL_HNL';

    await tx.$executeRawUnsafe(
      `
        INSERT INTO app.purchase_order (
          id, po_number, bill_to_store_id, ship_to_store_id, vendor_code,
          order_type, classification, status, origin, buyer, comments, order_date, created_by,
          source_currency, fx_rate, fx_date, cost_basis
        ) VALUES (
          $1::uuid, $2, $3, $4, $5,
          'RO', 'AT_ONCE', 'DRAFT', 'IMPORT_MANAGEMENT', $6, $7, CURRENT_TIMESTAMP, $8,
          $9, $10, $11::date, $12
        )
      `,
      poId,
      poNumber,
      input.billToStoreId ?? null,
      input.shipToStoreId ?? null,
      vendorCode,
      cleanString(input.buyer) ?? null,
      comments || null,
      createdBy,
      poSourceCurrency,
      poFxRate,
      poFxDate,
      costBasis,
    );

    for (const [index, line] of targetLines.entries()) {
      const poLineId = uuidv4();
      const quantity = Math.round(line.quantity);
      const commercialUnitCostHnl = round4(line.commercialUnitCostHnl ?? line.baseUnitCostHnl);
      const estimatedLandedUnitCostHnl = round4(line.landedUnitCostHnl ?? commercialUnitCostHnl);
      const sourceUnitCost = poSourceCurrency === line.sourceCurrency
        ? line.sourceUnitCost ?? (line.sourceCurrency === 'HNL' ? commercialUnitCostHnl : null)
        : null;
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.purchase_order_line (
            id, po_id, sku_id, line_sequence, quantity_ordered, quantity_received,
            unit_cost, source_unit_cost, commercial_unit_cost_hnl, estimated_landed_unit_cost_hnl
          ) VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4, $5, 0,
            $6::numeric, $7::numeric, $8::numeric, $9::numeric
          )
        `,
        poLineId,
        poId,
        line.skuId,
        index + 1,
        quantity,
        importPoUnitCost(line, unitCostSource),
        sourceUnitCost,
        commercialUnitCostHnl,
        estimatedLandedUnitCostHnl,
      );
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.purchase_order_line_size_cell (
            id, po_line_id, column_label, row_label, quantity_ordered
          ) VALUES ($1::uuid, $2::uuid, '', '', $3)
        `,
        uuidv4(),
        poLineId,
        quantity,
      );
      await tx.$executeRawUnsafe(
        `
          UPDATE app.import_invoice_line
          SET purchase_order_line_id = $2::uuid,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1::uuid
            AND purchase_order_line_id IS NULL
        `,
        line.invoiceLineId,
        poLineId,
      );
    }

    await tx.$executeRawUnsafe(
      `
        INSERT INTO app.po_status_history (
          id, po_id, from_status, to_status, changed_by, reason
        ) VALUES ($1::uuid, $2::uuid, NULL, 'DRAFT', $3, $4)
      `,
      uuidv4(),
      poId,
      createdBy,
      `Created from import shipment ${linking.shipmentNumber}`,
    );
    await tx.$executeRawUnsafe(
      `UPDATE app.import_shipment SET updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
      shipmentId,
    );

    purchaseOrderId = poId;
    purchaseOrderNumber = poNumber;
    createdLineCount = targetLines.length;
  });

  if (!purchaseOrderId) {
    throw new ImportManagementServiceError(500, 'PO_CREATION_FAILED', 'Draft purchase order was not created.');
  }

  return {
    ...(await getImportPurchaseOrderLinking(shipmentId)),
    purchaseOrderId,
    purchaseOrderNumber,
    createdLineCount,
    unitCostSource,
  };
}

export async function linkImportInvoiceLineToPurchaseOrderLine(
  invoiceLineId: string,
  input: LinkImportInvoiceLineToPoInput,
): Promise<ImportPurchaseOrderLinkingEnvelope> {
  const lineRows = await prisma.$queryRawUnsafe<Array<{
    shipmentId: string;
    skuId: string | null;
  }>>(
    `
      SELECT si.shipment_id AS "shipmentId", il.sku_id AS "skuId"
      FROM app.import_invoice_line il
      JOIN app.import_supplier_invoice si ON si.id = il.invoice_id
      WHERE il.id = $1::uuid
      LIMIT 1
    `,
    invoiceLineId,
  );
  const line = lineRows[0];
  if (!line) {
    throw new ImportManagementServiceError(404, 'INVOICE_LINE_NOT_FOUND', 'Import invoice line not found.');
  }

  const purchaseOrderLineId = cleanString(input.purchaseOrderLineId);
  if (purchaseOrderLineId) {
    const poRows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      skuId: string;
      status: string;
    }>>(
      `
        SELECT pol.id, pol.sku_id AS "skuId", po.status
        FROM app.purchase_order_line pol
        JOIN app.purchase_order po ON po.id = pol.po_id
        WHERE pol.id = $1::uuid
        LIMIT 1
      `,
      purchaseOrderLineId,
    );
    const poLine = poRows[0];
    if (!poLine) {
      throw new ImportManagementServiceError(404, 'PO_LINE_NOT_FOUND', 'Purchase-order line not found.');
    }
    if (['RECEIVED', 'CLOSED', 'CANCELLED'].includes(poLine.status)) {
      throw new ImportManagementServiceError(
        409,
        'PO_LINE_NOT_LINKABLE',
        'Cannot link an import line to a received, closed, or cancelled purchase order.',
      );
    }
    if (line.skuId && String(line.skuId) !== String(poLine.skuId)) {
      throw new ImportManagementServiceError(
        409,
        'PO_LINE_SKU_MISMATCH',
        'Purchase-order line SKU does not match the import invoice line SKU.',
      );
    }
    const duplicateRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `
        SELECT id
        FROM app.import_invoice_line
        WHERE purchase_order_line_id = $1::uuid
          AND id <> $2::uuid
        LIMIT 1
      `,
      purchaseOrderLineId,
      invoiceLineId,
    );
    if (duplicateRows.length > 0) {
      throw new ImportManagementServiceError(
        409,
        'PO_LINE_ALREADY_LINKED',
        'Purchase-order line is already linked to another import invoice line.',
      );
    }
  }

  await prisma.$executeRawUnsafe(
    `
      UPDATE app.import_invoice_line
      SET purchase_order_line_id = $2::uuid,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid
    `,
    invoiceLineId,
    purchaseOrderLineId,
  );
  await touchShipment(String(line.shipmentId));
  return getImportPurchaseOrderLinking(String(line.shipmentId));
}

async function resolveImportSku(
  client: SqlClient,
  input: LinkImportInvoiceLineToSkuInput,
): Promise<{ id: string; skuCode: string } | null> {
  const skuId = cleanString(input.skuId);
  const skuCode = cleanString(input.skuCode);
  if (!skuId && !skuCode) return null;

  if (skuId) {
    const rows = await client.$queryRawUnsafe<Array<{ id: string; skuCode: string }>>(
      `
        SELECT id::text, COALESCE(code, provisional_code) AS "skuCode"
        FROM app.sku
        WHERE id = $1::uuid
        LIMIT 1
      `,
      skuId,
    );
    const row = rows[0];
    if (!row) {
      throw new ImportManagementServiceError(404, 'SKU_NOT_FOUND', 'SKU was not found.');
    }
    if (skuCode && row.skuCode.toUpperCase() !== skuCode.toUpperCase()) {
      throw new ImportManagementServiceError(409, 'SKU_REFERENCE_MISMATCH', 'skuId and skuCode refer to different SKUs.');
    }
    return { id: String(row.id), skuCode: String(row.skuCode) };
  }

  const rows = await client.$queryRawUnsafe<Array<{ id: string; skuCode: string }>>(
    `
      SELECT id::text, COALESCE(code, provisional_code) AS "skuCode"
      FROM app.sku
      WHERE UPPER(COALESCE(code, '')) = UPPER($1)
         OR UPPER(COALESCE(provisional_code, '')) = UPPER($1)
      ORDER BY
        CASE WHEN UPPER(COALESCE(code, '')) = UPPER($1) THEN 0 ELSE 1 END,
        COALESCE(code, provisional_code) ASC
      LIMIT 2
    `,
    skuCode,
  );
  if (rows.length === 0) {
    throw new ImportManagementServiceError(404, 'SKU_NOT_FOUND', 'SKU code was not found.');
  }
  if (rows.length > 1 && String(rows[0].id) !== String(rows[1].id)) {
    throw new ImportManagementServiceError(409, 'AMBIGUOUS_SKU_CODE', 'SKU code matches more than one app SKU.');
  }
  return { id: String(rows[0].id), skuCode: String(rows[0].skuCode) };
}

export async function linkImportInvoiceLineToSku(
  invoiceLineId: string,
  input: LinkImportInvoiceLineToSkuInput,
): Promise<ImportPurchaseOrderLinkingEnvelope> {
  const lineRows = await prisma.$queryRawUnsafe<Array<{
    shipmentId: string;
    purchaseOrderLineId: string | null;
    purchaseOrderLineSkuId: string | null;
  }>>(
    `
      SELECT
        si.shipment_id AS "shipmentId",
        il.purchase_order_line_id AS "purchaseOrderLineId",
        pol.sku_id AS "purchaseOrderLineSkuId"
      FROM app.import_invoice_line il
      JOIN app.import_supplier_invoice si ON si.id = il.invoice_id
      LEFT JOIN app.purchase_order_line pol ON pol.id = il.purchase_order_line_id
      WHERE il.id = $1::uuid
      LIMIT 1
    `,
    invoiceLineId,
  );
  const line = lineRows[0];
  if (!line) {
    throw new ImportManagementServiceError(404, 'INVOICE_LINE_NOT_FOUND', 'Import invoice line not found.');
  }

  await assertInvoiceLineSuggestedPriceEditable(prisma, invoiceLineId);
  const sku = await resolveImportSku(prisma, input);
  if (!sku && line.purchaseOrderLineId) {
    throw new ImportManagementServiceError(
      409,
      'PO_LINE_STILL_LINKED',
      'Unlink the purchase-order line before clearing the import line SKU.',
    );
  }
  if (sku && line.purchaseOrderLineSkuId && String(line.purchaseOrderLineSkuId) !== sku.id) {
    throw new ImportManagementServiceError(
      409,
      'PO_LINE_SKU_MISMATCH',
      'Selected SKU does not match the linked purchase-order line SKU.',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `
        UPDATE app.import_invoice_line
        SET sku_id = $2::uuid,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      invoiceLineId,
      sku?.id ?? null,
    );
    await tx.$executeRawUnsafe(
      `
        UPDATE app.import_suggested_price
        SET sku_id = $2::uuid
        WHERE invoice_line_id = $1::uuid
      `,
      invoiceLineId,
      sku?.id ?? null,
    );
    await tx.$executeRawUnsafe(
      `UPDATE app.import_shipment SET updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
      String(line.shipmentId),
    );
  });

  return getImportPurchaseOrderLinking(String(line.shipmentId));
}

function receivingCostBasisForStatus(status: ImportShipmentStatus): ImportReceivingCostBasis | null {
  if (FINAL_LIQUIDATION_STATUSES.has(status)) return 'FINAL';
  if (['APPROVED_ESTIMATE', 'IN_TRANSIT', 'RECEIVING_ESTIMATED'].includes(status)) return 'ESTIMATED';
  return null;
}

function receivingBlockReason(
  shipmentStatus: ImportShipmentStatus,
  basis: ImportReceivingCostBasis | null,
  row: any,
  shipmentBlockReason: string | null = null,
): string | null {
  if (!basis) {
    return 'Shipment must have an approved estimate, be in transit, or be in final liquidation before receiving.';
  }
  if (shipmentStatus === 'CLOSED') {
    return 'Shipment is closed.';
  }
  if (shipmentBlockReason) {
    return shipmentBlockReason;
  }
  if (row.receiptPolicy && row.receiptPolicy !== 'RECEIVE_TO_STOCK') {
    return 'Import cost component lines are rolled into receiptable output lines.';
  }
  if (!row.skuId) {
    return 'Link the import line to a SKU or purchase-order line before receiving.';
  }
  if (row.landedUnitCostHnl == null) {
    return 'Allocate landed cost before receiving.';
  }
  if (!row.goodsInTransitRecordId) {
    return 'Build a goods-in-transit record before receiving.';
  }

  const transitStatus = row.transitStatus as GoodsInTransitStatus | null;
  if (transitStatus === 'CANCELLED') {
    return 'Goods-in-transit record is cancelled.';
  }
  if (transitStatus === 'CLOSED') {
    return 'Goods-in-transit record is closed.';
  }
  if (transitStatus === 'RECEIVED_FINAL') {
    return 'Line has already been received final.';
  }
  if (basis === 'ESTIMATED' && transitStatus === 'RECEIVING_ESTIMATED') {
    return 'Line has already been received estimated.';
  }
  if (!['OWNED', 'IN_TRANSIT', 'RECEIVING_ESTIMATED'].includes(transitStatus ?? '')) {
    return 'Goods-in-transit status must be owned or in transit before receiving.';
  }
  const willPostPurchaseOrderReceipt = row.purchaseOrderLineId && !(basis === 'FINAL' && transitStatus === 'RECEIVING_ESTIMATED');
  if (willPostPurchaseOrderReceipt) {
    if (!['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(String(row.purchaseOrderStatus ?? ''))) {
      return 'Linked purchase order must be confirmed or partially received before import receiving can post.';
    }
    const quantity = toNumber(row.quantity);
    if (!isWholeUnitQuantity(quantity)) {
      return 'Native purchase-order receipt posting requires whole-unit quantities.';
    }
  }
  const willPostDirectInventoryReceipt = !row.purchaseOrderLineId && !(basis === 'FINAL' && transitStatus === 'RECEIVING_ESTIMATED');
  if (willPostDirectInventoryReceipt && !isWholeUnitQuantity(toNumber(row.quantity))) {
    return 'Direct import inventory receipt posting requires whole-unit quantities.';
  }

  return null;
}

function mapImportReceivingHandoffLine(
  shipmentId: string,
  shipmentStatus: ImportShipmentStatus,
  basis: ImportReceivingCostBasis | null,
  row: any,
  shipmentBlockReason: string | null = null,
): ImportReceivingHandoffLine {
  const blockingReason = receivingBlockReason(shipmentStatus, basis, row, shipmentBlockReason);
  const canReceive = blockingReason == null;
  const quantity = toNumber(row.quantity);
  const landedUnitCostHnl = nullableNumber(row.landedUnitCostHnl);
  const costRole = mapCostRole(row.costRole);
  const receiptPolicy = mapReceiptPolicy(row.receiptPolicy, costRole);
  const receivingUnitCostHnl = basis && landedUnitCostHnl != null ? landedUnitCostHnl : null;
  const transitStatus = row.transitStatus ? (row.transitStatus as GoodsInTransitStatus) : null;
  return {
    shipmentId,
    invoiceLineId: row.invoiceLineId ? String(row.invoiceLineId) : String(row.shipmentLineId),
    shipmentLineId: row.shipmentLineId ? String(row.shipmentLineId) : null,
    purchaseOrderId: row.purchaseOrderId ? String(row.purchaseOrderId) : null,
    purchaseOrderLineId: row.purchaseOrderLineId ? String(row.purchaseOrderLineId) : null,
    purchaseOrderNumber: row.purchaseOrderNumber ?? null,
    purchaseOrderStatus: row.purchaseOrderStatus ?? null,
    skuId: row.skuId ? String(row.skuId) : null,
    itemCode: row.itemCode ?? null,
    styleCode: row.styleCode ?? null,
    description: row.description ?? null,
    quantity,
    unitOfMeasure: String(row.unitOfMeasure),
    sourceUnitCost: nullableNumber(row.sourceUnitCost),
    sourceCurrency: (row.sourceCurrency ?? 'HNL') as ImportSourceCurrency,
    fxRate: toNumber(row.fxRate ?? 1),
    fxDate: dateOnly(row.fxDate) ?? '',
    baseUnitCostHnl: toNumber(row.baseUnitCostHnl),
    commercialUnitCostHnl: nullableNumber(row.commercialUnitCostHnl),
    componentAllocatedCostHnl: toNumber(row.componentAllocatedCostHnl),
    allocatedLandedCostHnl: toNumber(row.allocatedLandedCostHnl),
    landedUnitCostHnl,
    costRole,
    receiptPolicy,
    allocationGroupKey: row.allocationGroupKey ?? null,
    receivingUnitCostHnl,
    receivingLineCostHnl: receivingUnitCostHnl == null ? null : round2(quantity * receivingUnitCostHnl),
    receivingCostBasis: basis,
    goodsInTransitRecordId: row.goodsInTransitRecordId ? String(row.goodsInTransitRecordId) : null,
    containerId: row.containerId ? String(row.containerId) : null,
    containerLabel: row.containerLabel ?? null,
    transitStatus,
    quantityInTransit: nullableNumber(row.quantityInTransit),
    expectedReceiptAt: dateOnly(row.expectedReceiptAt),
    receivedAt: dateOnly(row.receivedAt),
    canReceive,
    requiresAuditReason: basis === 'ESTIMATED',
    needsFinalTrueUp: basis === 'FINAL' && transitStatus === 'RECEIVING_ESTIMATED',
    blockingReason,
  };
}

function alreadyReceivedForBasis(line: ImportReceivingHandoffLine, basis: ImportReceivingCostBasis): boolean {
  return basis === 'ESTIMATED'
    ? line.transitStatus === 'RECEIVING_ESTIMATED' || line.transitStatus === 'RECEIVED_FINAL' || line.transitStatus === 'CLOSED'
    : line.transitStatus === 'RECEIVED_FINAL' || line.transitStatus === 'CLOSED';
}

function scopedReceivingHandoff(
  handoff: ImportReceivingHandoffEnvelope,
  lines: ImportReceivingHandoffLine[],
): ImportReceivingHandoffEnvelope {
  const readyLines = lines.filter((line) => line.canReceive);
  return {
    ...handoff,
    canReceive: readyLines.length > 0,
    lineCount: lines.length,
    readyLineCount: readyLines.length,
    blockedLineCount: lines.length - readyLines.length,
    trueUpLineCount: lines.filter((line) => line.needsFinalTrueUp).length,
    totalQuantity: round4(lines.reduce((sum, line) => sum + line.quantity, 0)),
    totalLandedHnl: round2(lines.reduce((sum, line) => sum + (line.receivingLineCostHnl ?? 0), 0)),
    readyLandedHnl: round2(readyLines.reduce((sum, line) => sum + (line.receivingLineCostHnl ?? 0), 0)),
    lines,
  };
}

function selectReceivingHandoff(
  handoff: ImportReceivingHandoffEnvelope,
  expectedBasis: ImportReceivingCostBasis,
  input: ReceiveImportShipmentInput,
): { handoff: ImportReceivingHandoffEnvelope; recordIds: string[]; noopRecordCount: number } {
  if (handoff.receivingCostBasis !== expectedBasis) {
    throw new ImportManagementServiceError(
      409,
      'INVALID_RECEIVING_BASIS',
      `Shipment is not ready for ${expectedBasis.toLowerCase()} receiving.`,
    );
  }
  if (handoff.lines.length === 0) {
    throw new ImportManagementServiceError(409, 'NO_RECEIVING_LINES', 'Shipment has no import lines to receive.');
  }

  const containerId = cleanString(input.containerId);
  const shipmentLineIds = new Set((input.shipmentLineIds ?? []).map(String));
  const goodsInTransitRecordIds = new Set((input.goodsInTransitRecordIds ?? []).map(String));
  const hasScope = Boolean(containerId) || shipmentLineIds.size > 0 || goodsInTransitRecordIds.size > 0;
  const scopedLines = hasScope
    ? handoff.lines.filter((line) => (
      (!containerId || line.containerId === containerId) &&
      (shipmentLineIds.size === 0 || (line.shipmentLineId != null && shipmentLineIds.has(line.shipmentLineId))) &&
      (goodsInTransitRecordIds.size === 0 || (line.goodsInTransitRecordId != null && goodsInTransitRecordIds.has(line.goodsInTransitRecordId)))
    ))
    : handoff.lines;

  if (scopedLines.length === 0) {
    throw new ImportManagementServiceError(409, 'NO_RECEIVING_LINES', 'No import receiving lines match the selected scope.');
  }

  const readyLines = scopedLines.filter((line) => line.canReceive);
  const alreadyReceivedLines = scopedLines.filter((line) => !line.canReceive && alreadyReceivedForBasis(line, expectedBasis));
  const blockedLines = scopedLines.filter((line) => !line.canReceive && !alreadyReceivedForBasis(line, expectedBasis));
  if (blockedLines.length > 0) {
    const firstBlocked = blockedLines[0];
    throw new ImportManagementServiceError(
      409,
      'RECEIVING_BLOCKED',
      firstBlocked?.blockingReason ?? 'Resolve blocked import lines before receiving.',
    );
  }
  const recordIds = readyLines
    .filter((line) => line.goodsInTransitRecordId)
    .map((line) => line.goodsInTransitRecordId as string);
  if (recordIds.length !== readyLines.length) {
    throw new ImportManagementServiceError(
      409,
      'RECEIVING_RECORDS_INCOMPLETE',
      'Every selected import line must have a goods-in-transit record before receiving.',
    );
  }
  return {
    handoff: scopedReceivingHandoff(handoff, readyLines),
    recordIds,
    noopRecordCount: alreadyReceivedLines.length,
  };
}

async function updateReceivingTransitRecords(
  client: SqlClient,
  recordIds: string[],
  status: GoodsInTransitStatus,
  receivedAt: string,
  auditReason: string | null,
): Promise<void> {
  if (recordIds.length === 0) return;
  const values: unknown[] = [status, receivedAt, auditReason, ...recordIds];
  const placeholders = recordIds.map((_, index) => `$${index + 4}::uuid`).join(', ');
  await client.$executeRawUnsafe(
    `
      UPDATE app.goods_in_transit_record
      SET status = $1,
          received_at = COALESCE(received_at, $2::date),
          audit_reason = COALESCE($3::text, audit_reason),
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
    `,
    ...values,
  );
}

interface ImportPoReceiptLineState {
  lineId: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  purchaseOrderStatus: string;
  skuId: string;
  quantityOrdered: number;
  quantityReceived: number;
}

interface ImportPoReceiptPostLine {
  handoffLine: ImportReceivingHandoffLine;
  poLine: ImportPoReceiptLineState;
  quantity: number;
  effectiveUnitCost: number;
}

interface ImportEstimatedReceiptLineState {
  invoiceLineId: string;
  poReceiptLineId: string | null;
  importInventoryReceiptId: string | null;
  storeId: number | null;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  effectiveUnitCost: number;
}

function parseImportReceiptStoreId(locationId?: string | null): number {
  const clean = cleanString(locationId);
  if (!clean) return 1;
  if (/^\d+$/.test(clean)) return Number(clean);
  const match = /^loc-(\d+)$/i.exec(clean);
  if (match) return Number(match[1]);
  throw new ImportManagementServiceError(404, 'LOCATION_NOT_FOUND', `Location ${clean} not found.`);
}

interface StockCostEventInput {
  stockMovementId: string | null;
  storeId: number;
  skuId: string;
  quantityDelta: number;
  valueDeltaHnl: number;
  unitCostHnl: number | null;
  valuationBasis: 'IMPORT_ESTIMATED' | 'IMPORT_FINAL' | 'IMPORT_TRUE_UP';
  sourceDocumentType: string;
  sourceDocumentId: string;
  postedBy: string;
  postedAt: string;
  idempotencyKey: string;
}

async function postStockCostEvent(client: SqlClient, input: StockCostEventInput): Promise<void> {
  const inserted = await client.$queryRawUnsafe<Array<{ id: string }>>(
    `
      INSERT INTO app.stock_cost_event (
        id, stock_movement_id, store_id, sku_id, quantity_delta, value_delta_hnl,
        unit_cost_hnl, valuation_basis, source_document_type, source_document_id,
        posted_by, posted_at, idempotency_key
      )
      VALUES (
        $1::uuid, $2::uuid, $3, $4::uuid, $5, $6,
        $7, $8, $9, $10,
        $11, $12::timestamptz, $13
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id::text
    `,
    uuidv4(),
    input.stockMovementId,
    input.storeId,
    input.skuId,
    input.quantityDelta,
    input.valueDeltaHnl,
    input.unitCostHnl,
    input.valuationBasis,
    input.sourceDocumentType,
    input.sourceDocumentId,
    input.postedBy,
    input.postedAt,
    input.idempotencyKey,
  );
  if (inserted.length === 0) return;

  await client.$executeRawUnsafe(
    `
      INSERT INTO app.stock_cost_balance (
        store_id, sku_id, quantity_on_hand, inventory_value_hnl, average_unit_cost_hnl
      )
      VALUES (
        $1, $2::uuid, $3, $4,
        CASE WHEN $3::numeric > 0 THEN ROUND($4::numeric / $3::numeric, 4) ELSE NULL END
      )
      ON CONFLICT (store_id, sku_id)
      DO UPDATE SET
        quantity_on_hand = app.stock_cost_balance.quantity_on_hand + EXCLUDED.quantity_on_hand,
        inventory_value_hnl = app.stock_cost_balance.inventory_value_hnl + EXCLUDED.inventory_value_hnl,
        average_unit_cost_hnl = CASE
          WHEN app.stock_cost_balance.quantity_on_hand + EXCLUDED.quantity_on_hand > 0
          THEN ROUND(
            (app.stock_cost_balance.inventory_value_hnl + EXCLUDED.inventory_value_hnl)
            / (app.stock_cost_balance.quantity_on_hand + EXCLUDED.quantity_on_hand),
            4
          )
          ELSE NULL
        END,
        updated_at = CURRENT_TIMESTAMP
    `,
    input.storeId,
    input.skuId,
    input.quantityDelta,
    input.valueDeltaHnl,
  );

  await client.$executeRawUnsafe(
    `
      UPDATE app.sku s
      SET current_cost = agg.average_unit_cost_hnl,
          updated_at = CURRENT_TIMESTAMP
      FROM (
        SELECT
          sku_id,
          CASE
            WHEN SUM(quantity_on_hand) > 0
            THEN ROUND(SUM(inventory_value_hnl) / SUM(quantity_on_hand), 2)
            ELSE NULL
          END AS average_unit_cost_hnl
        FROM app.stock_cost_balance
        WHERE sku_id = $1::uuid
        GROUP BY sku_id
      ) agg
      WHERE s.id = agg.sku_id
    `,
    input.skuId,
  );
}

function importPoReceiptLinesToPost(
  handoff: ImportReceivingHandoffEnvelope,
  basis: ImportReceivingCostBasis,
): ImportReceivingHandoffLine[] {
  return handoff.lines.filter((line) => (
    line.canReceive &&
    line.purchaseOrderLineId &&
    line.receivingUnitCostHnl != null &&
    !(basis === 'FINAL' && line.transitStatus === 'RECEIVING_ESTIMATED')
  ));
}

function receivingLineScopeHash(lines: ImportReceivingHandoffLine[]): string {
  const scope = lines
    .map((line) => line.goodsInTransitRecordId ?? importHandoffAuditReference(line))
    .sort()
    .join('|');
  return createHash('sha256').update(scope).digest('hex').slice(0, 16);
}

async function loadImportPoReceiptLineStates(
  client: SqlClient,
  purchaseOrderLineIds: string[],
): Promise<Map<string, ImportPoReceiptLineState>> {
  if (purchaseOrderLineIds.length === 0) return new Map();
  const placeholders = purchaseOrderLineIds.map((_, index) => `$${index + 1}::uuid`).join(', ');
  const rows = await client.$queryRawUnsafe<any[]>(
    `
      SELECT
        pol.id::text AS "lineId",
        pol.po_id::text AS "purchaseOrderId",
        po.po_number AS "purchaseOrderNumber",
        po.status AS "purchaseOrderStatus",
        pol.sku_id::text AS "skuId",
        pol.quantity_ordered AS "quantityOrdered",
        pol.quantity_received AS "quantityReceived"
      FROM app.purchase_order_line pol
      JOIN app.purchase_order po ON po.id = pol.po_id
      WHERE pol.id IN (${placeholders})
      FOR UPDATE OF pol, po
    `,
    ...purchaseOrderLineIds,
  );
  return new Map(rows.map((row) => [String(row.lineId), {
    lineId: String(row.lineId),
    purchaseOrderId: String(row.purchaseOrderId),
    purchaseOrderNumber: String(row.purchaseOrderNumber),
    purchaseOrderStatus: String(row.purchaseOrderStatus),
    skuId: String(row.skuId),
    quantityOrdered: toNumber(row.quantityOrdered),
    quantityReceived: toNumber(row.quantityReceived),
  }]));
}

async function existingImportPoReceiptId(
  client: SqlClient,
  idempotencyKey: string,
): Promise<string | null> {
  const rows = await client.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id::text FROM app.po_receipt WHERE idempotency_key = $1 LIMIT 1`,
    idempotencyKey,
  );
  return rows[0]?.id ? String(rows[0].id) : null;
}

async function updatePurchaseOrderStatusAfterImportReceipt(
  client: SqlClient,
  purchaseOrderId: string,
  previousStatus: string,
  changedBy: string,
  reason: string,
): Promise<void> {
  const rows = await client.$queryRawUnsafe<Array<{ fullyReceived: boolean }>>(
    `
      SELECT BOOL_AND(quantity_received >= quantity_ordered) AS "fullyReceived"
      FROM app.purchase_order_line
      WHERE po_id = $1::uuid
    `,
    purchaseOrderId,
  );
  const newStatus = rows[0]?.fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
  await client.$executeRawUnsafe(
    `UPDATE app.purchase_order SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid`,
    newStatus,
    purchaseOrderId,
  );
  await client.$executeRawUnsafe(
    `
      INSERT INTO app.po_status_history (
        id, po_id, from_status, to_status, changed_by, reason
      ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
    `,
    uuidv4(),
    purchaseOrderId,
    previousStatus,
    newStatus,
    changedBy,
    reason,
  );
}

async function postImportPurchaseOrderReceipts(
  client: SqlClient,
  handoff: ImportReceivingHandoffEnvelope,
  basis: ImportReceivingCostBasis,
  receivedAt: string,
  changedBy: string,
  locationId: string | null | undefined,
  auditReason: string | null,
): Promise<ImportPostedPurchaseOrderReceipt[]> {
  const linesToPost = importPoReceiptLinesToPost(handoff, basis);
  if (linesToPost.length === 0) return [];

  const storeId = parseImportReceiptStoreId(locationId);
  const poLineStates = await loadImportPoReceiptLineStates(
    client,
    linesToPost.map((line) => line.purchaseOrderLineId as string),
  );

  const postLines: ImportPoReceiptPostLine[] = [];
  for (const handoffLine of linesToPost) {
    const poLine = poLineStates.get(handoffLine.purchaseOrderLineId as string);
    if (!poLine) {
      throw new ImportManagementServiceError(404, 'PO_LINE_NOT_FOUND', 'Linked purchase-order line not found.');
    }
    if (!['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(poLine.purchaseOrderStatus)) {
      throw new ImportManagementServiceError(
        409,
        'PO_NOT_RECEIVABLE',
        `Purchase order ${poLine.purchaseOrderNumber} must be confirmed before import receiving can post.`,
      );
    }
    const quantity = Math.round(handoffLine.quantity);
    if (quantity <= 0 || !isWholeUnitQuantity(handoffLine.quantity)) {
      throw new ImportManagementServiceError(
        422,
        'INVALID_RECEIPT_QUANTITY',
        'Import purchase-order receipt quantities must be whole positive units.',
      );
    }
    const remainingQuantity = poLine.quantityOrdered - poLine.quantityReceived;
    if (quantity > remainingQuantity) {
      throw new ImportManagementServiceError(
        409,
        'QUANTITY_EXCEEDS_ORDERED',
        `Import line quantity exceeds remaining ordered quantity for PO line ${poLine.lineId}.`,
      );
    }
    postLines.push({
      handoffLine,
      poLine,
      quantity,
      effectiveUnitCost: round2(handoffLine.receivingUnitCostHnl ?? 0),
    });
  }

  const byPo = new Map<string, ImportPoReceiptPostLine[]>();
  for (const line of postLines) {
    const arr = byPo.get(line.poLine.purchaseOrderId) ?? [];
    arr.push(line);
    byPo.set(line.poLine.purchaseOrderId, arr);
  }

  const receipts: ImportPostedPurchaseOrderReceipt[] = [];
  for (const [purchaseOrderId, groupLines] of byPo) {
    const first = groupLines[0];
    if (!first) continue;
    const idempotencyKey = `import:${handoff.shipmentId}:${basis}:${purchaseOrderId}:${receivingLineScopeHash(groupLines.map((line) => line.handoffLine))}`;
    const existingReceiptId = await existingImportPoReceiptId(client, idempotencyKey);
    if (existingReceiptId) {
      continue;
    }
    const receiptId = uuidv4();
    const referenceNumber = `${handoff.shipmentNumber} ${basis.toLowerCase()} import receipt`;
    await client.$executeRawUnsafe(
      `
        INSERT INTO app.po_receipt (
          id, po_id, received_at_store_id, received_by, reference_number, idempotency_key, mode,
          discount_percent, freight_each, received_at
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'IMPORT', 0, 0, $7::timestamptz)
      `,
      receiptId,
      purchaseOrderId,
      storeId,
      changedBy,
      referenceNumber,
      idempotencyKey,
      receivedAt,
    );

    let postedQuantity = 0;
    let postedHnlAmount = 0;
    for (const line of groupLines) {
      const nextQuantityReceived = line.poLine.quantityReceived + line.quantity;
      await client.$executeRawUnsafe(
        `
          UPDATE app.purchase_order_line
          SET quantity_received = $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2::uuid
        `,
        nextQuantityReceived,
        line.poLine.lineId,
      );

      const movementId = uuidv4();
      await client.$executeRawUnsafe(
        `
          INSERT INTO app.stock_movement (
            id, store_id, sku_id, column_label, row_label, movement_type,
            quantity_delta, unit_cost_snapshot, source_document_type,
            source_document_id, reason_code, comment, performed_by, movement_at,
            idempotency_key
          ) VALUES (
            $1::uuid, $2, $3::uuid, '', '', 'PO_RECEIPT',
            $4, $5::numeric, 'PO_RECEIPT',
            $6::uuid, NULL, $7, $8, $9::timestamptz,
            $10
          )
        `,
        movementId,
        storeId,
        line.poLine.skuId,
        line.quantity,
        line.effectiveUnitCost,
        receiptId,
        auditReason ?? referenceNumber,
        changedBy,
        receivedAt,
        `${idempotencyKey}:${line.poLine.lineId}`,
      );

      await client.$executeRawUnsafe(
        `
          INSERT INTO app.stock_level (
            id, store_id, sku_id, column_label, row_label, on_hand, reserved,
            last_received_at, last_movement_at, version, updated_at
          ) VALUES ($1::uuid, $2, $3::uuid, '', '', $4, 0, $5::timestamptz, $5::timestamptz, 1, CURRENT_TIMESTAMP)
          ON CONFLICT (store_id, sku_id, column_label, row_label)
          DO UPDATE SET
            on_hand = app.stock_level.on_hand + EXCLUDED.on_hand,
            last_received_at = EXCLUDED.last_received_at,
            last_movement_at = EXCLUDED.last_movement_at,
            version = app.stock_level.version + 1,
            updated_at = CURRENT_TIMESTAMP
        `,
        uuidv4(),
        storeId,
        line.poLine.skuId,
        line.quantity,
        receivedAt,
      );

      await postStockCostEvent(client, {
        stockMovementId: movementId,
        storeId,
        skuId: line.poLine.skuId,
        quantityDelta: line.quantity,
        valueDeltaHnl: round2(line.quantity * line.effectiveUnitCost),
        unitCostHnl: line.effectiveUnitCost,
        valuationBasis: basis === 'ESTIMATED' ? 'IMPORT_ESTIMATED' : 'IMPORT_FINAL',
        sourceDocumentType: 'PO_RECEIPT',
        sourceDocumentId: receiptId,
        postedBy: changedBy,
        postedAt: receivedAt,
        idempotencyKey: `${idempotencyKey}:${line.poLine.lineId}:cost`,
      });

      await client.$executeRawUnsafe(
        `
          INSERT INTO app.po_receipt_line (
            id, receipt_id, po_line_id, sku_id, column_label, row_label,
            quantity_received, effective_unit_cost, discrepancy_reason,
            audit_reference, movement_id, import_shipment_id, import_invoice_line_id,
            import_shipment_line_id, landed_cost_basis, commercial_unit_cost_hnl,
            allocated_landed_cost_hnl, landed_unit_cost_hnl
          ) VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4::uuid, '', '',
            $5, $6::numeric, NULL, $7, $8::uuid, $9::uuid, $10::uuid,
            $11::uuid, $12, $13::numeric,
            $14::numeric, $15::numeric
          )
        `,
        uuidv4(),
        receiptId,
        line.poLine.lineId,
        line.poLine.skuId,
        line.quantity,
        line.effectiveUnitCost,
        line.handoffLine.shipmentLineId ?? line.handoffLine.invoiceLineId,
        movementId,
        handoff.shipmentId,
        line.handoffLine.invoiceLineId,
        line.handoffLine.shipmentLineId,
        basis,
        line.handoffLine.commercialUnitCostHnl,
        line.handoffLine.allocatedLandedCostHnl,
        line.handoffLine.landedUnitCostHnl,
      );
      postedQuantity += line.quantity;
      postedHnlAmount = round2(postedHnlAmount + (line.quantity * line.effectiveUnitCost));
      line.poLine.quantityReceived = nextQuantityReceived;
    }

    await updatePurchaseOrderStatusAfterImportReceipt(
      client,
      purchaseOrderId,
      first.poLine.purchaseOrderStatus,
      changedBy,
      referenceNumber,
    );
    receipts.push({
      purchaseOrderId,
      purchaseOrderNumber: first.poLine.purchaseOrderNumber,
      receiptId,
      postedLineCount: groupLines.length,
      postedQuantity,
      postedHnlAmount,
    });
  }

  return receipts;
}

function directImportInventoryReceiptLinesToPost(
  handoff: ImportReceivingHandoffEnvelope,
  basis: ImportReceivingCostBasis,
): ImportReceivingHandoffLine[] {
  return handoff.lines.filter((line) => (
    line.canReceive &&
    !line.shipmentLineId &&
    !line.purchaseOrderLineId &&
    line.skuId &&
    line.receivingUnitCostHnl != null &&
    !(basis === 'FINAL' && line.transitStatus === 'RECEIVING_ESTIMATED')
  ));
}

function importHandoffAuditReference(line: ImportReceivingHandoffLine): string {
  return line.shipmentLineId ?? line.invoiceLineId;
}

async function loadExistingDirectImportInventoryReceipts(
  client: SqlClient,
  shipmentId: string,
  basis: ImportReceivingCostBasis,
  invoiceLineIds: string[],
): Promise<Set<string>> {
  if (invoiceLineIds.length === 0) return new Set();
  const placeholders = invoiceLineIds.map((_, index) => `$${index + 3}`).join(', ');
  const rows = await client.$queryRawUnsafe<Array<{ invoiceLineId: string }>>(
    `
      SELECT invoice_line_id::text AS "invoiceLineId"
      FROM app.import_inventory_receipt
      WHERE shipment_id = $1::uuid
        AND receipt_basis = $2
        AND invoice_line_id IN (${placeholders})
    `,
    shipmentId,
    basis,
    ...invoiceLineIds,
  );
  return new Set(rows.map((row) => String(row.invoiceLineId)));
}

async function postDirectImportInventoryReceipts(
  client: SqlClient,
  handoff: ImportReceivingHandoffEnvelope,
  basis: ImportReceivingCostBasis,
  receivedAt: string,
  changedBy: string,
  locationId: string | null | undefined,
  auditReason: string | null,
): Promise<ImportPostedInventoryReceipt[]> {
  const linesToPost = directImportInventoryReceiptLinesToPost(handoff, basis);
  if (linesToPost.length === 0) return [];

  const storeId = parseImportReceiptStoreId(locationId);
  const existingReceipts = await loadExistingDirectImportInventoryReceipts(
    client,
    handoff.shipmentId,
    basis,
    linesToPost.map((line) => line.invoiceLineId),
  );
  const receipts: ImportPostedInventoryReceipt[] = [];

  for (const line of linesToPost) {
    if (existingReceipts.has(line.invoiceLineId)) continue;
    const quantity = Math.round(line.quantity);
    if (quantity <= 0 || !isWholeUnitQuantity(line.quantity)) {
      throw new ImportManagementServiceError(
        422,
        'INVALID_RECEIPT_QUANTITY',
        'Direct import inventory receipt quantities must be whole positive units.',
      );
    }
    const unitCostHnl = round4(line.receivingUnitCostHnl ?? 0);
    const hnlAmount = round2(quantity * unitCostHnl);
    const receiptId = uuidv4();
    const movementId = uuidv4();
    const idempotencyKey = `import:inventory-receipt:${handoff.shipmentId}:${basis}:${line.invoiceLineId}`;
    const comment = `${handoff.shipmentNumber} ${basis.toLowerCase()} direct import inventory receipt`;

    await client.$executeRawUnsafe(
      `
        INSERT INTO app.stock_movement (
          id, store_id, sku_id, column_label, row_label, movement_type,
          quantity_delta, unit_cost_snapshot, source_document_type,
          source_document_id, reason_code, comment, performed_by, movement_at,
          idempotency_key
        ) VALUES (
          $1::uuid, $2, $3::uuid, '', '', 'IMPORT_RECEIPT',
          $4, $5::numeric, 'IMPORT_RECEIPT',
          $6, $7, $8, $9, $10::timestamptz,
          $11
        )
      `,
      movementId,
      storeId,
      line.skuId,
      quantity,
      unitCostHnl,
      receiptId,
      basis === 'ESTIMATED' ? 'IMPORT_ESTIMATED_RECEIPT' : 'IMPORT_FINAL_RECEIPT',
      auditReason ?? comment,
      changedBy,
      receivedAt,
      idempotencyKey,
    );

    await client.$executeRawUnsafe(
      `
        INSERT INTO app.stock_level (
          id, store_id, sku_id, column_label, row_label, on_hand, reserved,
          last_received_at, last_movement_at, version, updated_at
        ) VALUES ($1::uuid, $2, $3::uuid, '', '', $4, 0, $5::timestamptz, $5::timestamptz, 1, CURRENT_TIMESTAMP)
        ON CONFLICT (store_id, sku_id, column_label, row_label)
        DO UPDATE SET
          on_hand = app.stock_level.on_hand + EXCLUDED.on_hand,
          last_received_at = EXCLUDED.last_received_at,
          last_movement_at = EXCLUDED.last_movement_at,
          version = app.stock_level.version + 1,
          updated_at = CURRENT_TIMESTAMP
      `,
      uuidv4(),
      storeId,
      line.skuId,
      quantity,
      receivedAt,
    );

    await postStockCostEvent(client, {
      stockMovementId: movementId,
      storeId,
      skuId: line.skuId as string,
      quantityDelta: quantity,
      valueDeltaHnl: hnlAmount,
      unitCostHnl,
      valuationBasis: basis === 'ESTIMATED' ? 'IMPORT_ESTIMATED' : 'IMPORT_FINAL',
      sourceDocumentType: 'IMPORT_RECEIPT',
      sourceDocumentId: receiptId,
      postedBy: changedBy,
      postedAt: receivedAt,
      idempotencyKey: `${idempotencyKey}:cost`,
    });

    await client.$executeRawUnsafe(
      `
        INSERT INTO app.import_inventory_receipt (
          id, shipment_id, invoice_line_id, goods_in_transit_record_id,
          stock_movement_id, sku_id, store_id, receipt_basis, quantity,
          unit_cost_hnl, hnl_amount, posted_by, audit_reason, posted_at
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid,
          $5::uuid, $6::uuid, $7, $8, $9::numeric,
          $10::numeric, $11::numeric, $12, $13, $14::timestamptz
        )
      `,
      receiptId,
      handoff.shipmentId,
      line.invoiceLineId,
      line.goodsInTransitRecordId,
      movementId,
      line.skuId,
      storeId,
      basis,
      quantity,
      unitCostHnl,
      hnlAmount,
      changedBy,
      auditReason,
      receivedAt,
    );

    receipts.push({
      receiptId,
      invoiceLineId: line.invoiceLineId,
      stockMovementId: movementId,
      skuId: line.skuId as string,
      storeId,
      receiptBasis: basis,
      quantity,
      unitCostHnl,
      hnlAmount,
    });
  }

  return receipts;
}

function importInventoryTrueUpLinesToPost(
  handoff: ImportReceivingHandoffEnvelope,
): ImportReceivingHandoffLine[] {
  return handoff.lines.filter((line) => (
    line.canReceive &&
    line.needsFinalTrueUp &&
    !(line.shipmentLineId && line.invoiceLineId === line.shipmentLineId) &&
    line.skuId &&
    line.receivingUnitCostHnl != null
  ));
}

async function loadEstimatedImportReceiptLineStates(
  client: SqlClient,
  shipmentId: string,
  invoiceLineIds: string[],
): Promise<Map<string, ImportEstimatedReceiptLineState>> {
  if (invoiceLineIds.length === 0) return new Map();
  const placeholders = invoiceLineIds.map((_, index) => `$${index + 2}`).join(', ');
  const rows = await client.$queryRawUnsafe<any[]>(
    `
      SELECT
        prl.audit_reference AS "invoiceLineId",
        prl.id::text AS "poReceiptLineId",
        NULL::text AS "importInventoryReceiptId",
        pr.received_at_store_id AS "storeId",
        pr.po_id::text AS "purchaseOrderId",
        po.po_number AS "purchaseOrderNumber",
        prl.effective_unit_cost AS "effectiveUnitCost"
      FROM app.po_receipt_line prl
      JOIN app.po_receipt pr ON pr.id = prl.receipt_id
      JOIN app.purchase_order po ON po.id = pr.po_id
      WHERE pr.idempotency_key LIKE $1
        AND prl.audit_reference IN (${placeholders})
      ORDER BY pr.created_at DESC
    `,
    `import:${shipmentId}:ESTIMATED:%`,
    ...invoiceLineIds,
  );

  const byInvoiceLine = new Map<string, ImportEstimatedReceiptLineState>();
  for (const row of rows) {
    const invoiceLineId = String(row.invoiceLineId);
    if (byInvoiceLine.has(invoiceLineId)) continue;
    byInvoiceLine.set(invoiceLineId, {
      invoiceLineId,
      poReceiptLineId: row.poReceiptLineId ? String(row.poReceiptLineId) : null,
      importInventoryReceiptId: null,
      storeId: row.storeId == null ? null : Number(row.storeId),
      purchaseOrderId: row.purchaseOrderId ? String(row.purchaseOrderId) : null,
      purchaseOrderNumber: row.purchaseOrderNumber ? String(row.purchaseOrderNumber) : null,
      effectiveUnitCost: toNumber(row.effectiveUnitCost),
    });
  }

  const directRows = await client.$queryRawUnsafe<any[]>(
    `
      SELECT
        invoice_line_id::text AS "invoiceLineId",
        NULL::text AS "poReceiptLineId",
        id::text AS "importInventoryReceiptId",
        store_id AS "storeId",
        NULL::text AS "purchaseOrderId",
        NULL::text AS "purchaseOrderNumber",
        unit_cost_hnl AS "effectiveUnitCost"
      FROM app.import_inventory_receipt
      WHERE shipment_id = $1::uuid
        AND receipt_basis = 'ESTIMATED'
        AND invoice_line_id IN (${placeholders})
      ORDER BY posted_at DESC
    `,
    shipmentId,
    ...invoiceLineIds,
  );

  for (const row of directRows) {
    const invoiceLineId = String(row.invoiceLineId);
    if (byInvoiceLine.has(invoiceLineId)) continue;
    byInvoiceLine.set(invoiceLineId, {
      invoiceLineId,
      poReceiptLineId: null,
      importInventoryReceiptId: row.importInventoryReceiptId ? String(row.importInventoryReceiptId) : null,
      storeId: row.storeId == null ? null : Number(row.storeId),
      purchaseOrderId: null,
      purchaseOrderNumber: null,
      effectiveUnitCost: toNumber(row.effectiveUnitCost),
    });
  }
  return byInvoiceLine;
}

async function loadExistingImportInventoryTrueUps(
  client: SqlClient,
  shipmentId: string,
  invoiceLineIds: string[],
): Promise<Set<string>> {
  if (invoiceLineIds.length === 0) return new Set();
  const placeholders = invoiceLineIds.map((_, index) => `$${index + 2}`).join(', ');
  const rows = await client.$queryRawUnsafe<Array<{ invoiceLineId: string }>>(
    `
      SELECT invoice_line_id::text AS "invoiceLineId"
      FROM app.import_inventory_true_up
      WHERE shipment_id = $1::uuid
        AND invoice_line_id IN (${placeholders})
    `,
    shipmentId,
    ...invoiceLineIds,
  );
  return new Set(rows.map((row) => String(row.invoiceLineId)));
}

async function postImportInventoryTrueUps(
  client: SqlClient,
  handoff: ImportReceivingHandoffEnvelope,
  receivedAt: string,
  changedBy: string,
  auditReason: string | null,
): Promise<ImportPostedInventoryTrueUp[]> {
  const linesToPost = importInventoryTrueUpLinesToPost(handoff);
  if (linesToPost.length === 0) return [];

  const auditReferences = linesToPost.map(importHandoffAuditReference);
  const invoiceLineIds = linesToPost.map((line) => line.invoiceLineId);
  const estimatedReceiptLines = await loadEstimatedImportReceiptLineStates(client, handoff.shipmentId, auditReferences);
  const existingTrueUps = await loadExistingImportInventoryTrueUps(client, handoff.shipmentId, invoiceLineIds);
  const trueUps: ImportPostedInventoryTrueUp[] = [];

  for (const line of linesToPost) {
    if (existingTrueUps.has(line.invoiceLineId)) continue;
    const estimatedReceiptLine = estimatedReceiptLines.get(importHandoffAuditReference(line));
    if (!estimatedReceiptLine) {
      throw new ImportManagementServiceError(
        409,
        'ESTIMATED_RECEIPT_NOT_FOUND',
        'Final import true-up requires the estimated receipt created during estimated receiving.',
      );
    }
    const quantity = round4(line.quantity);
    const finalUnitCostHnl = round4(line.receivingUnitCostHnl ?? 0);
    const estimatedUnitCostHnl = round4(estimatedReceiptLine.effectiveUnitCost);
    const trueUp = calculateImportInventoryTrueUp({ quantity, estimatedUnitCostHnl, finalUnitCostHnl });
    if (!trueUp.hasAdjustment) continue;

    const trueUpId = uuidv4();
    const movementId = uuidv4();
    const storeId = estimatedReceiptLine.storeId ?? 1;
    const comment = [
      `Import final landed-cost true-up for ${handoff.shipmentNumber}.`,
      `Estimated ${estimatedUnitCostHnl.toFixed(4)} HNL, final ${finalUnitCostHnl.toFixed(4)} HNL.`,
      `Delta ${trueUp.deltaHnlAmount.toFixed(2)} HNL.`,
    ].join(' ');

    await client.$executeRawUnsafe(
      `
        INSERT INTO app.stock_movement (
          id, store_id, sku_id, column_label, row_label, movement_type,
          quantity_delta, unit_cost_snapshot, source_document_type,
          source_document_id, reason_code, comment, performed_by, movement_at,
          idempotency_key
        ) VALUES (
          $1::uuid, $2, $3::uuid, '', '', 'IMPORT_COST_TRUE_UP',
          0, $4::numeric, 'IMPORT_COST_TRUE_UP',
          $5, 'IMPORT_FINAL_COST_TRUE_UP', $6, $7, $8::timestamptz,
          $9
        )
      `,
      movementId,
      storeId,
      line.skuId,
      finalUnitCostHnl,
      trueUpId,
      comment,
      changedBy,
      receivedAt,
      `import:true-up:${handoff.shipmentId}:${line.invoiceLineId}`,
    );

    await postStockCostEvent(client, {
      stockMovementId: movementId,
      storeId,
      skuId: line.skuId as string,
      quantityDelta: 0,
      valueDeltaHnl: trueUp.deltaHnlAmount,
      unitCostHnl: finalUnitCostHnl,
      valuationBasis: 'IMPORT_TRUE_UP',
      sourceDocumentType: 'IMPORT_COST_TRUE_UP',
      sourceDocumentId: trueUpId,
      postedBy: changedBy,
      postedAt: receivedAt,
      idempotencyKey: `import:true-up:${handoff.shipmentId}:${line.invoiceLineId}:cost`,
    });

    await client.$executeRawUnsafe(
      `
        INSERT INTO app.import_inventory_true_up (
          id, shipment_id, invoice_line_id, goods_in_transit_record_id,
          purchase_order_id, purchase_order_line_id, po_receipt_line_id, import_inventory_receipt_id,
          stock_movement_id, sku_id, store_id, quantity, estimated_unit_cost_hnl,
          final_unit_cost_hnl, delta_unit_cost_hnl, delta_hnl_amount,
          posted_by, audit_reason, posted_at
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid,
          $5::uuid, $6::uuid, $7::uuid, $8::uuid,
          $9::uuid, $10::uuid, $11, $12::numeric, $13::numeric,
          $14::numeric, $15::numeric, $16::numeric,
          $17, $18, $19::timestamptz
        )
      `,
      trueUpId,
      handoff.shipmentId,
      line.invoiceLineId,
      line.goodsInTransitRecordId,
      line.purchaseOrderId,
      line.purchaseOrderLineId,
      estimatedReceiptLine.poReceiptLineId,
      estimatedReceiptLine.importInventoryReceiptId,
      movementId,
      line.skuId,
      storeId,
      quantity,
      estimatedUnitCostHnl,
      finalUnitCostHnl,
      trueUp.deltaUnitCostHnl,
      trueUp.deltaHnlAmount,
      changedBy,
      auditReason,
      receivedAt,
    );

    trueUps.push({
      trueUpId,
      invoiceLineId: line.invoiceLineId,
      purchaseOrderId: line.purchaseOrderId,
      purchaseOrderLineId: line.purchaseOrderLineId,
      purchaseOrderNumber: estimatedReceiptLine.purchaseOrderNumber,
      stockMovementId: movementId,
      skuId: line.skuId as string,
      storeId,
      quantity,
      estimatedUnitCostHnl,
      finalUnitCostHnl,
      deltaUnitCostHnl: trueUp.deltaUnitCostHnl,
      deltaHnlAmount: trueUp.deltaHnlAmount,
      importInventoryReceiptId: estimatedReceiptLine.importInventoryReceiptId,
    });
  }

  return trueUps;
}

function nullableReceivingCostBasis(value: unknown): ImportReceivingCostBasis | null {
  return value === 'ESTIMATED' || value === 'FINAL' ? value : null;
}

async function getImportReceivingAuditSummary(shipmentId: string): Promise<ImportReceivingAuditSummary> {
  const poReceiptRows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        pr.id::text AS "receiptId",
        pr.po_id::text AS "purchaseOrderId",
        po.po_number AS "purchaseOrderNumber",
        CASE split_part(COALESCE(pr.idempotency_key, ''), ':', 3)
          WHEN 'ESTIMATED' THEN 'ESTIMATED'
          WHEN 'FINAL' THEN 'FINAL'
          ELSE NULL
        END AS "receiptBasis",
        pr.received_at_store_id AS "storeId",
        pr.reference_number AS "referenceNumber",
        pr.received_by AS "postedBy",
        pr.received_at AS "postedAt",
        COUNT(prl.id)::int AS "postedLineCount",
        COALESCE(SUM(prl.quantity_received), 0) AS "postedQuantity",
        COALESCE(SUM(prl.quantity_received * prl.effective_unit_cost), 0) AS "postedHnlAmount"
      FROM app.po_receipt pr
      JOIN app.purchase_order po ON po.id = pr.po_id
      LEFT JOIN app.po_receipt_line prl ON prl.receipt_id = pr.id
      WHERE pr.idempotency_key LIKE $1
      GROUP BY
        pr.id, pr.po_id, po.po_number, pr.idempotency_key, pr.received_at_store_id,
        pr.reference_number, pr.received_by, pr.received_at, pr.created_at
      ORDER BY pr.received_at DESC, pr.created_at DESC
    `,
    `import:${shipmentId}:%`,
  );

  const inventoryReceiptRows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        ir.id::text AS "receiptId",
        ir.invoice_line_id::text AS "invoiceLineId",
        ir.stock_movement_id::text AS "stockMovementId",
        ir.sku_id::text AS "skuId",
        ir.store_id AS "storeId",
        ir.receipt_basis AS "receiptBasis",
        ir.quantity,
        ir.unit_cost_hnl AS "unitCostHnl",
        ir.hnl_amount AS "hnlAmount",
        il.item_code AS "itemCode",
        il.description,
        ir.posted_by AS "postedBy",
        ir.audit_reason AS "auditReason",
        ir.posted_at AS "postedAt"
      FROM app.import_inventory_receipt ir
      JOIN app.import_invoice_line il ON il.id = ir.invoice_line_id
      WHERE ir.shipment_id = $1::uuid
      ORDER BY ir.posted_at DESC, ir.id DESC
    `,
    shipmentId,
  );

  const trueUpRows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        tu.id::text AS "trueUpId",
        tu.invoice_line_id::text AS "invoiceLineId",
        tu.import_inventory_receipt_id::text AS "importInventoryReceiptId",
        tu.purchase_order_id::text AS "purchaseOrderId",
        tu.purchase_order_line_id::text AS "purchaseOrderLineId",
        po.po_number AS "purchaseOrderNumber",
        tu.stock_movement_id::text AS "stockMovementId",
        tu.sku_id::text AS "skuId",
        tu.store_id AS "storeId",
        tu.quantity,
        tu.estimated_unit_cost_hnl AS "estimatedUnitCostHnl",
        tu.final_unit_cost_hnl AS "finalUnitCostHnl",
        tu.delta_unit_cost_hnl AS "deltaUnitCostHnl",
        tu.delta_hnl_amount AS "deltaHnlAmount",
        il.item_code AS "itemCode",
        il.description,
        tu.posted_by AS "postedBy",
        tu.audit_reason AS "auditReason",
        tu.posted_at AS "postedAt"
      FROM app.import_inventory_true_up tu
      JOIN app.import_invoice_line il ON il.id = tu.invoice_line_id
      LEFT JOIN app.purchase_order po ON po.id = tu.purchase_order_id
      WHERE tu.shipment_id = $1::uuid
      ORDER BY tu.posted_at DESC, tu.id DESC
    `,
    shipmentId,
  );

  const purchaseOrderReceipts: ImportReceivingPurchaseOrderReceiptAuditRecord[] = poReceiptRows.map((row) => ({
    purchaseOrderId: String(row.purchaseOrderId),
    purchaseOrderNumber: String(row.purchaseOrderNumber),
    receiptId: String(row.receiptId),
    receiptBasis: nullableReceivingCostBasis(row.receiptBasis),
    storeId: row.storeId == null ? null : Number(row.storeId),
    referenceNumber: row.referenceNumber ?? null,
    postedBy: String(row.postedBy),
    postedAt: dateTime(row.postedAt),
    postedLineCount: toNumber(row.postedLineCount),
    postedQuantity: toNumber(row.postedQuantity),
    postedHnlAmount: round2(toNumber(row.postedHnlAmount)),
  }));

  const inventoryReceipts: ImportReceivingInventoryReceiptAuditRecord[] = inventoryReceiptRows.map((row) => ({
    receiptId: String(row.receiptId),
    invoiceLineId: String(row.invoiceLineId),
    stockMovementId: String(row.stockMovementId),
    skuId: String(row.skuId),
    storeId: Number(row.storeId),
    receiptBasis: nullableReceivingCostBasis(row.receiptBasis) ?? 'FINAL',
    quantity: round4(toNumber(row.quantity)),
    unitCostHnl: round4(toNumber(row.unitCostHnl)),
    hnlAmount: round2(toNumber(row.hnlAmount)),
    itemCode: row.itemCode ?? null,
    description: row.description ?? null,
    postedBy: String(row.postedBy),
    auditReason: row.auditReason ?? null,
    postedAt: dateTime(row.postedAt),
  }));

  const inventoryTrueUps: ImportReceivingInventoryTrueUpAuditRecord[] = trueUpRows.map((row) => ({
    trueUpId: String(row.trueUpId),
    invoiceLineId: String(row.invoiceLineId),
    importInventoryReceiptId: row.importInventoryReceiptId ? String(row.importInventoryReceiptId) : null,
    purchaseOrderId: row.purchaseOrderId ? String(row.purchaseOrderId) : null,
    purchaseOrderLineId: row.purchaseOrderLineId ? String(row.purchaseOrderLineId) : null,
    purchaseOrderNumber: row.purchaseOrderNumber ?? null,
    stockMovementId: String(row.stockMovementId),
    skuId: String(row.skuId),
    storeId: Number(row.storeId),
    quantity: round4(toNumber(row.quantity)),
    estimatedUnitCostHnl: round4(toNumber(row.estimatedUnitCostHnl)),
    finalUnitCostHnl: round4(toNumber(row.finalUnitCostHnl)),
    deltaUnitCostHnl: round4(toNumber(row.deltaUnitCostHnl)),
    deltaHnlAmount: round2(toNumber(row.deltaHnlAmount)),
    itemCode: row.itemCode ?? null,
    description: row.description ?? null,
    postedBy: String(row.postedBy),
    auditReason: row.auditReason ?? null,
    postedAt: dateTime(row.postedAt),
  }));

  return {
    purchaseOrderReceiptCount: purchaseOrderReceipts.length,
    purchaseOrderReceiptLineCount: purchaseOrderReceipts.reduce((sum, row) => sum + row.postedLineCount, 0),
    purchaseOrderReceiptQuantity: purchaseOrderReceipts.reduce((sum, row) => sum + row.postedQuantity, 0),
    purchaseOrderReceiptHnl: round2(purchaseOrderReceipts.reduce((sum, row) => sum + row.postedHnlAmount, 0)),
    inventoryReceiptCount: inventoryReceipts.length,
    inventoryReceiptQuantity: round4(inventoryReceipts.reduce((sum, row) => sum + row.quantity, 0)),
    inventoryReceiptHnl: round2(inventoryReceipts.reduce((sum, row) => sum + row.hnlAmount, 0)),
    inventoryTrueUpCount: inventoryTrueUps.length,
    inventoryTrueUpQuantity: round4(inventoryTrueUps.reduce((sum, row) => sum + row.quantity, 0)),
    inventoryTrueUpHnl: round2(inventoryTrueUps.reduce((sum, row) => sum + row.deltaHnlAmount, 0)),
    purchaseOrderReceipts,
    inventoryReceipts,
    inventoryTrueUps,
  };
}

export async function getImportReceivingHandoff(shipmentId: string): Promise<ImportReceivingHandoffEnvelope> {
  const shipmentRows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    shipmentNumber: string;
    displayName: string;
    status: ImportShipmentStatus;
  }>>(
    `
      SELECT id, shipment_number AS "shipmentNumber", display_name AS "displayName", status
      FROM app.import_shipment
      WHERE id = $1::uuid
      LIMIT 1
    `,
    shipmentId,
  );
  const shipment = shipmentRows[0];
  if (!shipment) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }

  const basis = receivingCostBasisForStatus(shipment.status);
  const [rows, failedReceivingCheckRows] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `
        SELECT
          sl.invoice_line_id AS "invoiceLineId",
          sl.id AS "shipmentLineId",
          po.id AS "purchaseOrderId",
          sl.purchase_order_line_id AS "purchaseOrderLineId",
          po.po_number AS "purchaseOrderNumber",
          po.status AS "purchaseOrderStatus",
          COALESCE(il.sku_id, pol.sku_id) AS "skuId",
          COALESCE(sku.code, sku.provisional_code, il.item_code) AS "itemCode",
          il.style_code AS "styleCode",
          COALESCE(il.description, sku.description_web, sku.description_rics, sku.comment) AS description,
          COALESCE(il.quantity, sl.expected_quantity) AS quantity,
          COALESCE(il.unit_of_measure, 'UNIT') AS "unitOfMeasure",
          COALESCE(il.source_unit_cost, sl.source_unit_cost) AS "sourceUnitCost",
          COALESCE(il.source_currency, sl.source_currency) AS "sourceCurrency",
          COALESCE(il.fx_rate, sl.fx_rate) AS "fxRate",
          COALESCE(il.fx_date, sl.fx_date) AS "fxDate",
          COALESCE(il.base_unit_cost_hnl, sl.commercial_unit_cost_hnl) AS "baseUnitCostHnl",
          COALESCE(il.commercial_unit_cost_hnl, il.base_unit_cost_hnl, sl.commercial_unit_cost_hnl) AS "commercialUnitCostHnl",
          COALESCE(il.component_allocated_cost_hnl, 0) AS "componentAllocatedCostHnl",
          sl.allocated_landed_cost_hnl AS "allocatedLandedCostHnl",
          sl.landed_unit_cost_hnl AS "landedUnitCostHnl",
          COALESCE(il.cost_role, 'FINISHED_GOOD') AS "costRole",
          COALESCE(il.receipt_policy, 'RECEIVE_TO_STOCK') AS "receiptPolicy",
          il.allocation_group_key AS "allocationGroupKey",
          git.id AS "goodsInTransitRecordId",
          git.container_id AS "containerId",
          COALESCE(ic.container_number, ic.cargo_group) AS "containerLabel",
          git.status AS "transitStatus",
          git.quantity_in_transit AS "quantityInTransit",
          git.expected_receipt_at AS "expectedReceiptAt",
          git.received_at AS "receivedAt",
          po.po_number AS sort_doc,
          0 AS sort_group,
          pol.line_sequence AS sort_line
        FROM app.import_shipment_line sl
        JOIN app.purchase_order_line pol ON pol.id = sl.purchase_order_line_id
        JOIN app.purchase_order po ON po.id = pol.po_id
        LEFT JOIN app.import_invoice_line il ON il.id = sl.invoice_line_id
        LEFT JOIN app.sku sku ON sku.id = COALESCE(il.sku_id, pol.sku_id)
        LEFT JOIN LATERAL (
          SELECT id, container_id, status, quantity_in_transit, expected_receipt_at, received_at
          FROM app.goods_in_transit_record
          WHERE shipment_line_id = sl.id
             OR (sl.invoice_line_id IS NOT NULL AND invoice_line_id = sl.invoice_line_id)
          ORDER BY created_at DESC
          LIMIT 1
        ) git ON true
        LEFT JOIN app.import_container ic ON ic.id = git.container_id
        WHERE sl.shipment_id = $1::uuid
          AND sl.status <> 'CANCELLED'
          AND (il.id IS NULL OR il.receipt_policy = 'RECEIVE_TO_STOCK')
        UNION ALL
        SELECT
          il.id AS "invoiceLineId",
          NULL::uuid AS "shipmentLineId",
          po.id AS "purchaseOrderId",
          il.purchase_order_line_id AS "purchaseOrderLineId",
          po.po_number AS "purchaseOrderNumber",
          po.status AS "purchaseOrderStatus",
          COALESCE(il.sku_id, pol.sku_id) AS "skuId",
          il.item_code AS "itemCode",
          il.style_code AS "styleCode",
          il.description,
          il.quantity,
          il.unit_of_measure AS "unitOfMeasure",
          il.source_unit_cost AS "sourceUnitCost",
          il.source_currency AS "sourceCurrency",
          il.fx_rate AS "fxRate",
          il.fx_date AS "fxDate",
          il.base_unit_cost_hnl AS "baseUnitCostHnl",
          COALESCE(il.commercial_unit_cost_hnl, il.base_unit_cost_hnl) AS "commercialUnitCostHnl",
          COALESCE(il.component_allocated_cost_hnl, 0) AS "componentAllocatedCostHnl",
          il.allocated_landed_cost_hnl AS "allocatedLandedCostHnl",
          il.landed_unit_cost_hnl AS "landedUnitCostHnl",
          il.cost_role AS "costRole",
          il.receipt_policy AS "receiptPolicy",
          il.allocation_group_key AS "allocationGroupKey",
          git.id AS "goodsInTransitRecordId",
          git.container_id AS "containerId",
          COALESCE(ic.container_number, ic.cargo_group) AS "containerLabel",
          git.status AS "transitStatus",
          git.quantity_in_transit AS "quantityInTransit",
          git.expected_receipt_at AS "expectedReceiptAt",
          git.received_at AS "receivedAt",
          si.invoice_number AS sort_doc,
          1 AS sort_group,
          il.line_number AS sort_line
        FROM app.import_supplier_invoice si
        JOIN app.import_invoice_line il ON il.invoice_id = si.id
        LEFT JOIN app.purchase_order_line pol ON pol.id = il.purchase_order_line_id
        LEFT JOIN app.purchase_order po ON po.id = pol.po_id
        LEFT JOIN LATERAL (
          SELECT id, container_id, status, quantity_in_transit, expected_receipt_at, received_at
          FROM app.goods_in_transit_record
          WHERE invoice_line_id = il.id
          ORDER BY created_at DESC
          LIMIT 1
        ) git ON true
        LEFT JOIN app.import_container ic ON ic.id = git.container_id
        WHERE si.shipment_id = $1::uuid
          AND il.receipt_policy = 'RECEIVE_TO_STOCK'
          AND NOT EXISTS (
            SELECT 1
            FROM app.import_shipment_line sl
            WHERE sl.invoice_line_id = il.id
              AND sl.status <> 'CANCELLED'
          )
        ORDER BY sort_group ASC, sort_doc ASC, sort_line ASC
      `,
      shipmentId,
    ),
    prisma.$queryRawUnsafe<Array<{ checkCode: string; message: string | null }>>(
      `
        SELECT check_code AS "checkCode", message
        FROM app.import_verification_check
        WHERE shipment_id = $1::uuid
          AND check_code IN (
            'COMPONENT_COST_ROLLUP',
            'COMPONENT_ROLLUP_RECONCILES',
            'RECEIPT_TARGET_COST_RECONCILES',
            'ALLOCATION_RECONCILES'
          )
          AND status = 'FAIL'
        ORDER BY
          CASE check_code
            WHEN 'COMPONENT_COST_ROLLUP' THEN 0
            WHEN 'COMPONENT_ROLLUP_RECONCILES' THEN 1
            WHEN 'RECEIPT_TARGET_COST_RECONCILES' THEN 2
            ELSE 3
          END
        LIMIT 1
      `,
      shipmentId,
    ),
  ]);

  const failedReceivingCheck = failedReceivingCheckRows[0] ?? null;
  const shipmentBlockReason = failedReceivingCheck
    ? failedReceivingCheck.message ?? `${failedReceivingCheck.checkCode} must pass before receiving.`
    : null;
  const lines = rows.map((row) => mapImportReceivingHandoffLine(shipmentId, shipment.status, basis, row, shipmentBlockReason));
  const readyLines = lines.filter((line) => line.canReceive);
  const audit = await getImportReceivingAuditSummary(shipmentId);

  return {
    shipmentId,
    shipmentNumber: shipment.shipmentNumber,
    displayName: shipment.displayName,
    status: shipment.status,
    receivingCostBasis: basis,
    canReceive: readyLines.length > 0,
    requiresAuditReason: basis === 'ESTIMATED',
    lineCount: lines.length,
    readyLineCount: readyLines.length,
    blockedLineCount: lines.length - readyLines.length,
    trueUpLineCount: lines.filter((line) => line.needsFinalTrueUp).length,
    totalQuantity: round4(lines.reduce((sum, line) => sum + line.quantity, 0)),
    totalLandedHnl: round2(lines.reduce((sum, line) => sum + (line.receivingLineCostHnl ?? 0), 0)),
    readyLandedHnl: round2(readyLines.reduce((sum, line) => sum + (line.receivingLineCostHnl ?? 0), 0)),
    lines,
    audit,
  };
}

export async function receiveImportShipmentEstimated(
  shipmentId: string,
  input: ReceiveImportShipmentInput,
  actor: string | null,
): Promise<ImportReceivingActionResult> {
  const auditReason = cleanString(input.auditReason);
  if (!auditReason) {
    throw new ImportManagementServiceError(
      422,
      'AUDIT_REASON_REQUIRED',
      'Estimated receiving requires an audit reason.',
    );
  }
  const fullHandoff = await getImportReceivingHandoff(shipmentId);
  const selection = selectReceivingHandoff(fullHandoff, 'ESTIMATED', input);
  const handoff = selection.handoff;
  const recordIds = selection.recordIds;
  const changedBy = cleanString(input.changedBy) ?? cleanString(actor) ?? 'system';
  const receivedAt = optionalDate(input.receivedAt, 'receivedAt') ?? new Date().toISOString().slice(0, 10);
  let purchaseOrderReceipts: ImportPostedPurchaseOrderReceipt[] = [];
  let inventoryReceipts: ImportPostedInventoryReceipt[] = [];
  const inventoryTrueUps: ImportPostedInventoryTrueUp[] = [];

  await prisma.$transaction(async (tx) => {
    purchaseOrderReceipts = await postImportPurchaseOrderReceipts(
      tx,
      handoff,
      'ESTIMATED',
      receivedAt,
      changedBy,
      input.locationId,
      auditReason,
    );
    inventoryReceipts = await postDirectImportInventoryReceipts(
      tx,
      handoff,
      'ESTIMATED',
      receivedAt,
      changedBy,
      input.locationId,
      auditReason,
    );
    await updateReceivingTransitRecords(tx, recordIds, 'RECEIVING_ESTIMATED', receivedAt, auditReason);
    await tx.$executeRawUnsafe(
      `
        UPDATE app.import_shipment
        SET status = 'RECEIVING_ESTIMATED',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
          AND status IN ('APPROVED_ESTIMATE', 'IN_TRANSIT', 'RECEIVING_ESTIMATED')
      `,
      shipmentId,
    );
    if (recordIds.length > 0) {
      await upsertVerificationCheck(tx, shipmentId, {
        checkCode: 'ESTIMATED_RECEIVING_AUTHORIZATION',
        status: 'PASS',
        actualHnlAmount: handoff.readyLandedHnl,
        message: `${changedBy}: ${auditReason}`,
      });
    }
  });

  await recordImportAudit({
    action: 'RECEIVE_ESTIMATED',
    resourceType: 'import.shipment',
    resourceId: shipmentId,
    actor: changedBy,
    reason: auditReason,
    afterJson: {
      receivedAt,
      updatedRecordCount: recordIds.length,
      postedPurchaseOrderReceiptCount: purchaseOrderReceipts.length,
      postedInventoryReceiptCount: inventoryReceipts.length,
      postedInventoryTrueUpCount: inventoryTrueUps.length,
      postedInventoryTrueUpHnl: round2(inventoryTrueUps.reduce((sum, row) => sum + row.deltaHnlAmount, 0)),
      inventoryTrueUps,
    },
    metadataJson: {
      containerId: input.containerId ?? null,
      shipmentLineIds: input.shipmentLineIds ?? null,
      goodsInTransitRecordIds: recordIds,
    },
  });

  return {
    ...(await getImportReceivingHandoff(shipmentId)),
    action: 'RECEIVE_ESTIMATED',
    updatedRecordCount: recordIds.length,
    postedPurchaseOrderReceiptCount: purchaseOrderReceipts.length,
    postedPurchaseOrderLineCount: purchaseOrderReceipts.reduce((sum, row) => sum + row.postedLineCount, 0),
    postedPurchaseOrderQuantity: purchaseOrderReceipts.reduce((sum, row) => sum + row.postedQuantity, 0),
    postedPurchaseOrderHnl: round2(purchaseOrderReceipts.reduce((sum, row) => sum + row.postedHnlAmount, 0)),
    postedInventoryReceiptCount: inventoryReceipts.length,
    postedInventoryReceiptQuantity: inventoryReceipts.reduce((sum, row) => sum + row.quantity, 0),
    postedInventoryReceiptHnl: round2(inventoryReceipts.reduce((sum, row) => sum + row.hnlAmount, 0)),
    postedInventoryTrueUpCount: 0,
    postedInventoryTrueUpQuantity: 0,
    postedInventoryTrueUpHnl: 0,
    skippedFinalTrueUpLineCount: 0,
    purchaseOrderReceipts,
    inventoryReceipts,
    inventoryTrueUps,
  };
}

export async function receiveImportShipmentFinal(
  shipmentId: string,
  input: ReceiveImportShipmentInput,
  actor: string | null,
): Promise<ImportReceivingActionResult> {
  const fullHandoff = await getImportReceivingHandoff(shipmentId);
  const selection = selectReceivingHandoff(fullHandoff, 'FINAL', input);
  const handoff = selection.handoff;
  const recordIds = selection.recordIds;
  const changedBy = cleanString(input.changedBy) ?? cleanString(actor) ?? 'system';
  const auditReason = cleanString(input.auditReason);
  const receivedAt = optionalDate(input.receivedAt, 'receivedAt') ?? new Date().toISOString().slice(0, 10);
  let purchaseOrderReceipts: ImportPostedPurchaseOrderReceipt[] = [];
  let inventoryReceipts: ImportPostedInventoryReceipt[] = [];
  let inventoryTrueUps: ImportPostedInventoryTrueUp[] = [];
  const skippedFinalTrueUpLineCount = handoff.lines.filter(
    (line) => line.canReceive && line.transitStatus === 'RECEIVING_ESTIMATED',
  ).length;

  await prisma.$transaction(async (tx) => {
    inventoryTrueUps = await postImportInventoryTrueUps(
      tx,
      handoff,
      receivedAt,
      changedBy,
      auditReason,
    );
    purchaseOrderReceipts = await postImportPurchaseOrderReceipts(
      tx,
      handoff,
      'FINAL',
      receivedAt,
      changedBy,
      input.locationId,
      auditReason,
    );
    inventoryReceipts = await postDirectImportInventoryReceipts(
      tx,
      handoff,
      'FINAL',
      receivedAt,
      changedBy,
      input.locationId,
      auditReason,
    );
    await updateReceivingTransitRecords(tx, recordIds, 'RECEIVED_FINAL', receivedAt, auditReason);
    await tx.$executeRawUnsafe(
      `
        UPDATE app.import_shipment
        SET status = CASE
              WHEN NOT EXISTS (
                SELECT 1
                FROM app.goods_in_transit_record git
                WHERE git.shipment_id = $1::uuid
                  AND git.status NOT IN ('RECEIVED_FINAL', 'CLOSED', 'CANCELLED')
              ) THEN 'RECEIVED_FINAL'
              ELSE status
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
          AND status IN ('FINAL_LIQUIDATION', 'RECEIVED_FINAL')
      `,
      shipmentId,
    );
    if (recordIds.length > 0) {
      await upsertVerificationCheck(tx, shipmentId, {
        checkCode: 'FINAL_RECEIVING_TRUE_UP',
        status: 'PASS',
        actualHnlAmount: handoff.readyLandedHnl,
        varianceHnlAmount: round2(inventoryTrueUps.reduce((sum, row) => sum + row.deltaHnlAmount, 0)),
        message: `${changedBy}: ${inventoryTrueUps.length} inventory cost true-ups posted; ${handoff.trueUpLineCount} estimated lines reviewed.`,
      });
    }
  });

  await recordImportAudit({
    action: 'RECEIVE_FINAL_AND_TRUE_UP',
    resourceType: 'import.shipment',
    resourceId: shipmentId,
    actor: changedBy,
    reason: auditReason,
    afterJson: {
      receivedAt,
      updatedRecordCount: recordIds.length,
      postedPurchaseOrderReceiptCount: purchaseOrderReceipts.length,
      postedInventoryReceiptCount: inventoryReceipts.length,
      postedInventoryTrueUpCount: inventoryTrueUps.length,
      postedInventoryTrueUpHnl: round2(inventoryTrueUps.reduce((sum, row) => sum + row.deltaHnlAmount, 0)),
      inventoryTrueUps,
    },
    metadataJson: {
      containerId: input.containerId ?? null,
      shipmentLineIds: input.shipmentLineIds ?? null,
      goodsInTransitRecordIds: recordIds,
    },
  });

  return {
    ...(await getImportReceivingHandoff(shipmentId)),
    action: 'RECEIVE_FINAL',
    updatedRecordCount: recordIds.length,
    postedPurchaseOrderReceiptCount: purchaseOrderReceipts.length,
    postedPurchaseOrderLineCount: purchaseOrderReceipts.reduce((sum, row) => sum + row.postedLineCount, 0),
    postedPurchaseOrderQuantity: purchaseOrderReceipts.reduce((sum, row) => sum + row.postedQuantity, 0),
    postedPurchaseOrderHnl: round2(purchaseOrderReceipts.reduce((sum, row) => sum + row.postedHnlAmount, 0)),
    postedInventoryReceiptCount: inventoryReceipts.length,
    postedInventoryReceiptQuantity: inventoryReceipts.reduce((sum, row) => sum + row.quantity, 0),
    postedInventoryReceiptHnl: round2(inventoryReceipts.reduce((sum, row) => sum + row.hnlAmount, 0)),
    postedInventoryTrueUpCount: inventoryTrueUps.length,
    postedInventoryTrueUpQuantity: round4(inventoryTrueUps.reduce((sum, row) => sum + row.quantity, 0)),
    postedInventoryTrueUpHnl: round2(inventoryTrueUps.reduce((sum, row) => sum + row.deltaHnlAmount, 0)),
    skippedFinalTrueUpLineCount,
    purchaseOrderReceipts,
    inventoryReceipts,
    inventoryTrueUps,
  };
}

export async function stageImportPayables(
  shipmentId: string,
  actor: string | null,
): Promise<StageImportPayablesResult> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }
  const createdBy = cleanString(actor) ?? 'system';
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `
        WITH source_payables AS (
          SELECT
            si.shipment_id,
            'SUPPLIER_INVOICE'::text AS source_type,
            si.id AS source_id,
            si.supplier_name AS counterparty,
            si.invoice_number AS document_number,
            si.invoice_kind AS payable_kind,
            si.source_amount,
            si.source_currency,
            si.fx_rate,
            si.fx_date,
            si.hnl_amount,
            true AS final,
            si.notes
          FROM app.import_supplier_invoice si
          WHERE si.shipment_id = $1::uuid
          UNION ALL
          SELECT
            c.shipment_id,
            'LANDED_COST_CHARGE'::text AS source_type,
            c.id AS source_id,
            COALESCE(NULLIF(c.counterparty, ''), c.charge_type) AS counterparty,
            c.document_number,
            c.charge_type AS payable_kind,
            c.source_amount,
            c.source_currency,
            c.fx_rate,
            c.fx_date,
            c.hnl_amount,
            c.final,
            c.notes
          FROM app.import_charge c
          WHERE c.shipment_id = $1::uuid
            AND c.final = true
        )
        INSERT INTO app.import_payable_handoff (
          shipment_id, source_type, source_id, counterparty, document_number,
          payable_kind, source_amount, source_currency, fx_rate, fx_date,
          hnl_amount, final, handoff_status, notes, created_by
        )
        SELECT
          shipment_id, source_type, source_id, counterparty, document_number,
          payable_kind, source_amount, source_currency, fx_rate, fx_date,
          hnl_amount, final, 'READY', notes, $2
        FROM source_payables
        ON CONFLICT (source_type, source_id)
        DO UPDATE SET
          shipment_id = EXCLUDED.shipment_id,
          counterparty = EXCLUDED.counterparty,
          document_number = EXCLUDED.document_number,
          payable_kind = EXCLUDED.payable_kind,
          source_amount = EXCLUDED.source_amount,
          source_currency = EXCLUDED.source_currency,
          fx_rate = EXCLUDED.fx_rate,
          fx_date = EXCLUDED.fx_date,
          hnl_amount = EXCLUDED.hnl_amount,
          final = EXCLUDED.final,
          handoff_status = 'READY',
          ap_reference = NULL,
          sent_to_ap_by = NULL,
          sent_to_ap_at = NULL,
          notes = EXCLUDED.notes,
          updated_at = CURRENT_TIMESTAMP
        WHERE app.import_payable_handoff.handoff_status = 'READY'
      `,
      shipmentId,
      createdBy,
    );
    await tx.$executeRawUnsafe(
      `UPDATE app.import_shipment SET updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
      shipmentId,
    );
  });

  const envelope = await listImportPayables(shipmentId);
  const result = {
    ...envelope,
    stagedReadyCount: envelope.payables.filter((row) => row.handoffStatus === 'READY').length,
    blockedEstimatedChargeCount: envelope.payables.filter(
      (row) => row.sourceType === 'LANDED_COST_CHARGE' && !row.readyForAp,
    ).length,
  };
  await recordImportAudit({
    action: 'STAGE_PAYABLES',
    resourceType: 'import.shipment',
    resourceId: shipmentId,
    actor: createdBy,
    afterJson: {
      stagedReadyCount: result.stagedReadyCount,
      blockedEstimatedChargeCount: result.blockedEstimatedChargeCount,
      payableCount: result.payables.length,
    },
  });
  return result;
}

export async function markImportPayablesSent(
  shipmentId: string,
  input: MarkImportPayablesSentInput,
  actor: string | null,
): Promise<ImportPayablesEnvelope> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }
  const changedBy = cleanString(input.changedBy) ?? cleanString(actor) ?? 'system';
  const beforeEnvelope = await listImportPayables(shipmentId);
  const readyPayableKeys = beforeEnvelope.payables
    .filter((row) => row.handoffStatus === 'READY')
    .map((row) => row.handoffId ?? `${row.sourceType}:${row.sourceId}`);
  await prisma.$executeRawUnsafe(
    `
      UPDATE app.import_payable_handoff
      SET handoff_status = 'SENT_TO_AP',
          ap_reference = $2,
          sent_to_ap_by = $3,
          sent_to_ap_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE shipment_id = $1::uuid
        AND handoff_status = 'READY'
    `,
    shipmentId,
    cleanString(input.apReference),
    changedBy,
  );
  await touchShipment(shipmentId);
  const envelope = await listImportPayables(shipmentId);
  await recordImportAudit({
    action: 'SEND_PAYABLES_TO_AP',
    resourceType: 'import.shipment',
    resourceId: shipmentId,
    actor: changedBy,
    beforeJson: { readyPayableKeys },
    afterJson: {
      sentPayableKeys: envelope.payables
        .filter((row) => (
          readyPayableKeys.includes(row.handoffId ?? `${row.sourceType}:${row.sourceId}`) &&
          row.handoffStatus === 'SENT_TO_AP'
        ))
        .map((row) => row.handoffId ?? `${row.sourceType}:${row.sourceId}`),
      apReference: cleanString(input.apReference),
    },
  });
  return envelope;
}

async function getImportPayableHandoffContext(
  handoffId: string,
): Promise<{ shipmentId: string; handoffStatus: ImportPayableHandoffStatus } | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    shipmentId: string;
    handoffStatus: ImportPayableHandoffStatus;
  }>>(
    `
      SELECT shipment_id AS "shipmentId", handoff_status AS "handoffStatus"
      FROM app.import_payable_handoff
      WHERE id = $1::uuid
      LIMIT 1
    `,
    handoffId,
  );
  const row = rows[0];
  return row ? {
    shipmentId: String(row.shipmentId),
    handoffStatus: row.handoffStatus,
  } : null;
}

export async function markImportPayablePaid(
  handoffId: string,
  input: MarkImportPayablePaidInput,
  actor: string | null,
): Promise<ImportPayablesEnvelope> {
  const context = await getImportPayableHandoffContext(handoffId);
  if (!context) {
    throw new ImportManagementServiceError(404, 'PAYABLE_NOT_FOUND', 'Import payable handoff not found.');
  }
  if (context.handoffStatus === 'VOIDED') {
    throw new ImportManagementServiceError(409, 'PAYABLE_VOIDED', 'Voided import payables cannot be marked paid.');
  }
  if (context.handoffStatus === 'READY') {
    throw new ImportManagementServiceError(409, 'PAYABLE_NOT_SENT', 'Import payable must be sent to AP before it can be marked paid.');
  }

  const changedBy = cleanString(input.changedBy) ?? cleanString(actor) ?? 'system';
  const paidAt = optionalDate(input.paidAt, 'paidAt') ?? new Date().toISOString().slice(0, 10);
  await prisma.$executeRawUnsafe(
    `
      UPDATE app.import_payable_handoff
      SET handoff_status = 'PAID',
          payment_reference = $2,
          paid_by = $3,
          paid_at = $4::timestamptz,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid
        AND handoff_status IN ('SENT_TO_AP', 'PAID')
    `,
    handoffId,
    cleanString(input.paymentReference),
    changedBy,
    paidAt,
  );
  await touchShipment(context.shipmentId);
  const envelope = await listImportPayables(context.shipmentId);
  await recordImportAudit({
    action: 'MARK_PAYABLE_PAID',
    resourceType: 'import.payable_handoff',
    resourceId: handoffId,
    actor: changedBy,
    beforeJson: { handoffStatus: context.handoffStatus },
    afterJson: {
      handoffStatus: 'PAID',
      paidAt,
      paymentReference: cleanString(input.paymentReference),
    },
    metadataJson: { shipmentId: context.shipmentId },
  });
  return envelope;
}

export async function voidImportPayable(
  handoffId: string,
  input: VoidImportPayableInput,
  actor: string | null,
): Promise<ImportPayablesEnvelope> {
  const context = await getImportPayableHandoffContext(handoffId);
  if (!context) {
    throw new ImportManagementServiceError(404, 'PAYABLE_NOT_FOUND', 'Import payable handoff not found.');
  }
  if (context.handoffStatus === 'PAID') {
    throw new ImportManagementServiceError(409, 'PAYABLE_PAID', 'Paid import payables cannot be voided here; use the AP reversal workflow.');
  }
  const reason = requiredString(input.reason, 'reason');
  const changedBy = cleanString(input.changedBy) ?? cleanString(actor) ?? 'system';

  await prisma.$executeRawUnsafe(
    `
      UPDATE app.import_payable_handoff
      SET handoff_status = 'VOIDED',
          voided_by = $2,
          voided_at = CURRENT_TIMESTAMP,
          void_reason = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid
        AND handoff_status IN ('READY', 'SENT_TO_AP', 'VOIDED')
    `,
    handoffId,
    changedBy,
    reason,
  );
  await touchShipment(context.shipmentId);
  const envelope = await listImportPayables(context.shipmentId);
  await recordImportAudit({
    action: 'VOID_PAYABLE',
    resourceType: 'import.payable_handoff',
    resourceId: handoffId,
    actor: changedBy,
    reason,
    beforeJson: { handoffStatus: context.handoffStatus },
    afterJson: {
      handoffStatus: 'VOIDED',
      voidReason: reason,
    },
    metadataJson: { shipmentId: context.shipmentId },
  });
  return envelope;
}

export async function updateImportShipmentStatus(
  shipmentId: string,
  input: UpdateImportShipmentStatusInput,
  actor: string | null,
): Promise<ImportShipmentDetail> {
  if (!SHIPMENT_STATUSES.has(input.status)) {
    throw new ImportManagementServiceError(422, 'INVALID_STATUS', 'Invalid import shipment status.');
  }
  const current = await getShipmentStatus(prisma, shipmentId);
  if (!current) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }
  if (current !== input.status && !NEXT_STATUSES[current].includes(input.status)) {
    throw new ImportManagementServiceError(
      409,
      'INVALID_STATUS_TRANSITION',
      `Cannot move import shipment from ${current} to ${input.status}.`,
    );
  }
  if (input.status === 'RECEIVING_ESTIMATED' && !input.auditReason?.trim()) {
    throw new ImportManagementServiceError(
      422,
      'AUDIT_REASON_REQUIRED',
      'Estimated receiving requires an audit reason.',
    );
  }
  await assertLiquidationReadyForStatus(shipmentId, input.status);

  const changedBy = input.changedBy?.trim() || actor?.trim() || 'system';
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `
        UPDATE app.import_shipment
        SET status = $2,
            approved_estimate_at = CASE WHEN $2 = 'APPROVED_ESTIMATE' THEN CURRENT_TIMESTAMP ELSE approved_estimate_at END,
            approved_estimate_by = CASE WHEN $2 = 'APPROVED_ESTIMATE' THEN $3 ELSE approved_estimate_by END,
            final_liquidation_at = CASE WHEN $2 = 'FINAL_LIQUIDATION' THEN CURRENT_TIMESTAMP ELSE final_liquidation_at END,
            closed_at = CASE WHEN $2 = 'CLOSED' THEN CURRENT_TIMESTAMP ELSE closed_at END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      shipmentId,
      input.status,
      changedBy,
    );

    if (input.status === 'RECEIVING_ESTIMATED') {
      await upsertVerificationCheck(tx, shipmentId, {
        checkCode: 'ESTIMATED_RECEIVING_AUTHORIZATION',
        status: 'PASS',
        message: input.auditReason?.trim() ?? null,
      });
    }
  });

  await recordImportAudit({
    action: 'UPDATE_SHIPMENT_STATUS',
    resourceType: 'import.shipment',
    resourceId: shipmentId,
    actor: changedBy,
    reason: input.auditReason ?? null,
    beforeJson: { status: current },
    afterJson: { status: input.status },
  });

  return getImportShipmentById(shipmentId) as Promise<ImportShipmentDetail>;
}

export async function updateImportSuggestedPriceStatus(
  suggestedPriceId: string,
  input: UpdateImportSuggestedPriceStatusInput,
  actor: string | null,
): Promise<ImportShipmentDetail> {
  const nextStatus = normalizeSuggestedPriceStatus(input.approvalStatus);
  const context = await getSuggestedPriceContext(prisma, suggestedPriceId);
  if (!context) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Suggested import price not found.');
  }
  assertImportSuggestedPriceStatusTransition(context.approvalStatus, nextStatus, context.skuId);

  const changedBy = cleanString(input.changedBy) ?? cleanString(actor) ?? 'system';

  await prisma.$executeRawUnsafe(
    `
      UPDATE app.import_suggested_price
      SET approval_status = $2,
          approved_by = CASE
            WHEN $2 = 'APPROVED' THEN $3
            WHEN $2 IN ('SUGGESTED', 'REJECTED') THEN NULL
            ELSE approved_by
          END,
          approved_at = CASE
            WHEN $2 = 'APPROVED' THEN CURRENT_TIMESTAMP
            WHEN $2 IN ('SUGGESTED', 'REJECTED') THEN NULL
            ELSE approved_at
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid
    `,
    suggestedPriceId,
    nextStatus,
    changedBy,
  );
  await touchShipment(context.shipmentId);

  return getImportShipmentById(context.shipmentId) as Promise<ImportShipmentDetail>;
}

export async function allocateImportLandedCost(
  shipmentId: string,
  input: AllocateImportLandedCostInput = {},
): Promise<ImportAllocationResult> {
  if (!(await shipmentExists(prisma, shipmentId))) {
    throw new ImportManagementServiceError(404, 'NOT_FOUND', 'Import shipment not found.');
  }
  await assertShipmentLandedCostEditable(prisma, shipmentId);

  const markupFactor = input.markupFactor == null ? 2.5 : input.markupFactor;
  if (!Number.isFinite(markupFactor) || markupFactor <= 0) {
    throw new ImportManagementServiceError(422, 'INVALID_MARKUP_FACTOR', 'markupFactor must be greater than zero.');
  }
  assertImportCostBuildPreviewsReady(await getImportCostBuildPreviewsForShipment(prisma, shipmentId));

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `DELETE FROM app.import_cost_component_allocation WHERE shipment_id = $1::uuid`,
      shipmentId,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM app.import_cost_build WHERE shipment_id = $1::uuid`,
      shipmentId,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM app.import_landed_cost_allocation WHERE shipment_id = $1::uuid`,
      shipmentId,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM app.import_suggested_price WHERE shipment_id = $1::uuid`,
      shipmentId,
    );
    await tx.$executeRawUnsafe(
      `
        UPDATE app.import_invoice_line il
        SET allocated_landed_cost_hnl = 0,
            component_allocated_cost_hnl = 0,
            commercial_unit_cost_hnl = il.base_unit_cost_hnl,
            landed_unit_cost_hnl = CASE
              WHEN il.receipt_policy = 'RECEIVE_TO_STOCK' THEN il.base_unit_cost_hnl
              ELSE NULL
            END,
            updated_at = CURRENT_TIMESTAMP
        FROM app.import_supplier_invoice si
        WHERE si.id = il.invoice_id
          AND si.shipment_id = $1::uuid
      `,
      shipmentId,
    );
    await tx.$executeRawUnsafe(
      `
        UPDATE app.import_shipment_line
        SET allocated_landed_cost_hnl = 0,
            landed_unit_cost_hnl = estimated_landed_unit_cost_hnl,
            updated_at = CURRENT_TIMESTAMP
        WHERE shipment_id = $1::uuid
      `,
      shipmentId,
    );

    const componentSourceRows = await tx.$queryRawUnsafe<any[]>(
      `
        SELECT
          il.id,
          il.hnl_amount AS "hnlAmount",
          il.quantity,
          il.cost_role AS "costRole",
          il.receipt_policy AS "receiptPolicy",
          il.allocation_group_key AS "allocationGroupKey"
        FROM app.import_invoice_line il
        JOIN app.import_supplier_invoice si ON si.id = il.invoice_id
        WHERE si.shipment_id = $1::uuid
          AND il.receipt_policy IN ('RECEIVE_TO_STOCK', 'ROLL_TO_OUTPUT')
        ORDER BY il.line_number ASC, il.id ASC
      `,
      shipmentId,
    );
    const componentRollup = rollupComponentCostsByGroup(componentSourceRows.map((row) => {
      const costRole = mapCostRole(row.costRole);
      return {
        id: String(row.id),
        hnlAmount: toNumber(row.hnlAmount),
        quantity: toNumber(row.quantity),
        receiptPolicy: mapReceiptPolicy(row.receiptPolicy, costRole),
        allocationGroupKey: row.allocationGroupKey ?? null,
      };
    }));

    for (const lineTotal of componentRollup.lineTotals) {
      await tx.$executeRawUnsafe(
        `
          UPDATE app.import_invoice_line
          SET component_allocated_cost_hnl = $2,
              commercial_unit_cost_hnl = $3,
              landed_unit_cost_hnl = $3,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1::uuid
        `,
        lineTotal.outputLineId,
        lineTotal.componentAllocatedCostHnl,
        lineTotal.commercialUnitCostHnl,
      );
    }

    const outputLineTotals = new Map(componentRollup.lineTotals.map((lineTotal) => [lineTotal.outputLineId, lineTotal]));
    const outputBuildIds = new Map<string, string>();
    for (const allocation of componentRollup.allocations) {
      const lineTotal = outputLineTotals.get(allocation.outputLineId);
      if (!lineTotal) continue;
      let buildId = outputBuildIds.get(allocation.outputLineId);
      if (!buildId) {
        buildId = uuidv4();
        outputBuildIds.set(allocation.outputLineId, buildId);
        const buildCode = `${(lineTotal.allocationGroupKey ?? 'OUTPUT').slice(0, 48)}:${allocation.outputLineId}`.slice(0, 96);
        await tx.$executeRawUnsafe(
          `
            INSERT INTO app.import_cost_build (
              id, shipment_id, build_code, description, output_invoice_line_id,
              output_quantity, allocation_basis, created_by
            )
            VALUES (
              $1::uuid, $2::uuid, $3, $4, $5::uuid,
              $6, 'OUTPUT_VALUE_SHARE', 'system'
            )
          `,
          buildId,
          shipmentId,
          buildCode,
          lineTotal.allocationGroupKey ? `Auto component rollup for ${lineTotal.allocationGroupKey}` : 'Auto component rollup',
          allocation.outputLineId,
          componentSourceRows.find((row) => String(row.id) === allocation.outputLineId)?.quantity ?? 0,
        );
      }
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.import_cost_component_allocation (
            shipment_id, build_id, component_invoice_line_id, output_invoice_line_id,
            allocation_basis, allocated_hnl_amount
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'OUTPUT_VALUE_SHARE', $5)
        `,
        shipmentId,
        buildId,
        allocation.componentLineId,
        allocation.outputLineId,
        allocation.allocatedHnlAmount,
      );
    }

    const lineRows = await tx.$queryRawUnsafe<any[]>(
      `
        SELECT
          sl.id,
          'SHIPMENT_LINE'::text AS "targetType",
          sl.invoice_line_id AS "invoiceLineId",
          COALESCE(il.sku_id, pol.sku_id) AS "skuId",
          COALESCE(
            il.quantity * COALESCE(il.commercial_unit_cost_hnl, il.base_unit_cost_hnl),
            sl.expected_quantity * sl.commercial_unit_cost_hnl
          ) AS "hnlAmount",
          COALESCE(il.quantity, sl.expected_quantity) AS quantity
        FROM app.import_shipment_line sl
        JOIN app.purchase_order_line pol ON pol.id = sl.purchase_order_line_id
        LEFT JOIN app.import_invoice_line il ON il.id = sl.invoice_line_id
        WHERE sl.shipment_id = $1::uuid
          AND sl.status <> 'CANCELLED'
          AND (il.id IS NULL OR il.receipt_policy = 'RECEIVE_TO_STOCK')
        UNION ALL
        SELECT
          il.id,
          'INVOICE_LINE'::text AS "targetType",
          il.id AS "invoiceLineId",
          il.sku_id AS "skuId",
          il.quantity * COALESCE(il.commercial_unit_cost_hnl, il.base_unit_cost_hnl) AS "hnlAmount",
          il.quantity
        FROM app.import_invoice_line il
        JOIN app.import_supplier_invoice si ON si.id = il.invoice_id
        WHERE si.shipment_id = $1::uuid
          AND il.receipt_policy = 'RECEIVE_TO_STOCK'
          AND NOT EXISTS (
            SELECT 1
            FROM app.import_shipment_line sl
            WHERE sl.invoice_line_id = il.id
              AND sl.status <> 'CANCELLED'
          )
        ORDER BY "targetType" DESC, id ASC
      `,
      shipmentId,
    );
    const chargeRows = await tx.$queryRawUnsafe<any[]>(
      `
        SELECT id, hnl_amount AS "hnlAmount"
        FROM app.import_charge
        WHERE shipment_id = $1::uuid
          AND allocation_basis = 'PRODUCT_COST_SHARE'
          AND cost_treatment = 'ALLOCATE_TO_LANDED'
        ORDER BY created_at ASC
      `,
      shipmentId,
    );

    const lines = lineRows.map((row) => ({
      id: String(row.id),
      targetType: String(row.targetType) as 'INVOICE_LINE' | 'SHIPMENT_LINE',
      invoiceLineId: row.invoiceLineId ? String(row.invoiceLineId) : null,
      skuId: row.skuId ?? null,
      hnlAmount: round2(toNumber(row.hnlAmount)),
      quantity: toNumber(row.quantity),
    }));
    const charges = chargeRows.map((row) => ({
      id: String(row.id),
      hnlAmount: toNumber(row.hnlAmount),
    }));

    const { allocations, lineTotals } = allocateByProductCostShare(lines, charges);

    for (const allocation of allocations) {
      const target = lines.find((line) => line.id === allocation.invoiceLineId);
      if (!target) continue;
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.import_landed_cost_allocation (
            shipment_id, charge_id, invoice_line_id, shipment_line_id, allocation_basis, allocated_hnl_amount
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'PRODUCT_COST_SHARE', $5)
        `,
        shipmentId,
        allocation.chargeId,
        target.targetType === 'INVOICE_LINE' ? target.id : null,
        target.targetType === 'SHIPMENT_LINE' ? target.id : null,
        allocation.allocatedHnlAmount,
      );
    }

    const lineById = new Map(lines.map((line) => [line.id, line]));
    for (const lineTotal of lineTotals) {
      const line = lineById.get(lineTotal.invoiceLineId);
      if (!line) continue;
      if (line.targetType === 'SHIPMENT_LINE') {
        await tx.$executeRawUnsafe(
          `
            UPDATE app.import_shipment_line
            SET allocated_landed_cost_hnl = $2,
                landed_unit_cost_hnl = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1::uuid
          `,
          lineTotal.invoiceLineId,
          lineTotal.allocatedHnlAmount,
          lineTotal.landedUnitCostHnl,
        );
        if (line.invoiceLineId) {
          await tx.$executeRawUnsafe(
            `
              UPDATE app.import_invoice_line
              SET allocated_landed_cost_hnl = $2,
                  landed_unit_cost_hnl = $3,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = $1::uuid
            `,
            line.invoiceLineId,
            lineTotal.allocatedHnlAmount,
            lineTotal.landedUnitCostHnl,
          );
        }
      } else {
      await tx.$executeRawUnsafe(
        `
          UPDATE app.import_invoice_line
          SET allocated_landed_cost_hnl = $2,
              landed_unit_cost_hnl = $3,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1::uuid
        `,
        lineTotal.invoiceLineId,
        lineTotal.allocatedHnlAmount,
        lineTotal.landedUnitCostHnl,
      );
      }

      const suggestedPriceInvoiceLineId = line.targetType === 'INVOICE_LINE' ? line.id : line.invoiceLineId;
      if (!suggestedPriceInvoiceLineId) continue;
      await tx.$executeRawUnsafe(
        `
          INSERT INTO app.import_suggested_price (
            shipment_id, invoice_line_id, sku_id, landed_unit_cost_hnl,
            markup_factor, suggested_retail_hnl
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
          ON CONFLICT (shipment_id, invoice_line_id)
          DO UPDATE SET
            sku_id = EXCLUDED.sku_id,
            landed_unit_cost_hnl = EXCLUDED.landed_unit_cost_hnl,
            markup_factor = EXCLUDED.markup_factor,
            suggested_retail_hnl = EXCLUDED.suggested_retail_hnl,
            updated_at = CURRENT_TIMESTAMP
        `,
        shipmentId,
        suggestedPriceInvoiceLineId,
        line?.skuId ?? null,
        lineTotal.landedUnitCostHnl,
        markupFactor,
        round2(lineTotal.landedUnitCostHnl * markupFactor),
      );
    }

    const unallocatedComponentHnl = round2(componentRollup.warnings.reduce((sum, row) => sum + row.hnlAmount, 0));
    await upsertVerificationCheck(tx, shipmentId, {
      checkCode: 'COMPONENT_COST_ROLLUP',
      status: componentRollup.warnings.length === 0 ? 'PASS' : 'FAIL',
      expectedHnlAmount: componentRollup.warnings.length === 0 ? null : unallocatedComponentHnl,
      actualHnlAmount: componentRollup.warnings.length === 0 ? null : 0,
      varianceHnlAmount: componentRollup.warnings.length === 0 ? null : unallocatedComponentHnl,
      message:
        componentRollup.warnings.length === 0
          ? 'Fabric, conversion, and component costs are rolled into receiptable output lines.'
          : `${componentRollup.warnings.length} component line(s) could not be rolled into a receiptable output.`,
    });

    const invoiceHnlTotal = round2(lines.reduce((sum, line) => sum + line.hnlAmount, 0));
    const chargeHnlTotal = round2(charges.reduce((sum, charge) => sum + charge.hnlAmount, 0));
    const landedHnlTotal = round2(invoiceHnlTotal + chargeHnlTotal);
    const allocatedLandedTotal = round2(lineTotals.reduce((sum, line) => sum + line.landedLineCostHnl, 0));
    const variance = round2(allocatedLandedTotal - landedHnlTotal);
    const suggestedPriceCount = lineTotals.filter((lineTotal) => {
      const line = lineById.get(lineTotal.invoiceLineId);
      return Boolean(line && (line.targetType === 'INVOICE_LINE' || line.invoiceLineId));
    }).length;

    await upsertVerificationCheck(tx, shipmentId, {
      checkCode: 'ALLOCATION_RECONCILES',
      status: Math.abs(variance) <= 0.01 ? 'PASS' : 'FAIL',
      expectedHnlAmount: landedHnlTotal,
      actualHnlAmount: allocatedLandedTotal,
      varianceHnlAmount: variance,
      message:
        Math.abs(variance) <= 0.01
          ? 'Product-cost-share landed-cost allocation reconciles to shipment total.'
          : 'Allocated landed cost does not reconcile to invoice plus charge total.',
    });

    await tx.$executeRawUnsafe(
      `UPDATE app.import_shipment SET updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
      shipmentId,
    );

    return {
      shipmentId,
      invoiceHnlTotal,
      chargeHnlTotal,
      landedHnlTotal,
      allocationCount: allocations.length,
      suggestedPriceCount,
    };
  });

  await recordImportAudit({
    action: 'ALLOCATE_LANDED_COST',
    resourceType: 'import.shipment',
    resourceId: shipmentId,
    afterJson: result,
    metadataJson: { markupFactor },
  });

  return result;
}
