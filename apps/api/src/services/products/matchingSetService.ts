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
): Promise<{ ok: true; skuId: string } | { ok: false; error: RepoError }> {
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

  const sku = await tx.sku.findFirst({ where, select: { id: true } });
  if (!sku) {
    return { ok: false, error: { kind: 'NotFound', message: `SKU '${value}' was not found.` } };
  }
  return { ok: true, skuId: sku.id };
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
  materialCode: string | null;
  materialLabel: string | null;
  chainId: string | null;
  chainLabel: string | null;
  sellMode: 'separates' | 'bundle_required';
  planningActive: boolean;
}

async function loadPlanningFields(id: string): Promise<MatchingSetPlanningFields> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    material_code: string | null;
    material_label: string | null;
    chain_id: string | null;
    chain_label: string | null;
    sell_mode: string | null;
    planning_active: boolean | null;
  }>>(
    `
      SELECT
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
  return {
    id: row.id,
    code: row.code,
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
      if (filters.q) {
        const q = filters.q.trim();
        and.push({
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { descriptionEs: { contains: q, mode: 'insensitive' } },
            { vendorStyle: { contains: q, mode: 'insensitive' } },
            { materialCode: { contains: q, mode: 'insensitive' } },
            { materialLabel: { contains: q, mode: 'insensitive' } },
            { sharedColorCode: { contains: q, mode: 'insensitive' } },
            { sharedColorLabel: { contains: q, mode: 'insensitive' } },
            { vendor: { shortName: { contains: q, mode: 'insensitive' } } },
            { vendor: { mailName: { contains: q, mode: 'insensitive' } } },
            { members: { some: { sku: { code: { contains: q, mode: 'insensitive' } } } } },
            { members: { some: { sku: { provisionalCode: { contains: q, mode: 'insensitive' } } } } },
            { members: { some: { sku: { vendorSku: { contains: q, mode: 'insensitive' } } } } },
          ],
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
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      const mapped = await Promise.all(rows.map(mapDetail));
      const filtered = filters.hasGap == null ? mapped : mapped.filter((d) => (d.gaps.length > 0) === filters.hasGap);
      return Ok(filtered.map((d) => ({
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

        const code = cleanText(input.code) ?? await nextGeneratedCode(tx);
        const set = await tx.matchingSet.create({
          data: {
            code,
            setTypeCode,
            descriptionEs: input.descriptionEs ?? null,
            vendorId: cleanText(input.vendorId),
            vendorStyle: cleanText(input.vendorStyle),
            sharedColorCode: cleanText(input.sharedColorCode),
            sharedColorLabel: cleanText(input.sharedColorLabel),
            season: cleanText(input.season),
            notes: input.notes ?? null,
            createdBy: actor,
            updatedBy: actor,
          },
        });
        await writePlanningFields(tx, set.id, input, 'create');

        for (let i = 0; i < members.length; i++) {
          const member = members[i];
          const roleCode = cleanCode(member.roleCode);
          if (!roleCode) return { ok: false as const, error: { kind: 'ConstraintViolation' as const, message: 'roleCode is required for every member.' } };
          const role = await ensureRole(tx, setTypeCode, roleCode, { requireActive: true });
          if (!role.ok) return role;
          const sku = await resolveSkuRef(tx, member);
          if (!sku.ok) return sku;
          await tx.matchingSetMember.create({
            data: {
              setId: set.id,
              skuId: sku.skuId,
              roleCode,
              isPrimary: member.isPrimary === true || (members.length === 1 && i === 0),
              quantityRatio: new Prisma.Decimal(defaultQuantityRatio(setTypeCode, roleCode, member.quantityRatio)),
              addedBy: actor,
              updatedBy: actor,
            },
          });
        }
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
        await tx.matchingSet.update({ where: { id }, data: { updatedBy: actor } });
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
