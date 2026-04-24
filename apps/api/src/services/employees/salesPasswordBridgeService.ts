import { createHash, randomBytes } from 'node:crypto';
import {
  EmployeeSalesOverrideToken,
  EmployeeSalesPassword,
  PrismaClient,
  User,
} from '../../prismaClient';
import { EmployeeNotFoundError } from './employeeService';
import { hashPassword, verifyPassword } from './passwordHash';

export const SALES_PASSWORD_SCOPES = [
  'MANAGER_OVERRIDE',
  'VOID',
  'REFUND',
  'PRICE_OVERRIDE',
  'PERKS_EDIT',
  'DISCOUNT',
  'NO_SALE',
  'REPRINT',
  'CLOSE_BATCH',
  'PAY_OUT',
] as const;

export type EmployeeSalesPasswordScope = typeof SALES_PASSWORD_SCOPES[number];

const ADMIN_AUDIT_SCOPE = 'PASSWORD_ADMIN';
const FAILED_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const DAILY_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;
const LOCK_DURATION_MS = 30 * 60 * 1000;
const TOKEN_TTL_MS = 60 * 1000;

type PasswordWithEmployee = EmployeeSalesPassword & { employee: User };

function hashOpaqueToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function futureDate(msFromNow: number): Date {
  return new Date(Date.now() + msFromNow);
}

async function ensureEmployee(prisma: PrismaClient, employeeId: string): Promise<User> {
  const employee = await prisma.user.findUnique({ where: { id: employeeId } });
  if (!employee || !employee.isEmployee) {
    throw new EmployeeNotFoundError(employeeId);
  }
  return employee;
}

async function recordAudit(
  prisma: PrismaClient,
  args: {
    employeeId: string;
    passwordId?: string | null;
    scope: string;
    outcome: string;
    invokingUserId?: string | null;
    ticketId?: string | null;
    action?: string | null;
    ipAddress?: string | null;
  },
): Promise<void> {
  await prisma.employeeSalesPasswordAudit.create({
    data: {
      employeeId: args.employeeId,
      passwordId: args.passwordId ?? null,
      scope: args.scope,
      outcome: args.outcome,
      invokingUserId: args.invokingUserId ?? null,
      ticketId: args.ticketId ?? null,
      action: args.action ?? null,
      ipAddress: args.ipAddress ?? null,
    },
  });
}

async function findActivePasswords(prisma: PrismaClient): Promise<PasswordWithEmployee[]> {
  return prisma.employeeSalesPassword.findMany({
    where: {
      active: true,
      revokedAt: null,
      employee: {
        isEmployee: true,
      },
    },
    include: { employee: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function ensurePinUnique(
  prisma: PrismaClient,
  pin: string,
  excludePasswordId?: string,
): Promise<void> {
  const activePasswords = await findActivePasswords(prisma);
  for (const record of activePasswords) {
    if (record.id === excludePasswordId) continue;
    if (await verifyPassword(pin, record.pinHash)) {
      throw new SalesPasswordPinConflictError();
    }
  }
}

async function findPasswordByPin(
  prisma: PrismaClient,
  pin: string,
): Promise<PasswordWithEmployee | null> {
  const activePasswords = await findActivePasswords(prisma);
  for (const record of activePasswords) {
    if (await verifyPassword(pin, record.pinHash)) {
      return record;
    }
  }
  return null;
}

async function applyFailureState(
  prisma: PrismaClient,
  password: EmployeeSalesPassword,
  audit: {
    scope: string;
    invokingUserId?: string | null;
    ticketId?: string | null;
    action?: string | null;
    ipAddress?: string | null;
  },
): Promise<EmployeeSalesPassword> {
  const now = new Date();

  const failedAttempts =
    password.failedAttemptWindowStartedAt &&
    now.getTime() - password.failedAttemptWindowStartedAt.getTime() <= FAILED_ATTEMPT_WINDOW_MS
      ? password.failedAttempts + 1
      : 1;
  const failedAttemptWindowStartedAt =
    failedAttempts === 1 ? now : password.failedAttemptWindowStartedAt ?? now;

  const dailyFailedCount =
    password.dailyFailedWindowStartedAt &&
    now.getTime() - password.dailyFailedWindowStartedAt.getTime() <= DAILY_FAILURE_WINDOW_MS
      ? password.dailyFailedCount + 1
      : 1;
  const dailyFailedWindowStartedAt =
    dailyFailedCount === 1 ? now : password.dailyFailedWindowStartedAt ?? now;

  const active = dailyFailedCount >= 10 ? false : password.active;
  const revokedAt = dailyFailedCount >= 10 ? now : password.revokedAt;
  const lockedUntil =
    dailyFailedCount >= 10
      ? null
      : failedAttempts >= 5
        ? futureDate(LOCK_DURATION_MS)
        : password.lockedUntil;

  const outcome =
    dailyFailedCount >= 10
      ? 'REVOKED_TOO_MANY_FAILURES'
      : failedAttempts >= 5
        ? 'LOCKED_TOO_MANY_FAILURES'
        : 'INVALID_PIN';

  const updated = await prisma.employeeSalesPassword.update({
    where: { id: password.id },
    data: {
      active,
      revokedAt,
      failedAttempts,
      failedAttemptWindowStartedAt,
      dailyFailedCount,
      dailyFailedWindowStartedAt,
      lockedUntil,
    },
  });

  await recordAudit(prisma, {
    employeeId: password.employeeId,
    passwordId: password.id,
    scope: audit.scope,
    outcome,
    invokingUserId: audit.invokingUserId,
    ticketId: audit.ticketId,
    action: audit.action,
    ipAddress: audit.ipAddress,
  });

  return updated;
}

async function clearShortTermFailures(prisma: PrismaClient, passwordId: string): Promise<void> {
  await prisma.employeeSalesPassword.update({
    where: { id: passwordId },
    data: {
      failedAttempts: 0,
      failedAttemptWindowStartedAt: null,
      lockedUntil: null,
    },
  });
}

export class SalesPasswordPinConflictError extends Error {
  code = 'SALES_PASSWORD_PIN_CONFLICT';

  constructor() {
    super('That sales PIN is already active for another employee.');
  }
}

export class SalesPasswordNotFoundError extends Error {
  code = 'SALES_PASSWORD_NOT_FOUND';

  constructor(passwordId: string) {
    super(`Sales password ${passwordId} was not found.`);
  }
}

export class SalesPasswordLockedError extends Error {
  code = 'SALES_PASSWORD_LOCKED';
  lockedUntil: Date;

  constructor(lockedUntil: Date) {
    super('This sales password is temporarily locked.');
    this.lockedUntil = lockedUntil;
  }
}

export class SalesPasswordScopeDeniedError extends Error {
  code = 'SALES_PASSWORD_SCOPE_DENIED';

  constructor(scope: string) {
    super(`This sales password is not allowed for ${scope}.`);
  }
}

export class SalesPasswordInvalidError extends Error {
  code = 'INVALID_SALES_PASSWORD';

  constructor() {
    super('Sales PIN did not match an active employee password.');
  }
}

export class SalesPasswordTokenError extends Error {
  constructor(
    public code:
      | 'OVERRIDE_TOKEN_NOT_FOUND'
      | 'OVERRIDE_TOKEN_ALREADY_CONSUMED'
      | 'OVERRIDE_TOKEN_EXPIRED'
      | 'OVERRIDE_TOKEN_SCOPE_MISMATCH'
      | 'OVERRIDE_TOKEN_TICKET_MISMATCH'
      | 'OVERRIDE_TOKEN_ACTION_MISMATCH',
    message: string,
  ) {
    super(message);
  }
}

export async function listEmployeeSalesPasswords(
  prisma: PrismaClient,
  employeeId: string,
): Promise<EmployeeSalesPassword[]> {
  await ensureEmployee(prisma, employeeId);
  return prisma.employeeSalesPassword.findMany({
    where: { employeeId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function issueEmployeeSalesPassword(
  prisma: PrismaClient,
  args: {
    employeeId: string;
    pin: string;
    scopes: EmployeeSalesPasswordScope[];
    actorUserId: string;
  },
): Promise<EmployeeSalesPassword> {
  await ensureEmployee(prisma, args.employeeId);
  await ensurePinUnique(prisma, args.pin);

  const scopes = [...new Set(args.scopes)].sort();
  const pinHash = await hashPassword(args.pin);
  const now = new Date();

  await prisma.employeeSalesPassword.updateMany({
    where: {
      employeeId: args.employeeId,
      active: true,
      revokedAt: null,
    },
    data: {
      active: false,
      revokedAt: now,
      updatedByUserId: args.actorUserId,
    },
  });

  const password = await prisma.employeeSalesPassword.create({
    data: {
      employeeId: args.employeeId,
      pinHash,
      scopes,
      issuedByUserId: args.actorUserId,
      updatedByUserId: args.actorUserId,
    },
  });

  await recordAudit(prisma, {
    employeeId: args.employeeId,
    passwordId: password.id,
    scope: ADMIN_AUDIT_SCOPE,
    outcome: 'ISSUED',
    invokingUserId: args.actorUserId,
  });

  return password;
}

export async function revokeEmployeeSalesPassword(
  prisma: PrismaClient,
  args: {
    employeeId: string;
    passwordId: string;
    actorUserId: string;
  },
): Promise<EmployeeSalesPassword> {
  await ensureEmployee(prisma, args.employeeId);
  const existing = await prisma.employeeSalesPassword.findFirst({
    where: {
      id: args.passwordId,
      employeeId: args.employeeId,
    },
  });
  if (!existing) {
    throw new SalesPasswordNotFoundError(args.passwordId);
  }

  const revoked = await prisma.employeeSalesPassword.update({
    where: { id: args.passwordId },
    data: {
      active: false,
      revokedAt: new Date(),
      updatedByUserId: args.actorUserId,
      lockedUntil: null,
    },
  });

  await recordAudit(prisma, {
    employeeId: args.employeeId,
    passwordId: revoked.id,
    scope: ADMIN_AUDIT_SCOPE,
    outcome: 'REVOKED',
    invokingUserId: args.actorUserId,
  });

  return revoked;
}

export async function verifyEmployeeSalesPassword(
  prisma: PrismaClient,
  args: {
    pin: string;
    scope: EmployeeSalesPasswordScope;
    invokingUserId: string;
    employeeId?: string;
    ticketId?: string;
    action?: string;
    ipAddress?: string;
  },
): Promise<{
    password: EmployeeSalesPassword;
    employee: User;
    overrideToken: string;
    expiresAt: Date;
  }> {
  const now = new Date();

  let password: PasswordWithEmployee | null = null;
  if (args.employeeId) {
    await ensureEmployee(prisma, args.employeeId);
    const candidate = await prisma.employeeSalesPassword.findFirst({
      where: {
        employeeId: args.employeeId,
        active: true,
        revokedAt: null,
      },
      include: { employee: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!candidate) {
      throw new SalesPasswordInvalidError();
    }
    password = candidate;
    const ok = await verifyPassword(args.pin, candidate.pinHash);
    if (!ok) {
      const updated = await applyFailureState(prisma, candidate, args);
      if (!updated.active && updated.revokedAt) {
        throw new SalesPasswordInvalidError();
      }
      if (updated.lockedUntil && updated.lockedUntil.getTime() > now.getTime()) {
        throw new SalesPasswordLockedError(updated.lockedUntil);
      }
      throw new SalesPasswordInvalidError();
    }
  } else {
    password = await findPasswordByPin(prisma, args.pin);
    if (!password) {
      throw new SalesPasswordInvalidError();
    }
  }

  if (password.revokedAt || !password.active) {
    await recordAudit(prisma, {
      employeeId: password.employeeId,
      passwordId: password.id,
      scope: args.scope,
      outcome: 'REVOKED',
      invokingUserId: args.invokingUserId,
      ticketId: args.ticketId,
      action: args.action,
      ipAddress: args.ipAddress,
    });
    throw new SalesPasswordInvalidError();
  }

  if (password.lockedUntil && password.lockedUntil.getTime() > now.getTime()) {
    await recordAudit(prisma, {
      employeeId: password.employeeId,
      passwordId: password.id,
      scope: args.scope,
      outcome: 'LOCKED',
      invokingUserId: args.invokingUserId,
      ticketId: args.ticketId,
      action: args.action,
      ipAddress: args.ipAddress,
    });
    throw new SalesPasswordLockedError(password.lockedUntil);
  }

  if (!password.scopes.includes(args.scope)) {
    await recordAudit(prisma, {
      employeeId: password.employeeId,
      passwordId: password.id,
      scope: args.scope,
      outcome: 'DENIED_SCOPE',
      invokingUserId: args.invokingUserId,
      ticketId: args.ticketId,
      action: args.action,
      ipAddress: args.ipAddress,
    });
    throw new SalesPasswordScopeDeniedError(args.scope);
  }

  await clearShortTermFailures(prisma, password.id);

  const overrideToken = randomBytes(24).toString('base64url');
  const expiresAt = futureDate(TOKEN_TTL_MS);
  await prisma.employeeSalesOverrideToken.create({
    data: {
      passwordId: password.id,
      employeeId: password.employeeId,
      scope: args.scope,
      tokenHash: hashOpaqueToken(overrideToken),
      ticketId: args.ticketId ?? null,
      action: args.action ?? null,
      invokingUserId: args.invokingUserId,
      expiresAt,
    },
  });

  await recordAudit(prisma, {
    employeeId: password.employeeId,
    passwordId: password.id,
    scope: args.scope,
    outcome: 'GRANTED',
    invokingUserId: args.invokingUserId,
    ticketId: args.ticketId,
    action: args.action,
    ipAddress: args.ipAddress,
  });

  return {
    password,
    employee: password.employee,
    overrideToken,
    expiresAt,
  };
}

export async function consumeEmployeeSalesOverrideToken(
  prisma: PrismaClient,
  args: {
    overrideToken: string;
    scope: EmployeeSalesPasswordScope;
    invokingUserId: string;
    ticketId?: string;
    action?: string;
    ipAddress?: string;
  },
): Promise<EmployeeSalesOverrideToken> {
  const tokenHash = hashOpaqueToken(args.overrideToken);
  const token = await prisma.employeeSalesOverrideToken.findUnique({
    where: { tokenHash },
  });
  if (!token) {
    throw new SalesPasswordTokenError(
      'OVERRIDE_TOKEN_NOT_FOUND',
      'Override token was not found.',
    );
  }

  const now = new Date();
  if (token.consumedAt) {
    await recordAudit(prisma, {
      employeeId: token.employeeId,
      passwordId: token.passwordId,
      scope: token.scope,
      outcome: 'TOKEN_ALREADY_CONSUMED',
      invokingUserId: args.invokingUserId,
      ticketId: args.ticketId,
      action: args.action,
      ipAddress: args.ipAddress,
    });
    throw new SalesPasswordTokenError(
      'OVERRIDE_TOKEN_ALREADY_CONSUMED',
      'Override token has already been consumed.',
    );
  }
  if (token.expiresAt.getTime() <= now.getTime()) {
    await recordAudit(prisma, {
      employeeId: token.employeeId,
      passwordId: token.passwordId,
      scope: token.scope,
      outcome: 'TOKEN_EXPIRED',
      invokingUserId: args.invokingUserId,
      ticketId: args.ticketId,
      action: args.action,
      ipAddress: args.ipAddress,
    });
    throw new SalesPasswordTokenError(
      'OVERRIDE_TOKEN_EXPIRED',
      'Override token has expired.',
    );
  }
  if (token.scope !== args.scope) {
    await recordAudit(prisma, {
      employeeId: token.employeeId,
      passwordId: token.passwordId,
      scope: token.scope,
      outcome: 'TOKEN_SCOPE_MISMATCH',
      invokingUserId: args.invokingUserId,
      ticketId: args.ticketId,
      action: args.action,
      ipAddress: args.ipAddress,
    });
    throw new SalesPasswordTokenError(
      'OVERRIDE_TOKEN_SCOPE_MISMATCH',
      'Override token scope did not match the requested scope.',
    );
  }
  if (token.ticketId && args.ticketId && token.ticketId !== args.ticketId) {
    await recordAudit(prisma, {
      employeeId: token.employeeId,
      passwordId: token.passwordId,
      scope: token.scope,
      outcome: 'TOKEN_TICKET_MISMATCH',
      invokingUserId: args.invokingUserId,
      ticketId: args.ticketId,
      action: args.action,
      ipAddress: args.ipAddress,
    });
    throw new SalesPasswordTokenError(
      'OVERRIDE_TOKEN_TICKET_MISMATCH',
      'Override token ticket did not match.',
    );
  }
  if (token.action && args.action && token.action !== args.action) {
    await recordAudit(prisma, {
      employeeId: token.employeeId,
      passwordId: token.passwordId,
      scope: token.scope,
      outcome: 'TOKEN_ACTION_MISMATCH',
      invokingUserId: args.invokingUserId,
      ticketId: args.ticketId,
      action: args.action,
      ipAddress: args.ipAddress,
    });
    throw new SalesPasswordTokenError(
      'OVERRIDE_TOKEN_ACTION_MISMATCH',
      'Override token action did not match.',
    );
  }

  const consumed = await prisma.employeeSalesOverrideToken.update({
    where: { id: token.id },
    data: { consumedAt: now },
  });

  await recordAudit(prisma, {
    employeeId: token.employeeId,
    passwordId: token.passwordId,
    scope: token.scope,
    outcome: 'TOKEN_CONSUMED',
    invokingUserId: args.invokingUserId,
    ticketId: args.ticketId,
    action: args.action,
    ipAddress: args.ipAddress,
  });

  return consumed;
}


