import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../prismaClient';
import { prisma as defaultPrisma } from '../db/prisma';
import { Err, Ok, type RepoError, type Result } from '../repositories/rics/repoResult';
import { recordPlatformAuditEvent } from './platformAuditService';
import * as purchaseOrderService from './purchaseOrderService';
import type { PurchaseOrder } from '../models/purchaseOrder';
import { create as createDraftSku } from './products/skuLifecycleService';
import { buildRicsImageUrl } from './ricsImageUrl';

const QUOTATION_TABLE = 'app.supplier_quotation';
const LINE_TABLE = 'app.supplier_quotation_line';
const RELATION_TABLE = 'app.supplier_quotation_line_relation';

const QUOTATION_STATUSES = new Set(['DRAFT', 'ACTIVE', 'ARCHIVED', 'CONVERTED']);
const DECISION_STATUSES = new Set(['NEW', 'ACCEPTED', 'REJECTED', 'HOLD']);
const RELATION_TYPES = new Set(['SIMILAR', 'SAME_ELEMENT', 'REPLACEMENT', 'COORDINATE', 'CARRYOVER']);
const TARGET_TYPES = new Set(['SKU', 'MATCHING_SET', 'QUOTE_LINE']);
const SOURCE_CURRENCIES = new Set(['HNL', 'USD', 'CNY']);
const INCOTERMS = new Set(['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']);

type DbClient = Pick<PrismaClient, '$queryRawUnsafe' | '$executeRawUnsafe' | '$transaction'>;
type TxClient = Pick<PrismaClient, '$queryRawUnsafe' | '$executeRawUnsafe'>;

export interface SupplierQuotationListFilters {
  q?: string | null;
  status?: string | null;
  vendorCode?: string | null;
  buyer?: string | null;
  pageSize?: number | null;
}

export interface SupplierQuotationInput {
  vendorCode?: string | null;
  buyer?: string | null;
  season?: string | null;
  chainId?: string | null;
  sourceCurrency?: string | null;
  fxRate?: number | null;
  fxDate?: string | null;
  incotermCode?: string | null;
  incotermPlace?: string | null;
  paymentTerms?: string | null;
  quoteDate?: string | null;
  validUntil?: string | null;
  leadTimeDays?: number | null;
  sourceDocumentRef?: string | null;
  notes?: string | null;
}

export interface SupplierQuotationLineInput {
  linkedSkuId?: string | null;
  supplierStyle?: string | null;
  supplierColorCode?: string | null;
  supplierColorName?: string | null;
  description?: string | null;
  familyCode?: string | null;
  categoryNumber?: number | null;
  colorFamilyValueId?: number | null;
  materialValueId?: number | null;
  styleElementValueId?: number | null;
  keywords?: string | null;
  imageUrl?: string | null;
  moqQty?: number | null;
  quotedQty?: number | null;
  unitCost?: number | null;
  estimatedLandedUnitCostHnl?: number | null;
  targetRetailHnl?: number | null;
  plannedReceiptDate?: string | null;
}

export interface SupplierQuotationRelationInput {
  relationType?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  note?: string | null;
}

export interface SupplierQuotationLineDecisionInput {
  decisionStatus?: string | null;
  reason?: string | null;
}

export interface SupplierQuotationListItem {
  id: string;
  quoteNumber: string;
  vendorCode: string;
  vendorName: string | null;
  buyer: string | null;
  season: string | null;
  chainId: string | null;
  chainLabel: string | null;
  sourceCurrency: string;
  quoteDate: string;
  validUntil: string | null;
  status: string;
  lineCount: number;
  acceptedLineCount: number;
  acceptedCostHnl: number;
  updatedAt: string;
}

export interface SupplierQuotationLine {
  id: string;
  quotationId: string;
  lineSequence: number;
  linkedSkuId: string | null;
  linkedSkuCode: string | null;
  linkedSkuProvisionalCode: string | null;
  supplierStyle: string;
  supplierColorCode: string | null;
  supplierColorName: string | null;
  description: string | null;
  familyCode: string | null;
  familyLabelEs: string | null;
  categoryNumber: number | null;
  categoryDescription: string | null;
  colorFamilyValueId: number | null;
  colorFamilyCode: string | null;
  colorFamilyLabelEs: string | null;
  materialValueId: number | null;
  materialCode: string | null;
  materialLabelEs: string | null;
  styleElementValueId: number | null;
  styleElementCode: string | null;
  styleElementLabelEs: string | null;
  keywords: string | null;
  imageUrl: string | null;
  moqQty: number | null;
  quotedQty: number | null;
  unitCost: number;
  estimatedLandedUnitCostHnl: number | null;
  targetRetailHnl: number | null;
  marginPct: number | null;
  plannedReceiptDate: string | null;
  decisionStatus: string;
  decisionReason: string | null;
  decisionAt: string | null;
  decisionBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierQuotationRelation {
  id: string;
  sourceLineId: string;
  relationType: string;
  targetType: string;
  targetId: string;
  note: string | null;
  title: string;
  subtitle: string | null;
  createdAt: string;
  createdBy: string;
}

export interface SupplierQuotationDetail extends SupplierQuotationListItem {
  fxRate: number;
  fxDate: string;
  incotermCode: string | null;
  incotermPlace: string | null;
  paymentTerms: string | null;
  leadTimeDays: number | null;
  sourceDocumentRef: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  updatedBy: string;
  lines: SupplierQuotationLine[];
  relations: SupplierQuotationRelation[];
}

export interface SupplierQuotationSimilarityCandidate {
  targetType: 'SKU' | 'MATCHING_SET' | 'QUOTE_LINE';
  targetId: string;
  relationType: string | null;
  manual: boolean;
  score: number;
  signals: string[];
  title: string;
  subtitle: string | null;
  vendorCode: string | null;
  vendorName: string | null;
  unitCost: number | null;
  retailPrice: number | null;
  imageUrl: string | null;
}

export interface SupplierQuotationConvertResult {
  purchaseOrders: PurchaseOrder[];
  createdSkuIds: string[];
}

interface QuotationRow {
  id: string;
  quote_number: string;
  vendor_code: string;
  vendor_name: string | null;
  buyer: string | null;
  season: string | null;
  chain_id: string | null;
  chain_label: string | null;
  source_currency: string;
  fx_rate: unknown;
  fx_date: Date | string;
  incoterm_code: string | null;
  incoterm_place: string | null;
  payment_terms: string | null;
  quote_date: Date | string;
  valid_until: Date | string | null;
  lead_time_days: number | null;
  status: string;
  source_document_ref: string | null;
  notes: string | null;
  line_count: number | bigint | null;
  accepted_line_count: number | bigint | null;
  accepted_cost_hnl: unknown;
  created_at: Date | string;
  created_by: string;
  updated_at: Date | string;
  updated_by: string;
}

interface QuotationLineRow {
  id: string;
  quotation_id: string;
  quote_number?: string;
  vendor_code?: string;
  vendor_name?: string | null;
  source_currency?: string;
  fx_rate?: unknown;
  fx_date?: Date | string;
  incoterm_code?: string | null;
  incoterm_place?: string | null;
  buyer?: string | null;
  season?: string | null;
  quotation_season?: string | null;
  line_sequence: number;
  linked_sku_id: string | null;
  linked_sku_code: string | null;
  linked_sku_provisional_code: string | null;
  supplier_style: string;
  supplier_color_code: string | null;
  supplier_color_name: string | null;
  description: string | null;
  family_code: string | null;
  family_label_es: string | null;
  category_number: number | null;
  category_description: string | null;
  color_family_value_id: number | null;
  color_family_code: string | null;
  color_family_label_es: string | null;
  material_value_id: number | null;
  material_code: string | null;
  material_label_es: string | null;
  style_element_value_id: number | null;
  style_element_code: string | null;
  style_element_label_es: string | null;
  keywords: string | null;
  image_url: string | null;
  moq_qty: number | null;
  quoted_qty: number | null;
  unit_cost: unknown;
  estimated_landed_unit_cost_hnl: unknown;
  target_retail_hnl: unknown;
  margin_pct: unknown;
  planned_receipt_date: Date | string | null;
  decision_status: string;
  decision_reason: string | null;
  decision_at: Date | string | null;
  decision_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawRelationRow {
  id: string;
  source_line_id: string;
  relation_type: string;
  target_type: string;
  target_id: string;
  note: string | null;
  title: string | null;
  subtitle: string | null;
  created_at: Date | string;
  created_by: string;
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  return Number(value);
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : toNumber(value);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateOnly(value: Date | string | null | undefined): string | null {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length > 0 ? s : null;
}

function cleanUpper(value: unknown): string | null {
  const s = cleanText(value);
  return s ? s.toUpperCase() : null;
}

function intOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function nonnegativeIntOrNull(value: unknown, field: string): number | null | RepoError {
  const n = intOrNull(value);
  if (n == null) return null;
  if (n < 0) return { kind: 'ConstraintViolation', message: `${field} must be non-negative.` };
  return n;
}

function moneyOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function decimal(value: unknown, fallback: number | null = null): number | null {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function calcMargin(targetRetail: number | null, landedCost: number | null): number | null {
  if (targetRetail == null || targetRetail <= 0 || landedCost == null) return null;
  return Number(((targetRetail - landedCost) / targetRetail).toFixed(4));
}

function mapDbError(err: unknown): RepoError {
  const message = err instanceof Error ? err.message : String(err);
  if (/duplicate key|unique constraint|already exists/i.test(message)) {
    return { kind: 'DuplicatePrimaryKey', message, cause: err };
  }
  if (/violates foreign key|check constraint|not-null constraint|invalid input/i.test(message)) {
    return { kind: 'ConstraintViolation', message, cause: err };
  }
  return { kind: 'AccessConnectionError', message, cause: err };
}

function mapQuotationListRow(row: QuotationRow): SupplierQuotationListItem {
  return {
    id: row.id,
    quoteNumber: row.quote_number,
    vendorCode: row.vendor_code,
    vendorName: row.vendor_name,
    buyer: row.buyer,
    season: row.season,
    chainId: row.chain_id,
    chainLabel: row.chain_label,
    sourceCurrency: row.source_currency,
    quoteDate: toDateOnly(row.quote_date) ?? '',
    validUntil: toDateOnly(row.valid_until),
    status: row.status,
    lineCount: Number(row.line_count ?? 0),
    acceptedLineCount: Number(row.accepted_line_count ?? 0),
    acceptedCostHnl: toNumber(row.accepted_cost_hnl ?? 0),
    updatedAt: toIso(row.updated_at) ?? '',
  };
}

function mapLineRow(row: QuotationLineRow): SupplierQuotationLine {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    lineSequence: Number(row.line_sequence),
    linkedSkuId: row.linked_sku_id,
    linkedSkuCode: row.linked_sku_code,
    linkedSkuProvisionalCode: row.linked_sku_provisional_code,
    supplierStyle: row.supplier_style,
    supplierColorCode: row.supplier_color_code,
    supplierColorName: row.supplier_color_name,
    description: row.description,
    familyCode: row.family_code,
    familyLabelEs: row.family_label_es,
    categoryNumber: row.category_number == null ? null : Number(row.category_number),
    categoryDescription: row.category_description,
    colorFamilyValueId: row.color_family_value_id == null ? null : Number(row.color_family_value_id),
    colorFamilyCode: row.color_family_code,
    colorFamilyLabelEs: row.color_family_label_es,
    materialValueId: row.material_value_id == null ? null : Number(row.material_value_id),
    materialCode: row.material_code,
    materialLabelEs: row.material_label_es,
    styleElementValueId: row.style_element_value_id == null ? null : Number(row.style_element_value_id),
    styleElementCode: row.style_element_code,
    styleElementLabelEs: row.style_element_label_es,
    keywords: row.keywords,
    imageUrl: row.image_url,
    moqQty: row.moq_qty == null ? null : Number(row.moq_qty),
    quotedQty: row.quoted_qty == null ? null : Number(row.quoted_qty),
    unitCost: toNumber(row.unit_cost),
    estimatedLandedUnitCostHnl: nullableNumber(row.estimated_landed_unit_cost_hnl),
    targetRetailHnl: nullableNumber(row.target_retail_hnl),
    marginPct: nullableNumber(row.margin_pct),
    plannedReceiptDate: toIso(row.planned_receipt_date),
    decisionStatus: row.decision_status,
    decisionReason: row.decision_reason,
    decisionAt: toIso(row.decision_at),
    decisionBy: row.decision_by,
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? '',
  };
}

function mapRelationRow(row: RawRelationRow): SupplierQuotationRelation {
  return {
    id: row.id,
    sourceLineId: row.source_line_id,
    relationType: row.relation_type,
    targetType: row.target_type,
    targetId: row.target_id,
    note: row.note,
    title: row.title ?? row.target_id,
    subtitle: row.subtitle,
    createdAt: toIso(row.created_at) ?? '',
    createdBy: row.created_by,
  };
}

async function recordAudit(
  client: DbClient,
  actor: string,
  action: string,
  resourceId: string,
  afterJson: unknown,
): Promise<void> {
  await recordPlatformAuditEvent(client as PrismaClient, {
    eventType: `purchasing.supplier_quotation.${action}`,
    action: action.toUpperCase(),
    resourceType: 'purchasing.supplier_quotation',
    resourceId,
    afterJson,
    metadataJson: { module: 'purchasing', actor },
  });
}

async function vendorExists(client: DbClient | TxClient, vendorCode: string): Promise<boolean> {
  const rows = await client.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM app.vendor WHERE code = $1) AS exists`,
    vendorCode,
  );
  return rows[0]?.exists === true;
}

async function loadQuotationHeader(client: DbClient | TxClient, id: string): Promise<QuotationRow | null> {
  const rows = await client.$queryRawUnsafe<QuotationRow[]>(
    `
      SELECT
        q.*,
        COALESCE(v.short_name, v.mail_name) AS vendor_name,
        sg.label AS chain_label,
        COUNT(l.id)::int AS line_count,
        COUNT(l.id) FILTER (WHERE l.decision_status = 'ACCEPTED')::int AS accepted_line_count,
        COALESCE(SUM(COALESCE(l.estimated_landed_unit_cost_hnl, l.unit_cost * q.fx_rate) * COALESCE(NULLIF(l.quoted_qty, 0), NULLIF(l.moq_qty, 0), 1))
          FILTER (WHERE l.decision_status = 'ACCEPTED'), 0) AS accepted_cost_hnl
      FROM app.supplier_quotation q
      JOIN app.vendor v ON v.code = q.vendor_code
      LEFT JOIN app.store_group sg ON sg.code = q.chain_id
      LEFT JOIN app.supplier_quotation_line l ON l.quotation_id = q.id
      WHERE q.id = $1::uuid
      GROUP BY q.id, v.short_name, v.mail_name, sg.label
    `,
    id,
  );
  return rows[0] ?? null;
}

async function loadQuotationLines(client: DbClient | TxClient, quotationId: string): Promise<QuotationLineRow[]> {
  return client.$queryRawUnsafe<QuotationLineRow[]>(
    `
      SELECT
        l.*,
        s.code AS linked_sku_code,
        s.provisional_code AS linked_sku_provisional_code,
        pf.label_es AS family_label_es,
        c."desc" AS category_description,
        cf.code AS color_family_code,
        cf.label_es AS color_family_label_es,
        mv.code AS material_code,
        mv.label_es AS material_label_es,
        sev.code AS style_element_code,
        sev.label_es AS style_element_label_es
      FROM app.supplier_quotation_line l
      LEFT JOIN app.sku s ON s.id = l.linked_sku_id
      LEFT JOIN app.product_family pf ON pf.code = l.family_code
      LEFT JOIN app.taxonomy_category c ON c.number = l.category_number
      LEFT JOIN app.attribute_value cf ON cf.id = l.color_family_value_id
      LEFT JOIN app.attribute_value mv ON mv.id = l.material_value_id
      LEFT JOIN app.attribute_value sev ON sev.id = l.style_element_value_id
      WHERE l.quotation_id = $1::uuid
      ORDER BY l.line_sequence ASC
    `,
    quotationId,
  );
}

async function loadLine(client: DbClient | TxClient, lineId: string): Promise<QuotationLineRow | null> {
  const rows = await client.$queryRawUnsafe<QuotationLineRow[]>(
    `
      SELECT
        l.*,
        q.quote_number,
        q.vendor_code,
        COALESCE(v.short_name, v.mail_name) AS vendor_name,
        q.source_currency,
        q.fx_rate,
        q.fx_date,
        q.incoterm_code,
        q.incoterm_place,
        q.buyer,
        q.season AS quotation_season,
        s.code AS linked_sku_code,
        s.provisional_code AS linked_sku_provisional_code,
        pf.label_es AS family_label_es,
        c."desc" AS category_description,
        cf.code AS color_family_code,
        cf.label_es AS color_family_label_es,
        mv.code AS material_code,
        mv.label_es AS material_label_es,
        sev.code AS style_element_code,
        sev.label_es AS style_element_label_es
      FROM app.supplier_quotation_line l
      JOIN app.supplier_quotation q ON q.id = l.quotation_id
      JOIN app.vendor v ON v.code = q.vendor_code
      LEFT JOIN app.sku s ON s.id = l.linked_sku_id
      LEFT JOIN app.product_family pf ON pf.code = l.family_code
      LEFT JOIN app.taxonomy_category c ON c.number = l.category_number
      LEFT JOIN app.attribute_value cf ON cf.id = l.color_family_value_id
      LEFT JOIN app.attribute_value mv ON mv.id = l.material_value_id
      LEFT JOIN app.attribute_value sev ON sev.id = l.style_element_value_id
      WHERE l.id = $1::uuid
    `,
    lineId,
  );
  return rows[0] ?? null;
}

async function loadRelations(client: DbClient | TxClient, sourceLineIds: string[]): Promise<SupplierQuotationRelation[]> {
  if (sourceLineIds.length === 0) return [];
  const rows = await client.$queryRawUnsafe<RawRelationRow[]>(
    `
      SELECT
        r.id,
        r.source_line_id,
        r.relation_type,
        r.target_type,
        COALESCE(r.target_sku_id::text, r.target_matching_set_id::text, r.target_quotation_line_id::text) AS target_id,
        r.note,
        CASE
          WHEN r.target_type = 'SKU' THEN COALESCE(ts.code, ts.provisional_code)
          WHEN r.target_type = 'MATCHING_SET' THEN ms.code
          ELSE ql.supplier_style
        END AS title,
        CASE
          WHEN r.target_type = 'SKU' THEN COALESCE(ts.description_rics, ts.description_web)
          WHEN r.target_type = 'MATCHING_SET' THEN ms.description_es
          ELSE COALESCE(qv.short_name, qv.mail_name) || ' - ' || q.quote_number
        END AS subtitle,
        r.created_at,
        r.created_by
      FROM app.supplier_quotation_line_relation r
      LEFT JOIN app.sku ts ON ts.id = r.target_sku_id
      LEFT JOIN app.matching_set ms ON ms.id = r.target_matching_set_id
      LEFT JOIN app.supplier_quotation_line ql ON ql.id = r.target_quotation_line_id
      LEFT JOIN app.supplier_quotation q ON q.id = ql.quotation_id
      LEFT JOIN app.vendor qv ON qv.code = q.vendor_code
      WHERE r.source_line_id = ANY($1::uuid[])
      ORDER BY r.created_at DESC
    `,
    sourceLineIds,
  );
  return rows.map(mapRelationRow);
}

function quotationPatchColumns(input: Partial<SupplierQuotationInput>): { sets: string[]; values: unknown[]; error: RepoError | null } {
  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown, cast = '') => {
    values.push(value);
    sets.push(`${column} = $${values.length}${cast}`);
  };

  if (input.vendorCode !== undefined) {
    const vendorCode = cleanUpper(input.vendorCode);
    if (!vendorCode) return { sets, values, error: { kind: 'ConstraintViolation', message: 'vendorCode is required.' } };
    add('vendor_code', vendorCode);
  }
  if (input.buyer !== undefined) add('buyer', cleanText(input.buyer));
  if (input.season !== undefined) add('season', cleanUpper(input.season));
  if (input.chainId !== undefined) add('chain_id', cleanText(input.chainId));
  if (input.sourceCurrency !== undefined) {
    const currency = cleanUpper(input.sourceCurrency) ?? 'HNL';
    if (!SOURCE_CURRENCIES.has(currency)) return { sets, values, error: { kind: 'ConstraintViolation', message: 'Unsupported source currency.' } };
    add('source_currency', currency);
  }
  if (input.fxRate !== undefined) {
    const fxRate = decimal(input.fxRate, 1);
    if (fxRate == null || fxRate <= 0) return { sets, values, error: { kind: 'ConstraintViolation', message: 'fxRate must be greater than zero.' } };
    add('fx_rate', fxRate, '::numeric');
  }
  if (input.fxDate !== undefined) add('fx_date', cleanText(input.fxDate), '::date');
  if (input.incotermCode !== undefined) {
    const incoterm = cleanUpper(input.incotermCode);
    if (incoterm && !INCOTERMS.has(incoterm)) return { sets, values, error: { kind: 'ConstraintViolation', message: 'Unsupported incoterm.' } };
    add('incoterm_code', incoterm);
  }
  if (input.incotermPlace !== undefined) add('incoterm_place', cleanText(input.incotermPlace));
  if (input.paymentTerms !== undefined) add('payment_terms', cleanText(input.paymentTerms));
  if (input.quoteDate !== undefined) add('quote_date', cleanText(input.quoteDate), '::date');
  if (input.validUntil !== undefined) add('valid_until', cleanText(input.validUntil), '::date');
  if (input.leadTimeDays !== undefined) {
    const lead = nonnegativeIntOrNull(input.leadTimeDays, 'leadTimeDays');
    if (lead && typeof lead === 'object') return { sets, values, error: lead };
    add('lead_time_days', lead);
  }
  if (input.sourceDocumentRef !== undefined) add('source_document_ref', cleanText(input.sourceDocumentRef));
  if (input.notes !== undefined) add('notes', cleanText(input.notes));

  return { sets, values, error: null };
}

function linePatchColumns(input: Partial<SupplierQuotationLineInput>): { sets: string[]; values: unknown[]; error: RepoError | null } {
  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown, cast = '') => {
    values.push(value);
    sets.push(`${column} = $${values.length}${cast}`);
  };

  if (input.linkedSkuId !== undefined) add('linked_sku_id', cleanText(input.linkedSkuId), '::uuid');
  if (input.supplierStyle !== undefined) {
    const style = cleanText(input.supplierStyle);
    if (!style) return { sets, values, error: { kind: 'ConstraintViolation', message: 'supplierStyle is required.' } };
    add('supplier_style', style);
  }
  if (input.supplierColorCode !== undefined) add('supplier_color_code', cleanUpper(input.supplierColorCode));
  if (input.supplierColorName !== undefined) add('supplier_color_name', cleanText(input.supplierColorName));
  if (input.description !== undefined) add('description', cleanText(input.description));
  if (input.familyCode !== undefined) add('family_code', cleanText(input.familyCode));
  if (input.categoryNumber !== undefined) add('category_number', intOrNull(input.categoryNumber));
  if (input.colorFamilyValueId !== undefined) add('color_family_value_id', intOrNull(input.colorFamilyValueId));
  if (input.materialValueId !== undefined) add('material_value_id', intOrNull(input.materialValueId));
  if (input.styleElementValueId !== undefined) add('style_element_value_id', intOrNull(input.styleElementValueId));
  if (input.keywords !== undefined) add('keywords', cleanText(input.keywords));
  if (input.imageUrl !== undefined) add('image_url', cleanText(input.imageUrl));
  if (input.moqQty !== undefined) {
    const v = nonnegativeIntOrNull(input.moqQty, 'moqQty');
    if (v && typeof v === 'object') return { sets, values, error: v };
    add('moq_qty', v);
  }
  if (input.quotedQty !== undefined) {
    const v = nonnegativeIntOrNull(input.quotedQty, 'quotedQty');
    if (v && typeof v === 'object') return { sets, values, error: v };
    add('quoted_qty', v);
  }
  if (input.unitCost !== undefined) {
    const v = moneyOrNull(input.unitCost);
    if (v == null || v < 0) return { sets, values, error: { kind: 'ConstraintViolation', message: 'unitCost must be non-negative.' } };
    add('unit_cost', v, '::numeric');
  }
  if (input.estimatedLandedUnitCostHnl !== undefined) {
    const v = moneyOrNull(input.estimatedLandedUnitCostHnl);
    if (v != null && v < 0) return { sets, values, error: { kind: 'ConstraintViolation', message: 'estimatedLandedUnitCostHnl must be non-negative.' } };
    add('estimated_landed_unit_cost_hnl', v, '::numeric');
  }
  if (input.targetRetailHnl !== undefined) {
    const v = moneyOrNull(input.targetRetailHnl);
    if (v != null && v < 0) return { sets, values, error: { kind: 'ConstraintViolation', message: 'targetRetailHnl must be non-negative.' } };
    add('target_retail_hnl', v, '::numeric');
  }
  if (input.plannedReceiptDate !== undefined) add('planned_receipt_date', cleanText(input.plannedReceiptDate), '::timestamptz');

  return { sets, values, error: null };
}

function tokenize(...parts: Array<string | null | undefined>): Set<string> {
  const text = parts.filter(Boolean).join(' ').toLowerCase();
  return new Set(text.split(/[^a-z0-9]+/).filter((x) => x.length >= 2));
}

function hasOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) if (b.has(item)) return true;
  return false;
}

function styleSignal(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  return na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na));
}

interface SimilarityLineLike {
  familyCode: string | null;
  categoryNumber: number | null;
  supplierStyle: string | null;
  supplierColorCode: string | null;
  supplierColorName: string | null;
  materialCode: string | null;
  materialLabelEs?: string | null;
  styleElementCode: string | null;
  styleElementLabelEs?: string | null;
  keywords: string | null;
  season?: string | null;
}

export function scoreQuoteLineSimilarity(
  source: SimilarityLineLike,
  candidate: SimilarityLineLike,
): string[] {
  if (!source.familyCode || source.familyCode !== candidate.familyCode) return [];
  const signals: string[] = [];
  if (source.categoryNumber != null && source.categoryNumber === candidate.categoryNumber) signals.push('category');
  if (styleSignal(source.supplierStyle, candidate.supplierStyle)) signals.push('vendor-style');
  if (
    styleSignal(source.supplierColorCode, candidate.supplierColorCode)
    || styleSignal(source.supplierColorName, candidate.supplierColorName)
  ) signals.push('color');
  if (source.materialCode && source.materialCode === candidate.materialCode) signals.push('material');
  if (source.styleElementCode && source.styleElementCode === candidate.styleElementCode) signals.push('style-element');
  if (source.season && source.season === candidate.season) signals.push('season');
  if (hasOverlap(tokenize(source.keywords), tokenize(candidate.keywords))) signals.push('keywords');
  return signals;
}

export function createSupplierQuotationService(
  opts: {
    prisma?: DbClient;
    createPurchaseOrder?: typeof purchaseOrderService.createPurchaseOrder;
    createDraftSku?: typeof createDraftSku;
  } = {},
) {
  const client = opts.prisma ?? defaultPrisma;
  const createPurchaseOrder = opts.createPurchaseOrder ?? purchaseOrderService.createPurchaseOrder;
  const createSku = opts.createDraftSku ?? createDraftSku;

  return {
    async list(filters: SupplierQuotationListFilters = {}): Promise<Result<SupplierQuotationListItem[]>> {
      try {
        const conditions: string[] = [];
        const values: unknown[] = [];
        const status = cleanUpper(filters.status);
        if (status && status !== 'ALL') {
          if (!QUOTATION_STATUSES.has(status)) return Err({ kind: 'ConstraintViolation', message: 'Invalid quotation status.' });
          values.push(status);
          conditions.push(`q.status = $${values.length}`);
        }
        const vendorCode = cleanUpper(filters.vendorCode);
        if (vendorCode) {
          values.push(vendorCode);
          conditions.push(`q.vendor_code = $${values.length}`);
        }
        const buyer = cleanText(filters.buyer);
        if (buyer) {
          values.push(`%${buyer}%`);
          conditions.push(`q.buyer ILIKE $${values.length}`);
        }
        const q = cleanText(filters.q);
        if (q) {
          values.push(`%${q}%`);
          const idx = values.length;
          conditions.push(`(q.quote_number ILIKE $${idx} OR q.notes ILIKE $${idx} OR q.source_document_ref ILIKE $${idx} OR v.short_name ILIKE $${idx} OR v.mail_name ILIKE $${idx})`);
        }
        const limit = Math.min(Math.max(Number(filters.pageSize ?? 50), 1), 200);
        values.push(limit);
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const rows = await client.$queryRawUnsafe<QuotationRow[]>(
          `
            SELECT
              q.*,
              COALESCE(v.short_name, v.mail_name) AS vendor_name,
              sg.label AS chain_label,
              COUNT(l.id)::int AS line_count,
              COUNT(l.id) FILTER (WHERE l.decision_status = 'ACCEPTED')::int AS accepted_line_count,
              COALESCE(SUM(COALESCE(l.estimated_landed_unit_cost_hnl, l.unit_cost * q.fx_rate) * COALESCE(NULLIF(l.quoted_qty, 0), NULLIF(l.moq_qty, 0), 1))
                FILTER (WHERE l.decision_status = 'ACCEPTED'), 0) AS accepted_cost_hnl
            FROM app.supplier_quotation q
            JOIN app.vendor v ON v.code = q.vendor_code
            LEFT JOIN app.store_group sg ON sg.code = q.chain_id
            LEFT JOIN app.supplier_quotation_line l ON l.quotation_id = q.id
            ${where}
            GROUP BY q.id, v.short_name, v.mail_name, sg.label
            ORDER BY q.updated_at DESC
            LIMIT $${values.length}
          `,
          ...values,
        );
        return Ok(rows.map(mapQuotationListRow));
      } catch (err) {
        return Err(mapDbError(err));
      }
    },

    async get(id: string): Promise<Result<SupplierQuotationDetail>> {
      try {
        const header = await loadQuotationHeader(client, id);
        if (!header) return Err({ kind: 'NotFound', message: `Supplier quotation ${id} not found.` });
        const lineRows = await loadQuotationLines(client, id);
        const lines = lineRows.map(mapLineRow);
        const relations = await loadRelations(client, lines.map((line) => line.id));
        return Ok({
          ...mapQuotationListRow(header),
          fxRate: toNumber(header.fx_rate),
          fxDate: toDateOnly(header.fx_date) ?? '',
          incotermCode: header.incoterm_code,
          incotermPlace: header.incoterm_place,
          paymentTerms: header.payment_terms,
          leadTimeDays: header.lead_time_days,
          sourceDocumentRef: header.source_document_ref,
          notes: header.notes,
          createdAt: toIso(header.created_at) ?? '',
          createdBy: header.created_by,
          updatedBy: header.updated_by,
          lines,
          relations,
        });
      } catch (err) {
        return Err(mapDbError(err));
      }
    },

    async create(input: SupplierQuotationInput, actor: string): Promise<Result<SupplierQuotationDetail>> {
      const vendorCode = cleanUpper(input.vendorCode);
      if (!vendorCode) return Err({ kind: 'ConstraintViolation', message: 'vendorCode is required.' });
      if (!(await vendorExists(client, vendorCode))) {
        return Err({ kind: 'ConstraintViolation', message: `Vendor ${vendorCode} does not exist.` });
      }
      const patch = quotationPatchColumns({ ...input, vendorCode });
      if (patch.error) return Err(patch.error);
      try {
        const inserted = await client.$queryRawUnsafe<Array<{ id: string }>>(
          `
            INSERT INTO app.supplier_quotation (
              id, quote_number, vendor_code, buyer, season, chain_id,
              source_currency, fx_rate, fx_date, incoterm_code, incoterm_place,
              payment_terms, quote_date, valid_until, lead_time_days,
              source_document_ref, notes, created_by, updated_by
            ) VALUES (
              $1::uuid,
              'SQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('app.supplier_quotation_number_seq')::text, 6, '0'),
              $2, $3, $4, $5,
              $6, $7::numeric, COALESCE($8::date, CURRENT_DATE), $9, $10,
              $11, COALESCE($12::date, CURRENT_DATE), $13::date, $14,
              $15, $16, $17, $17
            )
            RETURNING id::text
          `,
          randomUUID(),
          vendorCode,
          cleanText(input.buyer),
          cleanUpper(input.season),
          cleanText(input.chainId),
          cleanUpper(input.sourceCurrency) ?? 'HNL',
          decimal(input.fxRate, 1),
          cleanText(input.fxDate),
          cleanUpper(input.incotermCode),
          cleanText(input.incotermPlace),
          cleanText(input.paymentTerms),
          cleanText(input.quoteDate),
          cleanText(input.validUntil),
          intOrNull(input.leadTimeDays),
          cleanText(input.sourceDocumentRef),
          cleanText(input.notes),
          actor,
        );
        const id = inserted[0]?.id;
        await recordAudit(client, actor, 'create', id, input);
        return this.get(id);
      } catch (err) {
        return Err(mapDbError(err));
      }
    },

    async update(id: string, input: Partial<SupplierQuotationInput>, actor: string): Promise<Result<SupplierQuotationDetail>> {
      const existing = await loadQuotationHeader(client, id);
      if (!existing) return Err({ kind: 'NotFound', message: `Supplier quotation ${id} not found.` });
      if (existing.status === 'ARCHIVED') {
        return Err({ kind: 'ConstraintViolation', message: 'Archived quotations cannot be edited.' });
      }
      if (input.vendorCode !== undefined) {
        const vendorCode = cleanUpper(input.vendorCode);
        if (!vendorCode || !(await vendorExists(client, vendorCode))) {
          return Err({ kind: 'ConstraintViolation', message: `Vendor ${vendorCode ?? ''} does not exist.` });
        }
      }
      const patch = quotationPatchColumns(input);
      if (patch.error) return Err(patch.error);
      if (patch.sets.length === 0) return this.get(id);
      patch.values.push(actor, id);
      try {
        await client.$executeRawUnsafe(
          `UPDATE app.supplier_quotation SET ${patch.sets.join(', ')}, updated_by = $${patch.values.length - 1}, updated_at = now() WHERE id = $${patch.values.length}::uuid`,
          ...patch.values,
        );
        await recordAudit(client, actor, 'update', id, input);
        return this.get(id);
      } catch (err) {
        return Err(mapDbError(err));
      }
    },

    async archive(id: string, actor: string): Promise<Result<SupplierQuotationDetail>> {
      try {
        const existing = await loadQuotationHeader(client, id);
        if (!existing) return Err({ kind: 'NotFound', message: `Supplier quotation ${id} not found.` });
        await client.$executeRawUnsafe(
          `UPDATE app.supplier_quotation SET status = 'ARCHIVED', updated_by = $2, updated_at = now() WHERE id = $1::uuid`,
          id,
          actor,
        );
        await recordAudit(client, actor, 'archive', id, { status: 'ARCHIVED' });
        return this.get(id);
      } catch (err) {
        return Err(mapDbError(err));
      }
    },

    async addLine(quotationId: string, input: SupplierQuotationLineInput, actor: string): Promise<Result<SupplierQuotationLine>> {
      const quotation = await loadQuotationHeader(client, quotationId);
      if (!quotation) return Err({ kind: 'NotFound', message: `Supplier quotation ${quotationId} not found.` });
      if (quotation.status === 'ARCHIVED') return Err({ kind: 'ConstraintViolation', message: 'Archived quotations cannot be edited.' });
      const supplierStyle = cleanText(input.supplierStyle);
      if (!supplierStyle) return Err({ kind: 'ConstraintViolation', message: 'supplierStyle is required.' });
      const unitCost = moneyOrNull(input.unitCost);
      if (unitCost == null || unitCost < 0) return Err({ kind: 'ConstraintViolation', message: 'unitCost is required and must be non-negative.' });
      const moq = nonnegativeIntOrNull(input.moqQty, 'moqQty');
      if (moq && typeof moq === 'object') return Err(moq);
      const qty = nonnegativeIntOrNull(input.quotedQty, 'quotedQty');
      if (qty && typeof qty === 'object') return Err(qty);
      const estimated = moneyOrNull(input.estimatedLandedUnitCostHnl);
      const targetRetail = moneyOrNull(input.targetRetailHnl);
      try {
        const inserted = await client.$transaction(async (tx) => {
          const sequenceRows = await (tx as TxClient).$queryRawUnsafe<Array<{ next_sequence: number }>>(
            `SELECT COALESCE(MAX(line_sequence), 0)::int + 1 AS next_sequence FROM app.supplier_quotation_line WHERE quotation_id = $1::uuid`,
            quotationId,
          );
          const lineRows = await (tx as TxClient).$queryRawUnsafe<Array<{ id: string }>>(
            `
              INSERT INTO app.supplier_quotation_line (
                id, quotation_id, line_sequence, linked_sku_id, supplier_style,
                supplier_color_code, supplier_color_name, description, family_code,
                category_number, color_family_value_id, material_value_id,
                style_element_value_id, keywords, image_url, moq_qty, quoted_qty,
                unit_cost, estimated_landed_unit_cost_hnl, target_retail_hnl, margin_pct,
                planned_receipt_date, created_by, updated_by
              ) VALUES (
                $1::uuid, $2::uuid, $3, $4::uuid, $5,
                $6, $7, $8, $9,
                $10, $11, $12,
                $13, $14, $15, $16, $17,
                $18::numeric, $19::numeric, $20::numeric, $21::numeric,
                $22::timestamptz, $23, $23
              )
              RETURNING id::text
            `,
            randomUUID(),
            quotationId,
            sequenceRows[0]?.next_sequence ?? 1,
            cleanText(input.linkedSkuId),
            supplierStyle,
            cleanUpper(input.supplierColorCode),
            cleanText(input.supplierColorName),
            cleanText(input.description),
            cleanText(input.familyCode),
            intOrNull(input.categoryNumber),
            intOrNull(input.colorFamilyValueId),
            intOrNull(input.materialValueId),
            intOrNull(input.styleElementValueId),
            cleanText(input.keywords),
            cleanText(input.imageUrl),
            moq,
            qty,
            unitCost,
            estimated,
            targetRetail,
            calcMargin(targetRetail, estimated ?? unitCost * toNumber(quotation.fx_rate)),
            cleanText(input.plannedReceiptDate),
            actor,
          );
          await (tx as TxClient).$executeRawUnsafe(
            `UPDATE app.supplier_quotation SET updated_by = $2, updated_at = now() WHERE id = $1::uuid`,
            quotationId,
            actor,
          );
          return lineRows[0]?.id;
        });
        await recordAudit(client, actor, 'line.create', quotationId, input);
        const line = await loadLine(client, inserted);
        return line ? Ok(mapLineRow(line)) : Err({ kind: 'NotFound', message: 'Created line could not be loaded.' });
      } catch (err) {
        return Err(mapDbError(err));
      }
    },

    async updateLine(lineId: string, input: Partial<SupplierQuotationLineInput>, actor: string): Promise<Result<SupplierQuotationLine>> {
      const existing = await loadLine(client, lineId);
      if (!existing) return Err({ kind: 'NotFound', message: `Supplier quotation line ${lineId} not found.` });
      const patch = linePatchColumns(input);
      if (patch.error) return Err(patch.error);
      if (input.estimatedLandedUnitCostHnl !== undefined || input.targetRetailHnl !== undefined || input.unitCost !== undefined) {
        const landed = input.estimatedLandedUnitCostHnl !== undefined
          ? moneyOrNull(input.estimatedLandedUnitCostHnl)
          : nullableNumber(existing.estimated_landed_unit_cost_hnl);
        const retail = input.targetRetailHnl !== undefined
          ? moneyOrNull(input.targetRetailHnl)
          : nullableNumber(existing.target_retail_hnl);
        patch.values.push(calcMargin(retail, landed ?? moneyOrNull(input.unitCost) ?? toNumber(existing.unit_cost)));
        patch.sets.push(`margin_pct = $${patch.values.length}::numeric`);
      }
      if (patch.sets.length === 0) return Ok(mapLineRow(existing));
      patch.values.push(actor, lineId);
      try {
        await client.$executeRawUnsafe(
          `UPDATE app.supplier_quotation_line SET ${patch.sets.join(', ')}, updated_by = $${patch.values.length - 1}, updated_at = now() WHERE id = $${patch.values.length}::uuid`,
          ...patch.values,
        );
        await client.$executeRawUnsafe(
          `UPDATE app.supplier_quotation q SET updated_by = $2, updated_at = now()
           FROM app.supplier_quotation_line l WHERE l.quotation_id = q.id AND l.id = $1::uuid`,
          lineId,
          actor,
        );
        await recordAudit(client, actor, 'line.update', existing.quotation_id, input);
        const updated = await loadLine(client, lineId);
        return updated ? Ok(mapLineRow(updated)) : Err({ kind: 'NotFound', message: `Supplier quotation line ${lineId} not found.` });
      } catch (err) {
        return Err(mapDbError(err));
      }
    },

    async deleteLine(lineId: string, actor: string): Promise<Result<void>> {
      try {
        const existing = await loadLine(client, lineId);
        if (!existing) return Err({ kind: 'NotFound', message: `Supplier quotation line ${lineId} not found.` });
        await client.$executeRawUnsafe(`DELETE FROM app.supplier_quotation_line WHERE id = $1::uuid`, lineId);
        await client.$executeRawUnsafe(
          `UPDATE app.supplier_quotation SET updated_by = $2, updated_at = now() WHERE id = $1::uuid`,
          existing.quotation_id,
          actor,
        );
        await recordAudit(client, actor, 'line.delete', existing.quotation_id, { lineId });
        return Ok(undefined);
      } catch (err) {
        return Err(mapDbError(err));
      }
    },

    async decideLine(lineId: string, input: SupplierQuotationLineDecisionInput, actor: string): Promise<Result<SupplierQuotationLine>> {
      const status = cleanUpper(input.decisionStatus);
      if (!status || !DECISION_STATUSES.has(status)) return Err({ kind: 'ConstraintViolation', message: 'Invalid decision status.' });
      try {
        const existing = await loadLine(client, lineId);
        if (!existing) return Err({ kind: 'NotFound', message: `Supplier quotation line ${lineId} not found.` });
        await client.$executeRawUnsafe(
          `
            UPDATE app.supplier_quotation_line
            SET decision_status = $2,
                decision_reason = $3,
                decision_at = now(),
                decision_by = $4,
                updated_by = $4,
                updated_at = now()
            WHERE id = $1::uuid
          `,
          lineId,
          status,
          cleanText(input.reason),
          actor,
        );
        await client.$executeRawUnsafe(
          `UPDATE app.supplier_quotation SET updated_by = $2, updated_at = now() WHERE id = $1::uuid`,
          existing.quotation_id,
          actor,
        );
        await recordAudit(client, actor, 'line.decision', existing.quotation_id, { lineId, status, reason: input.reason });
        const updated = await loadLine(client, lineId);
        return updated ? Ok(mapLineRow(updated)) : Err({ kind: 'NotFound', message: `Supplier quotation line ${lineId} not found.` });
      } catch (err) {
        return Err(mapDbError(err));
      }
    },

    async addRelation(lineId: string, input: SupplierQuotationRelationInput, actor: string): Promise<Result<SupplierQuotationRelation>> {
      const relationType = cleanUpper(input.relationType) ?? 'SIMILAR';
      const targetType = cleanUpper(input.targetType);
      const targetId = cleanText(input.targetId);
      if (!RELATION_TYPES.has(relationType)) return Err({ kind: 'ConstraintViolation', message: 'Invalid relation type.' });
      if (!targetType || !TARGET_TYPES.has(targetType)) return Err({ kind: 'ConstraintViolation', message: 'Invalid target type.' });
      if (!targetId) return Err({ kind: 'ConstraintViolation', message: 'targetId is required.' });
      if (targetType === 'QUOTE_LINE' && targetId === lineId) {
        return Err({ kind: 'ConstraintViolation', message: 'A quote line cannot relate to itself.' });
      }
      try {
        const existing = await loadLine(client, lineId);
        if (!existing) return Err({ kind: 'NotFound', message: `Supplier quotation line ${lineId} not found.` });
        const inserted = await client.$queryRawUnsafe<Array<{ id: string }>>(
          `
            INSERT INTO app.supplier_quotation_line_relation (
              id, source_line_id, relation_type, target_type,
              target_sku_id, target_matching_set_id, target_quotation_line_id,
              note, created_by
            ) VALUES (
              $1::uuid, $2::uuid, $3, $4,
              CASE WHEN $4 = 'SKU' THEN $5::uuid ELSE NULL END,
              CASE WHEN $4 = 'MATCHING_SET' THEN $5::uuid ELSE NULL END,
              CASE WHEN $4 = 'QUOTE_LINE' THEN $5::uuid ELSE NULL END,
              $6, $7
            )
            RETURNING id::text
          `,
          randomUUID(),
          lineId,
          relationType,
          targetType,
          targetId,
          cleanText(input.note),
          actor,
        );
        await recordAudit(client, actor, 'relation.create', existing.quotation_id, { lineId, relationType, targetType, targetId });
        const relations = await loadRelations(client, [lineId]);
        const created = relations.find((relation) => relation.id === inserted[0]?.id);
        return created ? Ok(created) : Err({ kind: 'NotFound', message: 'Created relation could not be loaded.' });
      } catch (err) {
        return Err(mapDbError(err));
      }
    },

    async removeRelation(relationId: string, actor: string): Promise<Result<void>> {
      try {
        const rows = await client.$queryRawUnsafe<Array<{ source_line_id: string; quotation_id: string }>>(
          `
            DELETE FROM app.supplier_quotation_line_relation r
            USING app.supplier_quotation_line l
            WHERE r.id = $1::uuid AND l.id = r.source_line_id
            RETURNING r.source_line_id::text, l.quotation_id::text
          `,
          relationId,
        );
        if (!rows[0]) return Err({ kind: 'NotFound', message: `Supplier quotation relation ${relationId} not found.` });
        await recordAudit(client, actor, 'relation.delete', rows[0].quotation_id, { relationId });
        return Ok(undefined);
      } catch (err) {
        return Err(mapDbError(err));
      }
    },

    async similarity(lineId: string): Promise<Result<SupplierQuotationSimilarityCandidate[]>> {
      try {
        const sourceRow = await loadLine(client, lineId);
        if (!sourceRow) return Err({ kind: 'NotFound', message: `Supplier quotation line ${lineId} not found.` });
        const source = mapLineRow(sourceRow);
        const sourceSeason = sourceRow.quotation_season ?? sourceRow.season ?? null;
        const manualRelations = await loadRelations(client, [lineId]);
        const out = new Map<string, SupplierQuotationSimilarityCandidate>();

        for (const relation of manualRelations) {
          const key = `${relation.targetType}:${relation.targetId}`;
          out.set(key, {
            targetType: relation.targetType as SupplierQuotationSimilarityCandidate['targetType'],
            targetId: relation.targetId,
            relationType: relation.relationType,
            manual: true,
            score: 999,
            signals: ['manual'],
            title: relation.title,
            subtitle: relation.subtitle,
            vendorCode: null,
            vendorName: null,
            unitCost: null,
            retailPrice: null,
            imageUrl: null,
          });
        }

        if (source.familyCode) {
          const quoteRows = await client.$queryRawUnsafe<QuotationLineRow[]>(
            `
              SELECT
                l.*,
                q.quote_number,
                q.vendor_code,
                COALESCE(v.short_name, v.mail_name) AS vendor_name,
                s.code AS linked_sku_code,
                s.provisional_code AS linked_sku_provisional_code,
                pf.label_es AS family_label_es,
                c."desc" AS category_description,
                cf.code AS color_family_code,
                cf.label_es AS color_family_label_es,
                mv.code AS material_code,
                mv.label_es AS material_label_es,
                sev.code AS style_element_code,
                sev.label_es AS style_element_label_es
              FROM app.supplier_quotation_line l
              JOIN app.supplier_quotation q ON q.id = l.quotation_id
              JOIN app.vendor v ON v.code = q.vendor_code
              LEFT JOIN app.sku s ON s.id = l.linked_sku_id
              LEFT JOIN app.product_family pf ON pf.code = l.family_code
              LEFT JOIN app.taxonomy_category c ON c.number = l.category_number
              LEFT JOIN app.attribute_value cf ON cf.id = l.color_family_value_id
              LEFT JOIN app.attribute_value mv ON mv.id = l.material_value_id
              LEFT JOIN app.attribute_value sev ON sev.id = l.style_element_value_id
              WHERE l.id <> $1::uuid
                AND l.family_code = $2
                AND q.status <> 'ARCHIVED'
              ORDER BY l.updated_at DESC
              LIMIT 100
            `,
            lineId,
            source.familyCode,
          );
          for (const row of quoteRows) {
            const candidate = mapLineRow(row);
            const signals = scoreQuoteLineSimilarity(source, candidate);
            if (signals.length < 2) continue;
            const key = `QUOTE_LINE:${candidate.id}`;
            if (out.has(key)) continue;
            out.set(key, {
              targetType: 'QUOTE_LINE',
              targetId: candidate.id,
              relationType: null,
              manual: false,
              score: signals.length,
              signals,
              title: candidate.supplierStyle,
              subtitle: `${row.vendor_name ?? row.vendor_code ?? ''} - ${row.quote_number ?? ''}`.trim(),
              vendorCode: row.vendor_code ?? null,
              vendorName: row.vendor_name ?? null,
              unitCost: candidate.unitCost,
              retailPrice: candidate.targetRetailHnl,
              imageUrl: candidate.imageUrl,
            });
          }

          const skuRows = await client.$queryRawUnsafe<Array<{
            id: string;
            sku_code: string | null;
            provisional_code: string;
            vendor_id: string | null;
            vendor_name: string | null;
            vendor_sku: string | null;
            description: string | null;
            family_code: string | null;
            category_number: number | null;
            color_code: string | null;
            style_color: string | null;
            season: string | null;
            keywords: string | null;
            current_cost: unknown;
            retail_price: unknown;
            picture_file_name: string | null;
            attr_tokens: string | null;
          }>>(
            `
              SELECT
                s.id::text,
                s.code AS sku_code,
                s.provisional_code,
                s.vendor_id,
                COALESCE(v.short_name, v.mail_name) AS vendor_name,
                s.vendor_sku,
                COALESCE(s.description_rics, s.description_web) AS description,
                s.family_code,
                s.category_number,
                s.color_code,
                s.style_color,
                s.season,
                s.keywords,
                s.current_cost,
                s.retail_price,
                s.picture_file_name,
                string_agg(DISTINCT ad.code || ':' || av.code || ':' || av.label_es, ' ') AS attr_tokens
              FROM app.sku s
              LEFT JOIN app.vendor v ON v.code = s.vendor_id
              LEFT JOIN app.sku_attribute_assignment saa ON saa.sku_code = COALESCE(s.code, s.provisional_code)
              LEFT JOIN app.attribute_dimension ad ON ad.id = saa.dimension_id
              LEFT JOIN app.attribute_value av ON av.id = saa.value_id
              WHERE s.family_code = $1
                AND ($2::uuid IS NULL OR s.id <> $2::uuid)
              GROUP BY s.id, v.short_name, v.mail_name
              ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC
              LIMIT 150
            `,
            source.familyCode,
            source.linkedSkuId,
          );
          for (const row of skuRows) {
            const signals: string[] = [];
            if (source.categoryNumber != null && source.categoryNumber === row.category_number) signals.push('category');
            if (styleSignal(source.supplierStyle, row.vendor_sku) || styleSignal(source.supplierStyle, row.style_color)) signals.push('vendor-style');
            if (styleSignal(source.supplierColorCode, row.color_code) || styleSignal(source.supplierColorName, row.style_color)) signals.push('color');
            const attrTokens = tokenize(row.attr_tokens);
            if (source.materialCode && hasOverlap(tokenize(source.materialCode, source.materialLabelEs), attrTokens)) signals.push('material');
            if (source.styleElementCode && hasOverlap(tokenize(source.styleElementCode, source.styleElementLabelEs), attrTokens)) signals.push('style-element');
            if (sourceSeason && sourceSeason === row.season) signals.push('season');
            if (hasOverlap(tokenize(source.keywords), tokenize(row.keywords))) signals.push('keywords');
            if (signals.length < 2) continue;
            const key = `SKU:${row.id}`;
            if (out.has(key)) continue;
            out.set(key, {
              targetType: 'SKU',
              targetId: row.id,
              relationType: null,
              manual: false,
              score: signals.length,
              signals,
              title: row.sku_code ?? row.provisional_code,
              subtitle: row.description,
              vendorCode: row.vendor_id,
              vendorName: row.vendor_name,
              unitCost: nullableNumber(row.current_cost),
              retailPrice: nullableNumber(row.retail_price),
              imageUrl: buildRicsImageUrl(row.picture_file_name),
            });
          }
        }

        const matchingRows = await client.$queryRawUnsafe<Array<{
          id: string;
          code: string;
          description_es: string | null;
          vendor_id: string | null;
          vendor_name: string | null;
          vendor_style: string | null;
          material_code: string | null;
          material_label: string | null;
          shared_color_code: string | null;
          shared_color_label: string | null;
          season: string | null;
        }>>(
          `
            SELECT
              ms.id::text,
              ms.code,
              ms.description_es,
              ms.vendor_id,
              COALESCE(v.short_name, v.mail_name) AS vendor_name,
              ms.vendor_style,
              ms.material_code,
              ms.material_label,
              ms.shared_color_code,
              ms.shared_color_label,
              ms.season
            FROM app.matching_set ms
            LEFT JOIN app.vendor v ON v.code = ms.vendor_id
            WHERE ms.active = true
            ORDER BY ms.updated_at DESC
            LIMIT 100
          `,
        );
        for (const row of matchingRows) {
          const signals: string[] = [];
          if (styleSignal(source.supplierStyle, row.vendor_style)) signals.push('vendor-style');
          if (styleSignal(source.supplierColorCode, row.shared_color_code) || styleSignal(source.supplierColorName, row.shared_color_label)) signals.push('color');
          if (source.materialCode && (source.materialCode === row.material_code || styleSignal(source.materialLabelEs, row.material_label))) signals.push('material');
          if (sourceSeason && sourceSeason === row.season) signals.push('season');
          if (signals.length < 2) continue;
          const key = `MATCHING_SET:${row.id}`;
          if (out.has(key)) continue;
          out.set(key, {
            targetType: 'MATCHING_SET',
            targetId: row.id,
            relationType: null,
            manual: false,
            score: signals.length,
            signals,
            title: row.code,
            subtitle: row.description_es,
            vendorCode: row.vendor_id,
            vendorName: row.vendor_name,
            unitCost: null,
            retailPrice: null,
            imageUrl: null,
          });
        }

        return Ok(Array.from(out.values()).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)));
      } catch (err) {
        return Err(mapDbError(err));
      }
    },

    async convertAcceptedToPurchaseOrders(id: string, actor: string): Promise<Result<SupplierQuotationConvertResult>> {
      try {
        const quotation = await loadQuotationHeader(client, id);
        if (!quotation) return Err({ kind: 'NotFound', message: `Supplier quotation ${id} not found.` });
        if (quotation.status === 'ARCHIVED') return Err({ kind: 'ConstraintViolation', message: 'Archived quotations cannot be converted.' });
        const rows = await client.$queryRawUnsafe<QuotationLineRow[]>(
          `
            SELECT
              l.*,
              s.code AS linked_sku_code,
              s.provisional_code AS linked_sku_provisional_code,
              pf.label_es AS family_label_es,
              c."desc" AS category_description,
              cf.code AS color_family_code,
              cf.label_es AS color_family_label_es,
              mv.code AS material_code,
              mv.label_es AS material_label_es,
              sev.code AS style_element_code,
              sev.label_es AS style_element_label_es
            FROM app.supplier_quotation_line l
            LEFT JOIN app.sku s ON s.id = l.linked_sku_id
            LEFT JOIN app.product_family pf ON pf.code = l.family_code
            LEFT JOIN app.taxonomy_category c ON c.number = l.category_number
            LEFT JOIN app.attribute_value cf ON cf.id = l.color_family_value_id
            LEFT JOIN app.attribute_value mv ON mv.id = l.material_value_id
            LEFT JOIN app.attribute_value sev ON sev.id = l.style_element_value_id
            WHERE l.quotation_id = $1::uuid
              AND l.decision_status = 'ACCEPTED'
            ORDER BY l.line_sequence ASC
          `,
          id,
        );
        if (rows.length === 0) return Err({ kind: 'ConstraintViolation', message: 'No accepted quote lines to convert.' });

        const lines = rows.map(mapLineRow);
        const createdSkuIds: string[] = [];
        const lineItems: Array<{
          lineId: string;
          skuId: string;
          quantity: number;
          unitCost: number;
          sourceUnitCost: number;
          estimatedLandedUnitCostHnl: number | null;
        }> = [];

        for (const line of lines) {
          let skuId = line.linkedSkuId;
          if (!skuId) {
            const skuResult = await createSku({
              familyCode: line.familyCode,
              categoryNumber: line.categoryNumber,
              vendorId: quotation.vendor_code,
              vendorSku: line.supplierStyle,
              descriptionRics: line.description ?? line.supplierStyle,
              descriptionWeb: line.description ?? line.supplierStyle,
              keywords: line.keywords,
              currentCost: line.estimatedLandedUnitCostHnl ?? line.unitCost,
              retailPrice: line.targetRetailHnl,
              season: quotation.season,
              styleColor: [line.supplierColorCode, line.supplierColorName].filter(Boolean).join(' / ') || null,
              pictureFileName: null,
              legacyAttrs: {
                supplierQuotationLineId: line.id,
                colorFamilyValueId: line.colorFamilyValueId,
                materialValueId: line.materialValueId,
                styleElementValueId: line.styleElementValueId,
              },
            }, actor);
            if (!skuResult.ok) return Err(skuResult.error);
            skuId = skuResult.value.id;
            createdSkuIds.push(skuId);
            await client.$executeRawUnsafe(
              `UPDATE app.supplier_quotation_line SET linked_sku_id = $2::uuid, updated_by = $3, updated_at = now() WHERE id = $1::uuid`,
              line.id,
              skuId,
              actor,
            );
          }
          lineItems.push({
            lineId: line.id,
            skuId,
            quantity: Math.max(1, line.quotedQty ?? line.moqQty ?? 1),
            unitCost: quotation.source_currency === 'HNL' ? (line.estimatedLandedUnitCostHnl ?? line.unitCost) : line.unitCost,
            sourceUnitCost: line.unitCost,
            estimatedLandedUnitCostHnl: line.estimatedLandedUnitCostHnl,
          });
        }

        const plannedDates = lines
          .map((line) => line.plannedReceiptDate)
          .filter((value): value is string => Boolean(value))
          .sort();
        const po = await createPurchaseOrder({
          vendorId: quotation.vendor_code,
          buyer: quotation.buyer,
          sourceCurrency: quotation.source_currency as 'HNL' | 'USD' | 'CNY',
          fxRate: toNumber(quotation.fx_rate),
          fxDate: toDateOnly(quotation.fx_date),
          incotermCode: quotation.incoterm_code as any,
          incotermPlace: quotation.incoterm_place,
          costBasis: quotation.source_currency === 'HNL' ? 'LANDED_LEGACY_HNL' : 'VENDOR_CURRENCY_ESTIMATED_LANDED',
          plannedReceiptDate: plannedDates[0] ?? null,
          notes: `Created from supplier quotation ${quotation.quote_number}`,
          origin: 'SUPPLIER_QUOTATION',
          createdBy: actor,
          lineItems: lineItems.map((item) => ({
            skuId: item.skuId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            sourceUnitCost: item.sourceUnitCost,
            estimatedLandedUnitCostHnl: item.estimatedLandedUnitCostHnl,
          })),
        });
        if ('error' in po) {
          return Err({ kind: 'ConstraintViolation', message: po.error });
        }

        await client.$executeRawUnsafe(
          `UPDATE app.purchase_order SET supplier_quotation_id = $1::uuid WHERE id = $2::uuid`,
          id,
          po.id,
        );
        for (let i = 0; i < lineItems.length; i++) {
          const poLine = po.lineItems[i];
          const quoteLine = lineItems[i];
          if (!poLine || !quoteLine) continue;
          await client.$executeRawUnsafe(
            `UPDATE app.purchase_order_line SET supplier_quotation_line_id = $1::uuid WHERE id = $2::uuid`,
            quoteLine.lineId,
            poLine.id,
          );
        }
        await client.$executeRawUnsafe(
          `UPDATE app.supplier_quotation SET status = 'CONVERTED', updated_by = $2, updated_at = now() WHERE id = $1::uuid`,
          id,
          actor,
        );
        await recordAudit(client, actor, 'convert_to_po', id, { purchaseOrderId: po.id, createdSkuIds });
        return Ok({ purchaseOrders: [po], createdSkuIds });
      } catch (err) {
        return Err(mapDbError(err));
      }
    },
  };
}

export const supplierQuotationService = createSupplierQuotationService();
