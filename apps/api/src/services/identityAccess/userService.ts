import { PrismaClient, User } from '../../prismaClient';
import { hashPassword, verifyPassword } from './passwordHash';
import { revokeUserSessions } from './sessionService';
import { assertRoleAssignable } from './roleManagementService';

export interface CreateUserInput {
  email: string;
  displayName: string;
  password: string;
  roleId: string;
  ricsUserId?: string | null;
  salespersonCode?: string | null;
  active?: boolean;
  isEmployee?: boolean;
  otherInformation?: string | null;
  commissionRate?: number | string | null;
  commissionBase?: string;
  homeStoreId?: string | null;
  hireDate?: Date | null;
  terminatedAt?: Date | null;
  timeClockEnabled?: boolean;
  timeClockPinHash?: string | null;
}

export interface UpdateUserInput {
  email?: string;
  displayName?: string;
  roleId?: string;
  active?: boolean;
  ricsUserId?: string | null;
  salespersonCode?: string | null;
  isEmployee?: boolean;
  otherInformation?: string | null;
  commissionRate?: number | string | null;
  commissionBase?: string;
  homeStoreId?: string | null;
  hireDate?: Date | null;
  terminatedAt?: Date | null;
  timeClockEnabled?: boolean;
  timeClockPinHash?: string | null;
}

export class SalespersonCodeConflictError extends Error {
  code = 'SALESPERSON_CODE_CONFLICT' as const;

  constructor(message = 'Salesperson code already in use') {
    super(message);
    this.name = 'SalespersonCodeConflictError';
  }
}

function normalizeOptionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeSalespersonCode(value: string | null | undefined): string | null | undefined {
  const normalized = normalizeOptionalText(value);
  if (normalized === undefined || normalized === null) return normalized;
  return normalized.toUpperCase();
}

async function assertSalespersonCodeAvailable(
  prisma: PrismaClient,
  salespersonCode: string | null | undefined,
  excludeUserId?: string,
): Promise<void> {
  if (!salespersonCode) return;
  const conflict = await prisma.user.findFirst({
    where: {
      salespersonCode,
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  if (conflict) {
    throw new SalespersonCodeConflictError();
  }
}

export async function createUser(prisma: PrismaClient, input: CreateUserInput): Promise<User> {
  const salespersonCode = normalizeSalespersonCode(input.salespersonCode) ?? null;
  await assertRoleAssignable(prisma, input.roleId);
  await assertSalespersonCodeAvailable(prisma, salespersonCode);
  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      email: input.email.toLowerCase().trim(),
      displayName: input.displayName.trim(),
      passwordHash,
      roleId: input.roleId,
      ricsUserId: input.ricsUserId ?? null,
      salespersonCode,
      active: input.active ?? true,
      isEmployee: input.isEmployee ?? Boolean(salespersonCode),
      otherInformation: normalizeOptionalText(input.otherInformation) ?? null,
      commissionRate: input.commissionRate ?? null,
      commissionBase: input.commissionBase ?? 'NET_SALES',
      homeStoreId: normalizeOptionalText(input.homeStoreId) ?? null,
      hireDate: input.hireDate ?? null,
      terminatedAt: input.terminatedAt ?? null,
      timeClockEnabled: input.timeClockEnabled ?? true,
      timeClockPinHash: input.timeClockPinHash ?? null,
    },
  });
}

export async function updateUser(
  prisma: PrismaClient,
  id: string,
  input: UpdateUserInput,
): Promise<User> {
  const salespersonCode = normalizeSalespersonCode(input.salespersonCode);
  if (input.roleId !== undefined) await assertRoleAssignable(prisma, input.roleId);
  await assertSalespersonCodeAvailable(prisma, salespersonCode, id);
  const before = await prisma.user.findUnique({
    where: { id },
    select: { active: true, roleId: true },
  });

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.email !== undefined ? { email: input.email.toLowerCase().trim() } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.ricsUserId !== undefined ? { ricsUserId: input.ricsUserId } : {}),
      ...(salespersonCode !== undefined ? { salespersonCode } : {}),
      ...(input.isEmployee !== undefined ? { isEmployee: input.isEmployee } : {}),
      ...(input.otherInformation !== undefined
        ? { otherInformation: normalizeOptionalText(input.otherInformation) }
        : {}),
      ...(input.commissionRate !== undefined ? { commissionRate: input.commissionRate } : {}),
      ...(input.commissionBase !== undefined ? { commissionBase: input.commissionBase } : {}),
      ...(input.homeStoreId !== undefined
        ? { homeStoreId: normalizeOptionalText(input.homeStoreId) }
        : {}),
      ...(input.hireDate !== undefined ? { hireDate: input.hireDate } : {}),
      ...(input.terminatedAt !== undefined ? { terminatedAt: input.terminatedAt } : {}),
      ...(input.timeClockEnabled !== undefined ? { timeClockEnabled: input.timeClockEnabled } : {}),
      ...(input.timeClockPinHash !== undefined ? { timeClockPinHash: input.timeClockPinHash } : {}),
    },
  });

  if ((input.active === false && before?.active !== false) || (input.roleId && input.roleId !== before?.roleId)) {
    await revokeUserSessions(prisma, id);
  }

  return updated;
}

export async function deactivateUser(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.user.update({ where: { id }, data: { active: false } });
  await revokeUserSessions(prisma, id);
}

// Compatibility name for existing route/tests. Identity & Access never hard
// deletes users because historical tickets, time-clock rows, and audit records
// must keep their actor attribution.
export async function deleteUser(prisma: PrismaClient, id: string): Promise<void> {
  await deactivateUser(prisma, id);
}

export async function changePassword(
  prisma: PrismaClient,
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; reason: 'wrong-password' }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, reason: 'wrong-password' };
  const ok = await verifyPassword(oldPassword, user.passwordHash);
  if (!ok) return { ok: false, reason: 'wrong-password' };
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: true };
}

export async function resetUserPassword(
  prisma: PrismaClient,
  userId: string,
  newPassword: string,
): Promise<{ ok: true; revokedCount: number } | { ok: false; reason: 'not-found' }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { ok: false, reason: 'not-found' };

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  const revokedCount = await revokeUserSessions(prisma, userId);
  return { ok: true, revokedCount };
}

export async function authenticate(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<User | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (!user || !user.active) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  return user;
}
