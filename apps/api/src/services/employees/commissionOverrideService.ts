import { CommissionOverride, CommissionOverrideScope, PrismaClient, User } from '../../prismaClient';
import { EmployeeNotFoundError } from './employeeService';

type OverrideTargetInput = {
  skuId?: string | null;
  categoryId?: string | null;
  departmentId?: string | null;
};

export interface CreateCommissionOverrideInput extends OverrideTargetInput {
  employeeId: string;
  scope: CommissionOverrideScope;
  rate: number | string;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
  actorUserId: string;
}

export interface UpdateCommissionOverrideInput extends OverrideTargetInput {
  scope?: CommissionOverrideScope;
  rate?: number | string;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
  actorUserId: string;
}

export interface ResolvedCommissionRate {
  employeeId: string;
  commissionBase: string;
  rate: string | null;
  override: CommissionOverride | null;
}

export class CommissionOverrideNotFoundError extends Error {
  code = 'COMMISSION_OVERRIDE_NOT_FOUND' as const;

  constructor(message = 'Commission override not found') {
    super(message);
    this.name = 'CommissionOverrideNotFoundError';
  }
}

export class CommissionOverrideValidationError extends Error {
  code = 'COMMISSION_OVERRIDE_INVALID' as const;

  constructor(message: string) {
    super(message);
    this.name = 'CommissionOverrideValidationError';
  }
}

async function requireEmployee(prisma: PrismaClient, employeeId: string): Promise<User> {
  const employee = await prisma.user.findFirst({
    where: {
      id: employeeId,
      isEmployee: true,
    },
  });
  if (!employee) {
    throw new EmployeeNotFoundError();
  }
  return employee;
}

async function requireCommissionOverride(prisma: PrismaClient, id: string): Promise<CommissionOverride> {
  const override = await prisma.commissionOverride.findUnique({ where: { id } });
  if (!override) {
    throw new CommissionOverrideNotFoundError();
  }
  return override;
}

function normalizeTarget(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function assertEffectiveRange(effectiveFrom: Date, effectiveTo?: Date | null): void {
  if (effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) {
    throw new CommissionOverrideValidationError('effectiveTo must be after effectiveFrom.');
  }
}

function normalizeTargetFields(
  scope: CommissionOverrideScope,
  input: OverrideTargetInput,
): Pick<CommissionOverride, 'skuId' | 'categoryId' | 'departmentId'> {
  const skuId = normalizeTarget(input.skuId);
  const categoryId = normalizeTarget(input.categoryId);
  const departmentId = normalizeTarget(input.departmentId);

  if (scope === 'SKU') {
    if (!skuId || categoryId || departmentId) {
      throw new CommissionOverrideValidationError('SKU overrides require only skuId.');
    }
    return { skuId, categoryId: null, departmentId: null };
  }

  if (scope === 'CATEGORY') {
    if (!categoryId || skuId || departmentId) {
      throw new CommissionOverrideValidationError('CATEGORY overrides require only categoryId.');
    }
    return { skuId: null, categoryId, departmentId: null };
  }

  if (!departmentId || skuId || categoryId) {
    throw new CommissionOverrideValidationError('DEPARTMENT overrides require only departmentId.');
  }
  return { skuId: null, categoryId: null, departmentId };
}

function isActiveAt(override: CommissionOverride, at: Date): boolean {
  return override.effectiveFrom.getTime() <= at.getTime()
    && (!override.effectiveTo || override.effectiveTo.getTime() >= at.getTime());
}

export async function listEmployeeCommissionOverrides(
  prisma: PrismaClient,
  employeeId: string,
): Promise<CommissionOverride[]> {
  await requireEmployee(prisma, employeeId);
  return prisma.commissionOverride.findMany({
    where: { employeeId },
    orderBy: [
      { scope: 'asc' },
      { effectiveFrom: 'desc' },
      { createdAt: 'desc' },
    ],
  });
}

export async function createCommissionOverride(
  prisma: PrismaClient,
  input: CreateCommissionOverrideInput,
): Promise<CommissionOverride> {
  await requireEmployee(prisma, input.employeeId);
  const effectiveFrom = input.effectiveFrom ?? new Date();
  assertEffectiveRange(effectiveFrom, input.effectiveTo);
  return prisma.commissionOverride.create({
    data: {
      employeeId: input.employeeId,
      scope: input.scope,
      ...normalizeTargetFields(input.scope, input),
      rate: input.rate,
      effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      createdByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
    },
  });
}

export async function updateCommissionOverride(
  prisma: PrismaClient,
  id: string,
  input: UpdateCommissionOverrideInput,
): Promise<CommissionOverride> {
  const existing = await requireCommissionOverride(prisma, id);
  const scope = input.scope ?? existing.scope;
  const effectiveFrom = input.effectiveFrom ?? existing.effectiveFrom;
  const effectiveTo = input.effectiveTo !== undefined ? input.effectiveTo : existing.effectiveTo;
  assertEffectiveRange(effectiveFrom, effectiveTo);
  const targetInput = input.scope !== undefined && input.scope !== existing.scope
    ? {
      skuId: input.skuId,
      categoryId: input.categoryId,
      departmentId: input.departmentId,
    }
    : {
      skuId: input.skuId !== undefined ? input.skuId : existing.skuId,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      departmentId: input.departmentId !== undefined ? input.departmentId : existing.departmentId,
    };
  return prisma.commissionOverride.update({
    where: { id },
    data: {
      scope,
      ...normalizeTargetFields(scope, targetInput),
      ...(input.rate !== undefined ? { rate: input.rate } : {}),
      ...(input.effectiveFrom !== undefined ? { effectiveFrom: input.effectiveFrom } : {}),
      ...(input.effectiveTo !== undefined ? { effectiveTo: input.effectiveTo } : {}),
      updatedByUserId: input.actorUserId,
    },
  });
}

export async function deleteCommissionOverride(
  prisma: PrismaClient,
  id: string,
): Promise<CommissionOverride> {
  await requireCommissionOverride(prisma, id);
  return prisma.commissionOverride.delete({ where: { id } });
}

export async function resolveCommissionRateForEmployee(
  prisma: PrismaClient,
  args: {
    employeeId: string;
    skuId?: string | null;
    categoryId?: string | null;
    departmentId?: string | null;
    at?: Date;
  },
): Promise<ResolvedCommissionRate> {
  const employee = await requireEmployee(prisma, args.employeeId);
  const at = args.at ?? new Date();
  const overrides = await prisma.commissionOverride.findMany({
    where: { employeeId: args.employeeId },
    orderBy: [
      { effectiveFrom: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  const activeOverrides = overrides.filter((override) => isActiveAt(override, at));
  const override = activeOverrides.find((candidate) => candidate.scope === 'SKU' && candidate.skuId === normalizeTarget(args.skuId))
    ?? activeOverrides.find((candidate) => candidate.scope === 'CATEGORY' && candidate.categoryId === normalizeTarget(args.categoryId))
    ?? activeOverrides.find((candidate) => candidate.scope === 'DEPARTMENT' && candidate.departmentId === normalizeTarget(args.departmentId))
    ?? null;

  return {
    employeeId: employee.id,
    commissionBase: employee.commissionBase,
    rate: override?.rate?.toString() ?? employee.commissionRate?.toString() ?? null,
    override,
  };
}
