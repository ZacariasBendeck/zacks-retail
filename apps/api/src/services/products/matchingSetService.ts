import { Prisma } from '../../prismaClient';
import { prisma } from '../../db/prisma';
import { auditLog } from './auditLog';
import { Err, Ok, type RepoError, type Result } from '../../repositories/rics/repoResult';

const TABLE_SET = 'app.matching_set';
const TABLE_MEMBER = 'app.matching_set_member';
const TABLE_TYPE = 'app.matching_set_type';
const TABLE_ROLE = 'app.matching_set_role';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

type Tx = Prisma.TransactionClient;

export interface MatchingSetTypeRoleRow {
  code: string;
  labelEs: string;
  sortOrder: number;
  requiredDefault: boolean;
  active: boolean;
}

export interface MatchingSetTypeRow {
  code: string;
  labelEs: string;
  descriptionEs: string | null;
  sortOrder: number;
  active: boolean;
  roles: MatchingSetTypeRoleRow[];
}

export interface MatchingSetGap {
  roleCode: string;
  roleLabelEs: string;
  severity: 'missing_required_role' | 'inactive_role';
}

export interface MatchingSetMemberRow {
  skuId: string;
  skuCode: string | null;
  provisionalCode: string;
  skuState: string;
  familyCode: string | null;
  roleCode: string;
  roleLabelEs: string;
  isPrimary: boolean;
  quantityRatio: number;
  description: string | null;
  vendorId: string | null;
  vendorSku: string | null;
  colorCode: string | null;
  season: string | null;
  onHandTotal: number;
  storeCountWithOnHand: number;
  salesLast90Days: number | null;
}

export interface MatchingSetDetail {
  id: string;
  code: string;
  displayName: string;
  setTypeCode: string;
  setTypeLabelEs: string;
  descriptionEs: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorStyle: string | null;
  materialCode: string | null;
  materialLabel: string | null;
  sharedColorCode: string | null;
  sharedColorLabel: string | null;
  season: string | null;
  chainId: string | null;
  chainLabel: string | null;
  sellMode: 'separates' | 'bundle_required';
  planningActive: boolean;
  notes: string | null;
  active: boolean;
  memberCount: number;
  totalOnHand: number;
  salesLast90Days: number | null;
  gaps: MatchingSetGap[];
  members: MatchingSetMemberRow[];
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface MatchingSetListItem extends Omit<MatchingSetDetail, 'members'> {
  primaryMember: MatchingSetMemberRow | null;
}

export interface MatchingSetListFilters {
  q?: string | null;
  setType?: string | null;
  vendorId?: string | null;
  sku?: string | null;
  role?: string | null;
  active?: boolean | null;
  hasGap?: boolean | null;
  page?: number | null;
  pageSize?: number | null;
}

export interface MatchingSetCreateInput {
  code?: string | null;
  displayName?: string | null;
  setTypeCode: string;
  descriptionEs?: string | null;
  vendorId?: string | null;
  vendorStyle?: string | null;
  materialCode?: string | null;
  materialLabel?: string | null;
  sharedColorCode?: string | null;
  sharedColorLabel?: string | null;
  season?: string | null;
  chainId?: string | null;
  sellMode?: 'separates' | 'bundle_required' | null;
  planningActive?: boolean | null;
  notes?: string | null;
  members?: MatchingSetMemberInput[];
}

export interface MatchingSetPatchInput {
  displayName?: string | null;
  setTypeCode?: string;
  descriptionEs?: string | null;
  vendorId?: string | null;
  vendorStyle?: string | null;
  materialCode?: string | null;
  materialLabel?: string | null;
  sharedColorCode?: string | null;
  sharedColorLabel?: string | null;
  season?: string | null;
  chainId?: string | null;
  sellMode?: 'separates' | 'bundle_required' | null;
  planningActive?: boolean | null;
  notes?: string | null;
}

export interface MatchingSetMemberInput {
  skuId?: string | null;
  skuCode?: string | null;
  provisionalCode?: string | null;
  roleCode: string;
  isPrimary?: boolean | null;
  quantityRatio?: number | null;
}

export interface MatchingSetMemberPatchInput {
  roleCode?: string;
  isPrimary?: boolean | null;
  quantityRatio?: number | null;
}

export interface MatchingSetTypeInput {
  code?: string;
  labelEs?: string;
  descriptionEs?: string | null;
  sortOrder?: number;
  active?: boolean;
}

export interface MatchingSetRoleInput {
  code?: string;
  labelEs?: string;
  sortOrder?: number;
  requiredDefault?: boolean;
  active?: boolean;
}

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function cleanCode(v: unknown): string | null {
  const s = cleanText(v);
  return s ? s.toLowerCase() : null;
}

function asNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object' && v && 'toNumber' in v && typeof (v as { toNumber: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sellMode(v: unknown): 'separates' | 'bundle_required' {
  return v === 'bundle_required' ? 'bundle_required' : 'separates';
}

function matchingSetTypeName(setTypeCode: string, setTypeLabelEs?: string | null): string {
  if (setTypeCode === 'suit') return 'Suit';
  if (setTypeCode === 'bikini') return 'Bikini';
  if (setTypeCode === 'pj_set') return 'Pajama';
  if (setTypeCode === 'coordinate') return 'Coordinate';
  return setTypeLabelEs ?? 'Set';
}

function styleFromSkuCode(skuCode: string | null | undefined): string | null {
  const code = cleanText(skuCode);
  if (!code) return null;
  return cleanText(code.split('-')[0]);
}

function colorCodeLabel(code: string | null | undefined): string | null {
  const c = cleanText(code)?.toUpperCase();
  if (!c) return null;
  const labels: Record<string, string> = {
    BK: 'Black',
    BLK: 'Black',
    NV: 'Navy',
    NAVY: 'Navy',
    BG: 'Beige',
    BR: 'Brown',
    BN: 'Brown',
    WH: 'White',
    WT: 'White',
    GY: 'Gray',
    GRY: 'Gray',
    RD: 'Red',
    GN: 'Green',
    GR: 'Green',
    BL: 'Blue',
  };
  return labels[c] ?? cleanText(code);
}

function colorCodeFromSkuCode(skuCode: string | null | undefined): string | null {
  const code = cleanText(skuCode);
  if (!code || !code.includes('-')) return null;
  const parts = code.split('-').filter(Boolean);
  return cleanText(parts[parts.length - 1]);
}

function suggestedDisplayName(input: {
  setTypeCode: string;
  setTypeLabelEs?: string | null;
  vendorId?: string | null;
  vendorStyle?: string | null;
  sharedColorCode?: string | null;
  sharedColorLabel?: string | null;
  primarySkuCode?: string | null;
}): string {
  const style = cleanText(input.vendorStyle) ?? styleFromSkuCode(input.primarySkuCode);
  const color = cleanText(input.sharedColorLabel)
    ?? colorCodeLabel(input.sharedColorCode)
    ?? colorCodeLabel(colorCodeFromSkuCode(input.primarySkuCode));
  return [
    matchingSetTypeName(input.setTypeCode, input.setTypeLabelEs),
    cleanText(input.vendorId),
    style,
    color,
  ].filter((part): part is string => Boolean(part)).join(' - ');
}

function matchesListQuery(set: MatchingSetDetail, query: string): boolean {
  const q = query.toLowerCase();
  const values = [
    set.displayName,
    set.code,
    set.descriptionEs,
    set.setTypeLabelEs,
    set.vendorId,
    set.vendorName,
    set.vendorStyle,
    set.materialCode,
    set.materialLabel,
    set.sharedColorCode,
    set.sharedColorLabel,
    set.season,
    ...set.members.flatMap((member) => [
      member.skuCode,
      member.provisionalCode,
      member.vendorSku,
      member.description,
      member.colorCode,
    ]),
  ];
  return values.some((value) => value != null && String(value).toLowerCase().includes(q));
}

function defaultQuantityRatio(setTypeCode: string, roleCode: string, value: number | null | undefined): number {
  if (value != null && Number.isFinite(value) && value > 0) return value;
  if (setTypeCode === 'suit') {
    if (roleCode === 'pant') return 1.2;
    if (roleCode === 'vest') return 0.5;
  }
  return 1;
}

function err(kind: RepoError['kind'], message: string, cause?: unknown): Result<never> {
  return Err({ kind, message, cause });
}

function mapType(row: {
  code: string;
  labelEs: string;
  descriptionEs: string | null;
  sortOrder: number;
  active: boolean;
  roles: Array<{
    code: string;
    labelEs: string;
    sortOrder: number;
    requiredDefault: boolean;
    active: boolean;
  }>;
}): MatchingSetTypeRow {
  return {
    code: row.code,
    labelEs: row.labelEs,
    descriptionEs: row.descriptionEs,
    sortOrder: row.sortOrder,
    active: row.active,
    roles: row.roles.map((r) => ({
      code: r.code,
      labelEs: r.labelEs,
      sortOrder: r.sortOrder,
      requiredDefault: r.requiredDefault,
      active: r.active,
    })),
  };
}

async function nextGeneratedCode(tx: Tx): Promise<string> {
  const rows = await tx.$queryRawUnsafe<{ code: string }[]>(
    `SELECT 'MS-' || to_char(now(), 'YYYY') || '-' ||
            lpad(nextval('app.matching_set_code_seq')::text, 6, '0') AS code`,
  );
  return rows[0]?.code ?? `MS-${new Date().getFullYear()}-${Date.now()}`;
}

async function ensureType(
  tx: Tx,
  code: string,
  opts: { requireActive?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: RepoError }> {
  const row = await tx.matchingSetType.findUnique({ where: { code } });
  if (!row) return { ok: false, error: { kind: 'ConstraintViolation', message: `Matching set type '${code}' does not exist.` } };
  if (opts.requireActive && !row.active) {
    return { ok: false, error: { kind: 'ConstraintViolation', message: `Matching set type '${code}' is inactive.` } };
  }
  return { ok: true };
}

async function ensureRole(
  tx: Tx,
  setTypeCode: string,
  roleCode: string,
  opts: { requireActive?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: RepoError }> {
  const row = await tx.matchingSetRole.findUnique({
    where: { setTypeCode_code: { setTypeCode, code: roleCode } },
  });
  if (!row) {
    return {
      ok: false,
      error: { kind: 'ConstraintViolation', message: `Role '${roleCode}' does not exist for set type '${setTypeCode}'.` },
    };
  }
  if (opts.requireActive && !row.active) {
    return {
      ok: false,
      error: { kind: 'ConstraintViolation', message: `Role '${roleCode}' is inactive for set type '${setTypeCode}'.` },
    };
  }
  return { ok: true };
}

async function resolveSkuRef(
  tx: Tx,
  ref: { skuId?: string | null; skuCode?: string | null; provisionalCode?: string | null } | string,
): Promise<{ ok: true; skuId: string; skuCode: string | null } | { ok: false; error: RepoError }> {
  const raw =
    typeof ref === 'string'
      ? ref
      : ref.skuId ?? ref.skuCode ?? ref.provisionalCode ?? '';
  const value = String(raw ?? '').trim();
  if (!value) {
    return { ok: false, error: { kind: 'ConstraintViolation', message: 'SKU reference is required.' } };
  }

  const where = UUID_RE.test(value)
    ? { id: value }
    : {
        OR: [
          { code: value },
          { provisionalCode: value },
        ],
      };

  const sku = await tx.sku.findFirst({ where, select: { id: true, code: true, provisionalCode: true } });
  if (!sku) {
    return { ok: false, error: { kind: 'NotFound', message: `SKU '${value}' was not found.` } };
  }
  return { ok: true, skuId: sku.id, skuCode: sku.code ?? sku.provisionalCode };
}

interface ResolvedMatchingSetMember {
  input: MatchingSetMemberInput;
  roleCode: string;
  skuId: string;
  skuCode: string | null;
}

interface SkuHeaderSource {
  skuId: string;
  skuCode: string | null;
  vendorId: string | null;
  vendorSku: string | null;
  colorCode: string | null;
  colorAttributeCode: string | null;
  colorAttributeLabel: string | null;
  materialCode: string | null;
  materialLabel: string | null;
  season: string | null;
}

interface DerivedMatchingSetHeader {
  vendorId: string | null;
  vendorStyle: string | null;
  sharedColorCode: string | null;
  sharedColorLabel: string | null;
  materialCode: string | null;
  materialLabel: string | null;
  season: string | null;
}

async function loadSkuHeaderSources(tx: Tx, skuIds: string[]): Promise<Map<string, SkuHeaderSource>> {
  if (skuIds.length === 0) return new Map();
  const rows = await tx.$queryRawUnsafe<Array<{
    sku_id: string;
    sku_code: string | null;
    provisional_code: string;
    vendor_id: string | null;
    vendor_sku: string | null;
    color_code: string | null;
    color_attribute_code: string | null;
    color_attribute_label: string | null;
    material_code: string | null;
    material_label: string | null;
    season: string | null;
  }>>(
    `
      SELECT
        s.id::text AS sku_id,
        s.code AS sku_code,
        s.provisional_code,
        s.vendor_id,
        s.vendor_sku,
        s.color_code,
        color_attr.code AS color_attribute_code,
        color_attr.label_es AS color_attribute_label,
        material_attr.code AS material_code,
        material_attr.label_es AS material_label,
        s.season
      FROM app.sku s
      LEFT JOIN LATERAL (
        SELECT av.code, av.label_es
        FROM app.sku_attribute_assignment a
        JOIN app.attribute_dimension d ON d.id = a.dimension_id
        JOIN app.attribute_value av ON av.id = a.value_id
        WHERE a.sku_code = COALESCE(s.code, s.provisional_code)
          AND d.code = 'color'
        ORDER BY a.assigned_at DESC, av.sort_order ASC, av.code ASC
        LIMIT 1
      ) color_attr ON true
      LEFT JOIN LATERAL (
        SELECT av.code, av.label_es
        FROM app.sku_attribute_assignment a
        JOIN app.attribute_dimension d ON d.id = a.dimension_id
        JOIN app.attribute_value av ON av.id = a.value_id
        WHERE a.sku_code = COALESCE(s.code, s.provisional_code)
          AND d.code = 'upper_material'
        ORDER BY a.assigned_at DESC, av.sort_order ASC, av.code ASC
        LIMIT 1
      ) material_attr ON true
      WHERE s.id = ANY($1::uuid[])
    `,
    skuIds,
  );

  return new Map(rows.map((row) => [
    row.sku_id,
    {
      skuId: row.sku_id,
      skuCode: row.sku_code ?? row.provisional_code,
      vendorId: row.vendor_id,
      vendorSku: row.vendor_sku,
      colorCode: row.color_code,
      colorAttributeCode: row.color_attribute_code,
      colorAttributeLabel: row.color_attribute_label,
      materialCode: row.material_code,
      materialLabel: row.material_label,
      season: row.season,
    },
  ]));
}

function consensus(values: Array<string | null | undefined>): string | null {
  const cleaned = values.map(cleanText).filter((value): value is string => Boolean(value));
  if (cleaned.length === 0 || cleaned.length !== values.length) return null;
  const first = cleaned[0];
  return cleaned.every((value) => value === first) ? first : null;
}

function deriveFromSingleSku(source: SkuHeaderSource): DerivedMatchingSetHeader {
  const colorCode = cleanText(source.colorCode) ?? cleanText(source.colorAttributeCode);
  return {
    vendorId: cleanText(source.vendorId),
    vendorStyle: cleanText(source.vendorSku) ?? styleFromSkuCode(source.skuCode),
    sharedColorCode: colorCode,
    sharedColorLabel: cleanText(source.colorAttributeLabel) ?? colorCodeLabel(colorCode),
    materialCode: cleanText(source.materialCode),
    materialLabel: cleanText(source.materialLabel),
    season: cleanText(source.season),
  };
}

function deriveMatchingSetHeaderFromSkus(
  sources: SkuHeaderSource[],
  primarySkuId: string | null,
): DerivedMatchingSetHeader {
  const primary = primarySkuId ? sources.find((source) => source.skuId === primarySkuId) : null;
  if (primary) return deriveFromSingleSku(primary);

  const perSku = sources.map(deriveFromSingleSku);
  return {
    vendorId: consensus(perSku.map((source) => source.vendorId)),
    vendorStyle: consensus(perSku.map((source) => source.vendorStyle)),
    sharedColorCode: consensus(perSku.map((source) => source.sharedColorCode)),
    sharedColorLabel: consensus(perSku.map((source) => source.sharedColorLabel)),
    materialCode: consensus(perSku.map((source) => source.materialCode)),
    materialLabel: consensus(perSku.map((source) => source.materialLabel)),
    season: consensus(perSku.map((source) => source.season)),
  };
}

function fallbackSkuSource(resolved: ResolvedMatchingSetMember): SkuHeaderSource {
  return {
    skuId: resolved.skuId,
    skuCode: resolved.skuCode,
    vendorId: null,
    vendorSku: null,
    colorCode: null,
    colorAttributeCode: null,
    colorAttributeLabel: null,
    materialCode: null,
    materialLabel: null,
    season: null,
  };
}

function mergeDerivedCreateHeader(
  input: MatchingSetCreateInput,
  derived: DerivedMatchingSetHeader,
): DerivedMatchingSetHeader {
  return {
    vendorId: cleanText(input.vendorId) ?? derived.vendorId,
    vendorStyle: cleanText(input.vendorStyle) ?? derived.vendorStyle,
    sharedColorCode: cleanText(input.sharedColorCode) ?? derived.sharedColorCode,
    sharedColorLabel: cleanText(input.sharedColorLabel) ?? derived.sharedColorLabel,
    materialCode: cleanText(input.materialCode) ?? derived.materialCode,
    materialLabel: cleanText(input.materialLabel) ?? derived.materialLabel,
    season: cleanText(input.season) ?? derived.season,
  };
}

function mergeDerivedExistingHeader(
  existing: {
    vendorId: string | null;
    vendorStyle: string | null;
    sharedColorCode: string | null;
    sharedColorLabel: string | null;
    materialCode: string | null;
    materialLabel: string | null;
    season: string | null;
  },
  derived: DerivedMatchingSetHeader,
): DerivedMatchingSetHeader {
  return {
    vendorId: cleanText(existing.vendorId) ?? derived.vendorId,
    vendorStyle: cleanText(existing.vendorStyle) ?? derived.vendorStyle,
    sharedColorCode: cleanText(existing.sharedColorCode) ?? derived.sharedColorCode,
    sharedColorLabel: cleanText(existing.sharedColorLabel) ?? derived.sharedColorLabel,
    materialCode: cleanText(existing.materialCode) ?? derived.materialCode,
    materialLabel: cleanText(existing.materialLabel) ?? derived.materialLabel,
    season: cleanText(existing.season) ?? derived.season,
  };
}

async function stockSummary(skuIds: string[]): Promise<Map<string, { onHandTotal: number; storeCountWithOnHand: number }>> {
  if (skuIds.length === 0) return new Map();
  const rows = await prisma.$queryRawUnsafe<{ sku_id: string; on_hand_total: unknown; store_count_with_on_hand: unknown }[]>(
    `
    SELECT
      sku_id::text,
      COALESCE(SUM(on_hand), 0)::int AS on_hand_total,
      COUNT(DISTINCT CASE WHEN on_hand > 0 THEN store_id END)::int AS store_count_with_on_hand
    FROM app.stock_level
    WHERE sku_id = ANY($1::uuid[])
    GROUP BY sku_id
    `,
    skuIds,
  );
  return new Map(rows.map((r) => [
    r.sku_id,
    {
      onHandTotal: asNumber(r.on_hand_total),
      storeCountWithOnHand: asNumber(r.store_count_with_on_hand),
    },
  ]));
}

async function salesSummary(skuIds: string[]): Promise<Map<string, number>> {
  if (skuIds.length === 0) return new Map();
  // RICS ticket quantities are already signed: sales positive, returns negative.
  const rows = await prisma.$queryRawUnsafe<{ sku_id: string; sales_last_90_days: unknown }[]>(
    `
    SELECT
      l.sku_id::text,
      COALESCE(SUM(l.quantity), 0)::int AS sales_last_90_days
    FROM app.sales_history_ticket_line l
    JOIN app.sales_history_ticket t ON t.id = l.ticket_id
    WHERE l.sku_id = ANY($1::uuid[])
      AND t.purchased_at >= now() - (90 * interval '1 day')
      AND t.status = 'completed'
    GROUP BY l.sku_id
    `,
    skuIds,
  );
  return new Map(rows.map((r) => [r.sku_id, asNumber(r.sales_last_90_days)]));
}

type DetailRow = Prisma.MatchingSetGetPayload<{
  include: {
    setType: true;
    vendor: true;
    members: { include: { sku: true } };
  };
}>;

interface MatchingSetPlanningFields {
  displayName: string | null;
  materialCode: string | null;
  materialLabel: string | null;
  chainId: string | null;
  chainLabel: string | null;
  sellMode: 'separates' | 'bundle_required';
  planningActive: boolean;
}

async function loadPlanningFields(id: string): Promise<MatchingSetPlanningFields> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    display_name: string | null;
    material_code: string | null;
    material_label: string | null;
    chain_id: string | null;
    chain_label: string | null;
    sell_mode: string | null;
    planning_active: boolean | null;
  }>>(
    `
      SELECT
        s.display_name,
        s.material_code,
        s.material_label,
        s.chain_id,
        sg.label AS chain_label,
        s.sell_mode,
        s.planning_active
      FROM app.matching_set s
      LEFT JOIN app.store_group sg ON sg.code = s.chain_id
      WHERE s.id = $1::uuid
      LIMIT 1
    `,
    id,
  );
  const row = rows[0];
  return {
    displayName: row?.display_name ?? null,
    materialCode: row?.material_code ?? null,
    materialLabel: row?.material_label ?? null,
    chainId: row?.chain_id ?? null,
    chainLabel: row?.chain_label ?? null,
    sellMode: sellMode(row?.sell_mode),
    planningActive: row?.planning_active ?? true,
  };
}

async function writePlanningFields(
  tx: Tx,
  id: string,
  input: {
    materialCode?: string | null;
    materialLabel?: string | null;
    chainId?: string | null;
    sellMode?: 'separates' | 'bundle_required' | null;
    planningActive?: boolean | null;
  },
  mode: 'create' | 'patch',
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  function add(column: string, value: unknown): void {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  if (mode === 'create' || input.materialCode !== undefined) add('material_code', cleanText(input.materialCode));
  if (mode === 'create' || input.materialLabel !== undefined) add('material_label', cleanText(input.materialLabel));
  if (mode === 'create' || input.chainId !== undefined) add('chain_id', cleanText(input.chainId));
  if (mode === 'create' || input.sellMode !== undefined) add('sell_mode', sellMode(input.sellMode));
  if (mode === 'create' || (input.planningActive !== undefined && input.planningActive !== null)) {
    add('planning_active', input.planningActive ?? true);
  }
  if (sets.length === 0) return;
  values.push(id);
  await tx.$executeRawUnsafe(
    `UPDATE app.matching_set SET ${sets.join(', ')} WHERE id = $${values.length}::uuid`,
    ...values,
  );
}

async function writeDisplayName(tx: Tx, id: string, displayName: string | null): Promise<void> {
  await tx.$executeRawUnsafe(
    'UPDATE app.matching_set SET display_name = $1::text WHERE id = $2::uuid',
    cleanText(displayName),
    id,
  );
}

async function loadDisplayName(tx: Tx, id: string): Promise<string | null> {
  const rows = await tx.$queryRawUnsafe<Array<{ display_name: string | null }>>(
    'SELECT display_name FROM app.matching_set WHERE id = $1::uuid LIMIT 1',
    id,
  );
  return rows[0]?.display_name ?? null;
}

async function suggestDisplayNameForExistingSet(tx: Tx, id: string): Promise<string> {
  const rows = await tx.$queryRawUnsafe<Array<{
    set_type_code: string;
    set_type_label_es: string | null;
    vendor_id: string | null;
    vendor_style: string | null;
    shared_color_code: string | null;
    shared_color_label: string | null;
    primary_sku_code: string | null;
  }>>(
    `
      SELECT
        s.set_type_code,
        t.label_es AS set_type_label_es,
        s.vendor_id,
        s.vendor_style,
        s.shared_color_code,
        s.shared_color_label,
        pm.sku_code AS primary_sku_code
      FROM app.matching_set s
      LEFT JOIN app.matching_set_type t ON t.code = s.set_type_code
      LEFT JOIN LATERAL (
        SELECT COALESCE(k.code, k.provisional_code) AS sku_code
        FROM app.matching_set_member m
        JOIN app.sku k ON k.id = m.sku_id
        WHERE m.set_id = s.id
        ORDER BY m.is_primary DESC, m.added_at ASC
        LIMIT 1
      ) pm ON true
      WHERE s.id = $1::uuid
      LIMIT 1
    `,
    id,
  );
  const row = rows[0];
  if (!row) return 'Set';
  return suggestedDisplayName({
    setTypeCode: row.set_type_code,
    setTypeLabelEs: row.set_type_label_es,
    vendorId: row.vendor_id,
    vendorStyle: row.vendor_style,
    sharedColorCode: row.shared_color_code,
    sharedColorLabel: row.shared_color_label,
    primarySkuCode: row.primary_sku_code,
  });
}

async function mapDetail(row: DetailRow): Promise<MatchingSetDetail> {
  const skuIds = row.members.map((m) => m.skuId);
  const [stock, sales, roles, planning] = await Promise.all([
    stockSummary(skuIds),
    salesSummary(skuIds),
    prisma.matchingSetRole.findMany({
      where: { setTypeCode: row.setTypeCode },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }),
    loadPlanningFields(row.id),
  ]);

  const roleMap = new Map(roles.map((r) => [r.code, r]));
  const roleCodesPresent = new Set(row.members.map((m) => m.roleCode));
  const gaps: MatchingSetGap[] = [];
  for (const role of roles) {
    if (role.requiredDefault && !roleCodesPresent.has(role.code)) {
      gaps.push({
        roleCode: role.code,
        roleLabelEs: role.labelEs,
        severity: 'missing_required_role',
      });
    }
  }
  for (const member of row.members) {
    const role = roleMap.get(member.roleCode);
    if (role && !role.active) {
      gaps.push({
        roleCode: role.code,
        roleLabelEs: role.labelEs,
        severity: 'inactive_role',
      });
    }
  }

  const members = row.members
    .map((m): MatchingSetMemberRow => {
      const summary = stock.get(m.skuId) ?? { onHandTotal: 0, storeCountWithOnHand: 0 };
      const role = roleMap.get(m.roleCode);
      return {
        skuId: m.skuId,
        skuCode: m.sku.code,
        provisionalCode: m.sku.provisionalCode,
        skuState: m.sku.skuState,
        familyCode: m.sku.familyCode,
        roleCode: m.roleCode,
        roleLabelEs: role?.labelEs ?? m.roleCode,
        isPrimary: m.isPrimary,
        quantityRatio: asNumber(m.quantityRatio),
        description: m.sku.descriptionRics ?? m.sku.descriptionWeb ?? null,
        vendorId: m.sku.vendorId,
        vendorSku: m.sku.vendorSku,
        colorCode: m.sku.colorCode,
        season: m.sku.season,
        onHandTotal: summary.onHandTotal,
        storeCountWithOnHand: summary.storeCountWithOnHand,
        salesLast90Days: sales.has(m.skuId) ? sales.get(m.skuId)! : null,
      };
    })
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.roleCode.localeCompare(b.roleCode));

  const salesValues = members.map((m) => m.salesLast90Days).filter((v): v is number => v != null);
  const primaryMember = members.find((m) => m.isPrimary) ?? members[0] ?? null;
  return {
    id: row.id,
    code: row.code,
    displayName: planning.displayName ?? suggestedDisplayName({
      setTypeCode: row.setTypeCode,
      setTypeLabelEs: row.setType.labelEs,
      vendorId: row.vendorId,
      vendorStyle: row.vendorStyle,
      sharedColorCode: row.sharedColorCode,
      sharedColorLabel: row.sharedColorLabel,
      primarySkuCode: primaryMember?.skuCode ?? primaryMember?.provisionalCode ?? null,
    }),
    setTypeCode: row.setTypeCode,
    setTypeLabelEs: row.setType.labelEs,
    descriptionEs: row.descriptionEs,
    vendorId: row.vendorId,
    vendorName: row.vendor?.shortName ?? row.vendor?.mailName ?? null,
    vendorStyle: row.vendorStyle,
    materialCode: planning.materialCode,
    materialLabel: planning.materialLabel,
    sharedColorCode: row.sharedColorCode,
    sharedColorLabel: row.sharedColorLabel,
    season: row.season,
    chainId: planning.chainId,
    chainLabel: planning.chainLabel,
    sellMode: planning.sellMode,
    planningActive: planning.planningActive,
    notes: row.notes,
    active: row.active,
    memberCount: members.length,
    totalOnHand: members.reduce((sum, m) => sum + m.onHandTotal, 0),
    salesLast90Days: salesValues.length > 0 ? salesValues.reduce((sum, v) => sum + v, 0) : null,
    gaps,
    members,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

async function getDetailRow(id: string): Promise<DetailRow | null> {
  return prisma.matchingSet.findUnique({
    where: { id },
    include: {
      setType: true,
      vendor: true,
      members: {
        include: { sku: true },
        orderBy: [{ isPrimary: 'desc' }, { roleCode: 'asc' }, { addedAt: 'asc' }],
      },
    },
  });
}

export const matchingSetService = {
  async listTypes(): Promise<Result<MatchingSetTypeRow[]>> {
    try {
      const rows = await prisma.matchingSetType.findMany({
        include: { roles: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] } },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      });
      return Ok(rows.map(mapType));
    } catch (cause) {
      return err('AccessConnectionError', cause instanceof Error ? cause.message : String(cause), cause);
    }
  },

  async createType(input: MatchingSetTypeInput, actor: string): Promise<Result<MatchingSetTypeRow>> {
    const code = cleanCode(input.code);
    const labelEs = cleanText(input.labelEs);
    if (!code || !CODE_RE.test(code)) return err('ConstraintViolation', 'Valid type code is required.');
    if (!labelEs) return err('ConstraintViolation', 'labelEs is required.');
    try {
      const row = await prisma.matchingSetType.create({
        data: {
          code,
          labelEs,
          descriptionEs: input.descriptionEs ?? null,
          sortOrder: input.sortOrder ?? 0,
          active: input.active ?? true,
        },
        include: { roles: true },
      });
      await auditLog.record({ actor, action: 'matching_set_type_create', targetTable: TABLE_TYPE, targetPk: code, payload: input as unknown as Record<string, unknown> });
      return Ok(mapType(row));
    } catch (cause) {
      return err('DuplicatePrimaryKey', cause instanceof Error ? cause.message : String(cause), cause);
    }
  },

  async patchType(code: string, input: MatchingSetTypeInput, actor: string): Promise<Result<MatchingSetTypeRow>> {
    const clean = cleanCode(code);
    if (!clean) return err('ConstraintViolation', 'type code is required.');
    try {
      const row = await prisma.matchingSetType.update({
        where: { code: clean },
        data: {
          ...(input.labelEs !== undefined ? { labelEs: cleanText(input.labelEs) ?? '' } : {}),
          ...(input.descriptionEs !== undefined ? { descriptionEs: input.descriptionEs } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
        include: { roles: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] } },
      });
      await auditLog.record({ actor, action: 'matching_set_type_update', targetTable: TABLE_TYPE, targetPk: clean, payload: input as unknown as Record<string, unknown> });
      return Ok(mapType(row));
    } catch (cause) {
      return err('NotFound', `Matching set type '${clean}' was not found.`, cause);
    }
  },

  async createRole(setTypeCode: string, input: MatchingSetRoleInput, actor: string): Promise<Result<MatchingSetTypeRow>> {
    const typeCode = cleanCode(setTypeCode);
    const code = cleanCode(input.code);
    const labelEs = cleanText(input.labelEs);
    if (!typeCode) return err('ConstraintViolation', 'set type code is required.');
    if (!code || !CODE_RE.test(code)) return err('ConstraintViolation', 'Valid role code is required.');
    if (!labelEs) return err('ConstraintViolation', 'labelEs is required.');
    try {
      await prisma.matchingSetRole.create({
        data: {
          setTypeCode: typeCode,
          code,
          labelEs,
          sortOrder: input.sortOrder ?? 0,
          requiredDefault: input.requiredDefault ?? false,
          active: input.active ?? true,
        },
      });
      await auditLog.record({ actor, action: 'matching_set_role_create', targetTable: TABLE_ROLE, targetPk: `${typeCode}:${code}`, payload: input as unknown as Record<string, unknown> });
      return this.patchType(typeCode, {}, actor);
    } catch (cause) {
      return err('DuplicatePrimaryKey', cause instanceof Error ? cause.message : String(cause), cause);
    }
  },

  async patchRole(setTypeCode: string, roleCode: string, input: MatchingSetRoleInput, actor: string): Promise<Result<MatchingSetTypeRow>> {
    const typeCode = cleanCode(setTypeCode);
    const code = cleanCode(roleCode);
    if (!typeCode || !code) return err('ConstraintViolation', 'set type and role code are required.');
    try {
      await prisma.matchingSetRole.update({
        where: { setTypeCode_code: { setTypeCode: typeCode, code } },
        data: {
          ...(input.labelEs !== undefined ? { labelEs: cleanText(input.labelEs) ?? '' } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.requiredDefault !== undefined ? { requiredDefault: input.requiredDefault } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      await auditLog.record({ actor, action: 'matching_set_role_update', targetTable: TABLE_ROLE, targetPk: `${typeCode}:${code}`, payload: input as unknown as Record<string, unknown> });
      return this.patchType(typeCode, {}, actor);
    } catch (cause) {
      return err('NotFound', `Matching set role '${typeCode}:${code}' was not found.`, cause);
    }
  },

  async list(filters: MatchingSetListFilters = {}): Promise<Result<MatchingSetListItem[]>> {
    try {
      const page = Math.max(1, filters.page ?? 1);
      const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
      const query = cleanText(filters.q);
      const and: Prisma.MatchingSetWhereInput[] = [];
      if (filters.active != null) and.push({ active: filters.active });
      if (filters.setType) and.push({ setTypeCode: filters.setType });
      if (filters.vendorId) and.push({ vendorId: filters.vendorId });
      if (filters.role) and.push({ members: { some: { roleCode: filters.role } } });
      if (filters.sku) {
        const value = filters.sku.trim();
        and.push({
          members: {
            some: {
              sku: {
                OR: [
                  { id: UUID_RE.test(value) ? value : undefined },
                  { code: value },
                  { provisionalCode: value },
                ].filter((x) => Object.values(x).some((v) => v !== undefined)),
              },
            },
          },
        });
      }

      const rows = await prisma.matchingSet.findMany({
        where: and.length > 0 ? { AND: and } : undefined,
        include: {
          setType: true,
          vendor: true,
          members: {
            include: { sku: true },
            orderBy: [{ isPrimary: 'desc' }, { roleCode: 'asc' }, { addedAt: 'asc' }],
          },
        },
        orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
        skip: query ? undefined : (page - 1) * pageSize,
        take: query ? undefined : pageSize,
      });

      const mapped = await Promise.all(rows.map(mapDetail));
      const queryFiltered = query ? mapped.filter((d) => matchesListQuery(d, query)) : mapped;
      const filtered = filters.hasGap == null ? queryFiltered : queryFiltered.filter((d) => (d.gaps.length > 0) === filters.hasGap);
      const paged = query ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered;
      return Ok(paged.map((d) => ({
        ...d,
        primaryMember: d.members.find((m) => m.isPrimary) ?? d.members[0] ?? null,
      })));
    } catch (cause) {
      return err('AccessConnectionError', cause instanceof Error ? cause.message : String(cause), cause);
    }
  },

  async get(id: string): Promise<Result<MatchingSetDetail>> {
    try {
      const row = await getDetailRow(id);
      if (!row) return err('NotFound', `Matching set '${id}' was not found.`);
      return Ok(await mapDetail(row));
    } catch (cause) {
      return err('AccessConnectionError', cause instanceof Error ? cause.message : String(cause), cause);
    }
  },

  async getBySku(skuRef: string): Promise<Result<MatchingSetDetail[]>> {
    try {
      const resolved = await resolveSkuRef(prisma, skuRef);
      if (!resolved.ok) return Err(resolved.error);
      const rows = await prisma.matchingSet.findMany({
        where: { members: { some: { skuId: resolved.skuId } } },
        include: {
          setType: true,
          vendor: true,
          members: { include: { sku: true }, orderBy: [{ isPrimary: 'desc' }, { roleCode: 'asc' }] },
        },
        orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
      });
      return Ok(await Promise.all(rows.map(mapDetail)));
    } catch (cause) {
      return err('AccessConnectionError', cause instanceof Error ? cause.message : String(cause), cause);
    }
  },

  async create(input: MatchingSetCreateInput, actor: string): Promise<Result<MatchingSetDetail>> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const setTypeCode = cleanCode(input.setTypeCode);
        if (!setTypeCode) return { ok: false as const, error: { kind: 'ConstraintViolation' as const, message: 'setTypeCode is required.' } };
        const type = await ensureType(tx, setTypeCode, { requireActive: true });
        if (!type.ok) return type;

        const members = input.members ?? [];
        if (members.filter((m) => m.isPrimary === true).length > 1) {
          return { ok: false as const, error: { kind: 'ConstraintViolation' as const, message: 'Only one primary member is allowed.' } };
        }

        const resolvedMembers: ResolvedMatchingSetMember[] = [];
        for (const member of members) {
          const roleCode = cleanCode(member.roleCode);
          if (!roleCode) return { ok: false as const, error: { kind: 'ConstraintViolation' as const, message: 'roleCode is required for every member.' } };
          const role = await ensureRole(tx, setTypeCode, roleCode, { requireActive: true });
          if (!role.ok) return role;
          const sku = await resolveSkuRef(tx, member);
          if (!sku.ok) return sku;
          resolvedMembers.push({
            input: member,
            roleCode,
            skuId: sku.skuId,
            skuCode: sku.skuCode,
          });
        }

        const sourceMap = await loadSkuHeaderSources(tx, resolvedMembers.map((member) => member.skuId));
        const sources = resolvedMembers.map((member) => sourceMap.get(member.skuId) ?? fallbackSkuSource(member));
        const explicitPrimarySkuId = resolvedMembers.find((member) => member.input.isPrimary === true)?.skuId ?? null;
        const derivationPrimarySkuId = explicitPrimarySkuId ?? (resolvedMembers.length === 1 ? resolvedMembers[0]?.skuId ?? null : null);
        const header = mergeDerivedCreateHeader(
          input,
          deriveMatchingSetHeaderFromSkus(sources, derivationPrimarySkuId),
        );

        const code = cleanText(input.code) ?? await nextGeneratedCode(tx);
        const set = await tx.matchingSet.create({
          data: {
            code,
            setTypeCode,
            descriptionEs: input.descriptionEs ?? null,
            vendorId: header.vendorId,
            vendorStyle: header.vendorStyle,
            sharedColorCode: header.sharedColorCode,
            sharedColorLabel: header.sharedColorLabel,
            season: header.season,
            notes: input.notes ?? null,
            createdBy: actor,
            updatedBy: actor,
          },
        });
        await writePlanningFields(tx, set.id, {
          materialCode: header.materialCode,
          materialLabel: header.materialLabel,
          chainId: input.chainId,
          sellMode: input.sellMode,
          planningActive: input.planningActive,
        }, 'create');

        let primarySkuCode: string | null = null;
        let firstSkuCode: string | null = null;
        for (let i = 0; i < resolvedMembers.length; i++) {
          const member = resolvedMembers[i];
          firstSkuCode ??= member.skuCode;
          const isPrimary = member.input.isPrimary === true || (resolvedMembers.length === 1 && i === 0);
          if (isPrimary) primarySkuCode = member.skuCode;
          await tx.matchingSetMember.create({
            data: {
              setId: set.id,
              skuId: member.skuId,
              roleCode: member.roleCode,
              isPrimary,
              quantityRatio: new Prisma.Decimal(defaultQuantityRatio(setTypeCode, member.roleCode, member.input.quantityRatio)),
              addedBy: actor,
              updatedBy: actor,
            },
          });
        }
        const displayNameSkuCode = primarySkuCode ?? (resolvedMembers.length === 1 ? firstSkuCode : null);
        await writeDisplayName(tx, set.id, cleanText(input.displayName) ?? suggestedDisplayName({
          setTypeCode,
          vendorId: header.vendorId,
          vendorStyle: header.vendorStyle,
          sharedColorCode: header.sharedColorCode,
          sharedColorLabel: header.sharedColorLabel,
          primarySkuCode: displayNameSkuCode,
        }));
        return { ok: true as const, id: set.id };
      });
      if (!result.ok) return Err(result.error);
      await auditLog.record({ actor, action: 'matching_set_create', targetTable: TABLE_SET, targetPk: result.id, payload: input as unknown as Record<string, unknown> });
      return this.get(result.id);
    } catch (cause) {
      return err('DuplicatePrimaryKey', cause instanceof Error ? cause.message : String(cause), cause);
    }
  },

  async patch(id: string, input: MatchingSetPatchInput, actor: string): Promise<Result<MatchingSetDetail>> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.matchingSet.findUnique({ where: { id } });
        if (!existing) return { ok: false as const, error: { kind: 'NotFound' as const, message: `Matching set '${id}' was not found.` } };
        const setTypeCode = input.setTypeCode ? cleanCode(input.setTypeCode) : existing.setTypeCode;
        if (!setTypeCode) return { ok: false as const, error: { kind: 'ConstraintViolation' as const, message: 'setTypeCode is required.' } };
        const type = await ensureType(tx, setTypeCode, { requireActive: true });
        if (!type.ok) return type;
        if (setTypeCode !== existing.setTypeCode) {
          const members = await tx.matchingSetMember.findMany({ where: { setId: id } });
          for (const member of members) {
            const role = await ensureRole(tx, setTypeCode, member.roleCode, { requireActive: false });
            if (!role.ok) return role;
          }
        }
        await tx.matchingSet.update({
          where: { id },
          data: {
            ...(input.setTypeCode !== undefined ? { setTypeCode } : {}),
            ...(input.descriptionEs !== undefined ? { descriptionEs: input.descriptionEs } : {}),
            ...(input.vendorId !== undefined ? { vendorId: cleanText(input.vendorId) } : {}),
            ...(input.vendorStyle !== undefined ? { vendorStyle: cleanText(input.vendorStyle) } : {}),
            ...(input.sharedColorCode !== undefined ? { sharedColorCode: cleanText(input.sharedColorCode) } : {}),
            ...(input.sharedColorLabel !== undefined ? { sharedColorLabel: cleanText(input.sharedColorLabel) } : {}),
            ...(input.season !== undefined ? { season: cleanText(input.season) } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            updatedBy: actor,
          },
        });
        await writePlanningFields(tx, id, input, 'patch');
        if (input.displayName !== undefined) {
          await writeDisplayName(
            tx,
            id,
            cleanText(input.displayName) ?? await suggestDisplayNameForExistingSet(tx, id),
          );
        }
        return { ok: true as const };
      });
      if (!result.ok) return Err(result.error);
      await auditLog.record({ actor, action: 'matching_set_update', targetTable: TABLE_SET, targetPk: id, payload: input as unknown as Record<string, unknown> });
      return this.get(id);
    } catch (cause) {
      return err('AccessConnectionError', cause instanceof Error ? cause.message : String(cause), cause);
    }
  },

  async setActive(id: string, active: boolean, actor: string): Promise<Result<MatchingSetDetail>> {
    try {
      await prisma.matchingSet.update({ where: { id }, data: { active, updatedBy: actor } });
      await auditLog.record({
        actor,
        action: active ? 'matching_set_restore' : 'matching_set_archive',
        targetTable: TABLE_SET,
        targetPk: id,
        payload: { active },
      });
      return this.get(id);
    } catch (cause) {
      return err('NotFound', `Matching set '${id}' was not found.`, cause);
    }
  },

  async addMember(id: string, input: MatchingSetMemberInput, actor: string): Promise<Result<MatchingSetDetail>> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const set = await tx.matchingSet.findUnique({ where: { id } });
        if (!set) return { ok: false as const, error: { kind: 'NotFound' as const, message: `Matching set '${id}' was not found.` } };
        const roleCode = cleanCode(input.roleCode);
        if (!roleCode) return { ok: false as const, error: { kind: 'ConstraintViolation' as const, message: 'roleCode is required.' } };
        const role = await ensureRole(tx, set.setTypeCode, roleCode, { requireActive: true });
        if (!role.ok) return role;
        const sku = await resolveSkuRef(tx, input);
        if (!sku.ok) return sku;
        const existingMemberCount = await tx.matchingSetMember.count({ where: { setId: id } });
        if (input.isPrimary === true) {
          await tx.matchingSetMember.updateMany({ where: { setId: id, isPrimary: true }, data: { isPrimary: false, updatedBy: actor } });
        }
        await tx.matchingSetMember.create({
          data: {
            setId: id,
            skuId: sku.skuId,
            roleCode,
            isPrimary: input.isPrimary === true,
            quantityRatio: new Prisma.Decimal(defaultQuantityRatio(set.setTypeCode, roleCode, input.quantityRatio)),
            addedBy: actor,
            updatedBy: actor,
          },
        });
        if (existingMemberCount === 0) {
          const resolvedMember: ResolvedMatchingSetMember = {
            input,
            roleCode,
            skuId: sku.skuId,
            skuCode: sku.skuCode,
          };
          const sourceMap = await loadSkuHeaderSources(tx, [sku.skuId]);
          const source = sourceMap.get(sku.skuId) ?? fallbackSkuSource(resolvedMember);
          const header = mergeDerivedExistingHeader(set, deriveMatchingSetHeaderFromSkus([source], sku.skuId));
          const existingDisplayName = await loadDisplayName(tx, id);
          await tx.matchingSet.update({
            where: { id },
            data: {
              vendorId: header.vendorId,
              vendorStyle: header.vendorStyle,
              sharedColorCode: header.sharedColorCode,
              sharedColorLabel: header.sharedColorLabel,
              materialCode: header.materialCode,
              materialLabel: header.materialLabel,
              season: header.season,
              updatedBy: actor,
            },
          });
          if (!cleanText(existingDisplayName)) {
            await writeDisplayName(tx, id, suggestedDisplayName({
              setTypeCode: set.setTypeCode,
              vendorId: header.vendorId,
              vendorStyle: header.vendorStyle,
              sharedColorCode: header.sharedColorCode,
              sharedColorLabel: header.sharedColorLabel,
              primarySkuCode: sku.skuCode,
            }));
          }
        } else {
          await tx.matchingSet.update({ where: { id }, data: { updatedBy: actor } });
        }
        return { ok: true as const };
      });
      if (!result.ok) return Err(result.error);
      await auditLog.record({ actor, action: 'matching_set_member_add', targetTable: TABLE_MEMBER, targetPk: id, payload: input as unknown as Record<string, unknown> });
      return this.get(id);
    } catch (cause) {
      return err('DuplicatePrimaryKey', cause instanceof Error ? cause.message : String(cause), cause);
    }
  },

  async patchMember(id: string, skuId: string, input: MatchingSetMemberPatchInput, actor: string): Promise<Result<MatchingSetDetail>> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const set = await tx.matchingSet.findUnique({ where: { id } });
        if (!set) return { ok: false as const, error: { kind: 'NotFound' as const, message: `Matching set '${id}' was not found.` } };
        const member = await tx.matchingSetMember.findUnique({ where: { setId_skuId: { setId: id, skuId } } });
        if (!member) return { ok: false as const, error: { kind: 'NotFound' as const, message: `Member SKU '${skuId}' was not found in matching set '${id}'.` } };
        const roleCode = input.roleCode ? cleanCode(input.roleCode) : member.roleCode;
        if (!roleCode) return { ok: false as const, error: { kind: 'ConstraintViolation' as const, message: 'roleCode is required.' } };
        if (input.roleCode !== undefined) {
          const role = await ensureRole(tx, set.setTypeCode, roleCode, { requireActive: true });
          if (!role.ok) return role;
        }
        if (input.isPrimary === true) {
          await tx.matchingSetMember.updateMany({ where: { setId: id, isPrimary: true, skuId: { not: skuId } }, data: { isPrimary: false, updatedBy: actor } });
        }
        await tx.matchingSetMember.update({
          where: { setId_skuId: { setId: id, skuId } },
          data: {
            roleCode,
            ...(input.isPrimary !== undefined && input.isPrimary !== null ? { isPrimary: input.isPrimary } : {}),
            ...(input.quantityRatio != null ? { quantityRatio: new Prisma.Decimal(input.quantityRatio) } : {}),
            updatedBy: actor,
          },
        });
        await tx.matchingSet.update({ where: { id }, data: { updatedBy: actor } });
        return { ok: true as const };
      });
      if (!result.ok) return Err(result.error);
      await auditLog.record({ actor, action: 'matching_set_member_update', targetTable: TABLE_MEMBER, targetPk: `${id}:${skuId}`, payload: input as unknown as Record<string, unknown> });
      return this.get(id);
    } catch (cause) {
      return err('AccessConnectionError', cause instanceof Error ? cause.message : String(cause), cause);
    }
  },

  async removeMember(id: string, skuId: string, actor: string): Promise<Result<MatchingSetDetail>> {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.matchingSetMember.delete({ where: { setId_skuId: { setId: id, skuId } } });
        await tx.matchingSet.update({ where: { id }, data: { updatedBy: actor } });
      });
      await auditLog.record({ actor, action: 'matching_set_member_remove', targetTable: TABLE_MEMBER, targetPk: `${id}:${skuId}`, payload: {} });
      return this.get(id);
    } catch (cause) {
      return err('NotFound', `Member SKU '${skuId}' was not found in matching set '${id}'.`, cause);
    }
  },
};
