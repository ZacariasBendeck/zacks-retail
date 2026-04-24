import { Prisma, PrismaClient, TimeClockEntry, TimeClockEntryAdjustment, TimeClockPolicy, User } from '../../prismaClient';
import { EmployeeNotFoundError } from './employeeService';
import { verifyPassword } from './passwordHash';
import { PERMISSIONS } from './permissions';

const MAX_SHIFT_MS = 24 * 60 * 60 * 1000;
type TimeClockDbClient = PrismaClient | Prisma.TransactionClient;
const TIME_CLOCK_EMPLOYEE_SELECT = {
  id: true,
  displayName: true,
  salespersonCode: true,
};

type TimeClockEmployeeSummary = Pick<User, 'id' | 'displayName' | 'salespersonCode'>;
export type TimeClockEntryWithEmployee = TimeClockEntry & { employee: TimeClockEmployeeSummary };
export type TimeClockAdjustmentResult = {
  entry: TimeClockEntry;
  adjustment: TimeClockEntryAdjustment;
};
export type TimeClockAdjustmentListEntry = TimeClockEntryAdjustment;

export type TimeClockEntryStatus = 'OPEN' | 'AUTO_CLOSED' | 'CLOSED';

export interface TimeClockPolicyState {
  storeId: number;
  enabled: boolean;
  requireClockInBeforeSale: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export class TimeClockPolicyDisabledError extends Error {
  code = 'TIME_CLOCK_DISABLED';

  constructor(storeId: number) {
    super(`Time clock is disabled for store ${storeId}.`);
  }
}

export class TimeClockForbiddenError extends Error {
  code = 'TIME_CLOCK_FORBIDDEN';

  constructor(message = 'You are not allowed to perform that time clock action.') {
    super(message);
  }
}

export class TimeClockPinRequiredError extends Error {
  code = 'TIME_CLOCK_PIN_REQUIRED';

  constructor() {
    super('A time clock PIN is required for self clock-in and clock-out.');
  }
}

export class TimeClockInvalidPinError extends Error {
  code = 'TIME_CLOCK_INVALID_PIN';

  constructor() {
    super('Time clock PIN did not match.');
  }
}

export class TimeClockSelfServiceDisabledError extends Error {
  code = 'TIME_CLOCK_SELF_SERVICE_DISABLED';

  constructor() {
    super('This employee cannot use self-service time clock actions.');
  }
}

export class TimeClockAlreadyClockedInError extends Error {
  code = 'TIME_CLOCK_ALREADY_CLOCKED_IN';
  entry: TimeClockEntry;

  constructor(entry: TimeClockEntry) {
    super('That employee already has an open time clock entry.');
    this.entry = entry;
  }
}

export class TimeClockNotClockedInError extends Error {
  code = 'TIME_CLOCK_NOT_CLOCKED_IN';

  constructor(employeeId: string) {
    super(`Employee ${employeeId} does not have an open time clock entry.`);
  }
}

export class TimeClockEntryNotFoundError extends Error {
  code = 'TIME_CLOCK_ENTRY_NOT_FOUND';

  constructor(entryId: string) {
    super(`Time clock entry ${entryId} was not found.`);
  }
}

export class TimeClockInvalidRangeError extends Error {
  code = 'TIME_CLOCK_INVALID_RANGE';

  constructor() {
    super('Clock-out time must be after clock-in time.');
  }
}

export class TimeClockShiftTooLongError extends Error {
  code = 'TIME_CLOCK_SHIFT_TOO_LONG';

  constructor() {
    super('Time clock entries cannot exceed 24 hours.');
  }
}

export interface TimeClockDetailReportRow {
  entryId: string;
  employeeId: string;
  salespersonCode: string | null;
  employeeName: string;
  storeId: number;
  clockedInAt: Date;
  clockedOutAt: Date | null;
  workedMinutes: number;
  workedHoursDecimal: number;
  nonSales: boolean;
  status: TimeClockEntryStatus;
  note: string | null;
}

export interface TimeClockSummaryReportRow {
  employeeId: string;
  salespersonCode: string | null;
  employeeName: string;
  totalEntries: number;
  totalMinutes: number;
  totalHoursDecimal: number;
  salesMinutes: number;
  salesHoursDecimal: number;
  nonSalesMinutes: number;
  nonSalesHoursDecimal: number;
  openEntries: number;
  autoClosedEntries: number;
}

export interface TimeClockReportResult {
  generatedAt: Date;
  detail: boolean;
  rows: TimeClockDetailReportRow[] | TimeClockSummaryReportRow[];
  totals: {
    totalEntries: number;
    totalMinutes: number;
    totalHoursDecimal: number;
  };
}

function asPermissionSet(permissions?: Iterable<string> | null): Set<string> {
  return permissions ? new Set(permissions) : new Set<string>();
}

function nowOr(input?: Date): Date {
  return input ? new Date(input) : new Date();
}

function buildTimeRangeWhere(args: {
  from?: Date;
  to?: Date;
}): Prisma.TimeClockEntryWhereInput {
  const and: Prisma.TimeClockEntryWhereInput[] = [];
  if (args.to) {
    and.push({ clockedInAt: { lte: args.to } });
  }
  if (args.from) {
    and.push({
      OR: [
        { clockedOutAt: null },
        { clockedOutAt: { gte: args.from } },
      ],
    });
  }
  if (and.length === 0) {
    return {};
  }
  return { AND: and };
}

function assertShiftWindow(
  clockedInAt: Date,
  clockedOutAt: Date | null,
  referenceAt = new Date(),
): void {
  const effectiveClockOutAt = clockedOutAt ?? referenceAt;
  if (effectiveClockOutAt.getTime() < clockedInAt.getTime()) {
    throw new TimeClockInvalidRangeError();
  }
  if (effectiveClockOutAt.getTime() - clockedInAt.getTime() > MAX_SHIFT_MS) {
    throw new TimeClockShiftTooLongError();
  }
}

export function getTimeClockEntryStatus(entry: TimeClockEntry): TimeClockEntryStatus {
  if (entry.clockedOutAt == null) return 'OPEN';
  if (entry.autoClosedAtCap) return 'AUTO_CLOSED';
  return 'CLOSED';
}

export function workedMinutesForEntry(
  entry: Pick<TimeClockEntry, 'clockedInAt' | 'clockedOutAt' | 'autoClosedAtCap'>,
  args?: {
    from?: Date;
    to?: Date;
    referenceAt?: Date;
  },
): number {
  if (entry.autoClosedAtCap) {
    return 0;
  }
  const effectiveClockOutAt = entry.clockedOutAt ?? args?.referenceAt ?? new Date();
  const effectiveStart = args?.from && args.from.getTime() > entry.clockedInAt.getTime()
    ? args.from
    : entry.clockedInAt;
  const effectiveEnd = args?.to && args.to.getTime() < effectiveClockOutAt.getTime()
    ? args.to
    : effectiveClockOutAt;
  if (effectiveEnd.getTime() <= effectiveStart.getTime()) {
    return 0;
  }
  return Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / 60000);
}

export function hoursDecimalFromMinutes(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

function capClockOutAt(entry: TimeClockEntry, requestedAt: Date): { clockedOutAt: Date; autoClosedAtCap: boolean } {
  const cap = new Date(entry.clockedInAt.getTime() + MAX_SHIFT_MS);
  if (requestedAt.getTime() > cap.getTime()) {
    return { clockedOutAt: cap, autoClosedAtCap: true };
  }
  return { clockedOutAt: requestedAt, autoClosedAtCap: false };
}

async function requireEmployee(prisma: TimeClockDbClient, employeeId: string): Promise<User> {
  const employee = await prisma.user.findFirst({
    where: {
      id: employeeId,
      isEmployee: true,
      active: true,
    },
  });
  if (!employee) {
    throw new EmployeeNotFoundError(employeeId);
  }
  return employee;
}

async function requireTimeClockEntry(prisma: TimeClockDbClient, entryId: string): Promise<TimeClockEntry> {
  const entry = await prisma.timeClockEntry.findUnique({ where: { id: entryId } });
  if (!entry) {
    throw new TimeClockEntryNotFoundError(entryId);
  }
  return entry;
}

async function ensurePolicyEnabled(prisma: TimeClockDbClient, storeId: number): Promise<TimeClockPolicyState> {
  const policy = await getTimeClockPolicy(prisma, storeId);
  if (!policy.enabled) {
    throw new TimeClockPolicyDisabledError(storeId);
  }
  return policy;
}

async function assertSelfServicePin(employee: User, pin?: string | null): Promise<void> {
  if (!employee.timeClockEnabled || !employee.timeClockPinHash) {
    throw new TimeClockSelfServiceDisabledError();
  }
  if (!pin) {
    throw new TimeClockPinRequiredError();
  }
  const ok = await verifyPassword(pin, employee.timeClockPinHash);
  if (!ok) {
    throw new TimeClockInvalidPinError();
  }
}

async function findOpenEntry(prisma: TimeClockDbClient, employeeId: string): Promise<TimeClockEntry | null> {
  return prisma.timeClockEntry.findFirst({
    where: {
      employeeId,
      clockedOutAt: null,
    },
    orderBy: { clockedInAt: 'desc' },
  });
}

async function maybeAutoCloseExpiredEntry(
  prisma: TimeClockDbClient,
  entry: TimeClockEntry | null,
  actorUserId: string,
  referenceAt: Date,
): Promise<TimeClockEntry | null> {
  if (!entry) return null;
  const capped = capClockOutAt(entry, referenceAt);
  if (capped.autoClosedAtCap) {
    return prisma.timeClockEntry.update({
      where: { id: entry.id },
      data: {
        clockedOutAt: capped.clockedOutAt,
        autoClosedAtCap: true,
        clockedOutByUserId: actorUserId,
      },
    });
  }
  return entry;
}

async function resolveTargetEmployee(
  prisma: TimeClockDbClient,
  args: {
    actorUserId: string;
    permissions?: Iterable<string> | null;
    targetEmployeeId?: string;
    pin?: string | null;
  },
): Promise<User> {
  const permissions = asPermissionSet(args.permissions);
  const targetEmployeeId = args.targetEmployeeId ?? args.actorUserId;
  const target = await requireEmployee(prisma, targetEmployeeId);
  const isSelf = target.id === args.actorUserId;

  if (isSelf) {
    if (!permissions.has(PERMISSIONS.TIME_CLOCK_SELF)) {
      throw new TimeClockForbiddenError();
    }
    await assertSelfServicePin(target, args.pin);
    return target;
  }

  if (!permissions.has(PERMISSIONS.TIME_CLOCK_MANAGE)) {
    throw new TimeClockForbiddenError();
  }

  return target;
}

export async function getTimeClockPolicy(
  prisma: TimeClockDbClient,
  storeId: number,
): Promise<TimeClockPolicyState> {
  const policy = await prisma.timeClockPolicy.findUnique({ where: { storeId } });
  if (!policy) {
    return {
      storeId,
      enabled: false,
      requireClockInBeforeSale: false,
      createdAt: null,
      updatedAt: null,
    };
  }
  return policy;
}

export async function setTimeClockPolicy(
  prisma: TimeClockDbClient,
  args: {
    storeId: number;
    enabled: boolean;
    requireClockInBeforeSale?: boolean;
  },
): Promise<TimeClockPolicy> {
  return prisma.timeClockPolicy.upsert({
    where: { storeId: args.storeId },
    update: {
      enabled: args.enabled,
      requireClockInBeforeSale: args.requireClockInBeforeSale ?? false,
    },
    create: {
      storeId: args.storeId,
      enabled: args.enabled,
      requireClockInBeforeSale: args.requireClockInBeforeSale ?? false,
    },
  });
}

export async function clockInEmployee(
  prisma: TimeClockDbClient,
  args: {
    actorUserId: string;
    permissions?: Iterable<string> | null;
    storeId: number;
    targetEmployeeId?: string;
    pin?: string | null;
    nonSales?: boolean;
    at?: Date;
    note?: string | null;
  },
): Promise<TimeClockEntry> {
  const at = nowOr(args.at);
  const employee = await resolveTargetEmployee(prisma, {
    actorUserId: args.actorUserId,
    permissions: args.permissions,
    targetEmployeeId: args.targetEmployeeId,
    pin: args.pin,
  });

  await ensurePolicyEnabled(prisma, args.storeId);

  const openEntry = await maybeAutoCloseExpiredEntry(
    prisma,
    await findOpenEntry(prisma, employee.id),
    args.actorUserId,
    at,
  );
  if (openEntry && !openEntry.clockedOutAt) {
    throw new TimeClockAlreadyClockedInError(openEntry);
  }

  return prisma.timeClockEntry.create({
    data: {
      employeeId: employee.id,
      storeId: args.storeId,
      clockedInAt: at,
      nonSales: args.nonSales ?? false,
      clockedInByUserId: args.actorUserId,
      note: args.note ?? null,
    },
  });
}

export async function clockOutEmployee(
  prisma: TimeClockDbClient,
  args: {
    actorUserId: string;
    permissions?: Iterable<string> | null;
    targetEmployeeId?: string;
    pin?: string | null;
    at?: Date;
    note?: string | null;
  },
): Promise<TimeClockEntry> {
  const at = nowOr(args.at);
  const employee = await resolveTargetEmployee(prisma, {
    actorUserId: args.actorUserId,
    permissions: args.permissions,
    targetEmployeeId: args.targetEmployeeId,
    pin: args.pin,
  });

  const openEntry = await findOpenEntry(prisma, employee.id);
  if (!openEntry) {
    throw new TimeClockNotClockedInError(employee.id);
  }

  assertShiftWindow(openEntry.clockedInAt, at);
  const capped = capClockOutAt(openEntry, at);
  return prisma.timeClockEntry.update({
    where: { id: openEntry.id },
    data: {
      clockedOutAt: capped.clockedOutAt,
      autoClosedAtCap: capped.autoClosedAtCap,
      clockedOutByUserId: args.actorUserId,
      note: args.note ?? openEntry.note,
    },
  });
}

export async function listOpenTimeClockEntries(
  prisma: TimeClockDbClient,
  args: {
    storeId?: number;
    employeeId?: string;
  },
): Promise<TimeClockEntryWithEmployee[]> {
  return prisma.timeClockEntry.findMany({
    where: {
      clockedOutAt: null,
      ...(args.storeId !== undefined ? { storeId: args.storeId } : {}),
      ...(args.employeeId ? { employeeId: args.employeeId } : {}),
    },
    orderBy: [
      { clockedInAt: 'desc' },
      { createdAt: 'desc' },
    ],
    include: {
      employee: {
        select: TIME_CLOCK_EMPLOYEE_SELECT,
      },
    },
  });
}

export async function listTimeClockEntries(
  prisma: TimeClockDbClient,
  args: {
    storeId?: number;
    employeeId?: string;
    from?: Date;
    to?: Date;
  },
): Promise<TimeClockEntryWithEmployee[]> {
  return prisma.timeClockEntry.findMany({
    where: {
      ...(args.storeId !== undefined ? { storeId: args.storeId } : {}),
      ...(args.employeeId ? { employeeId: args.employeeId } : {}),
      ...buildTimeRangeWhere(args),
    },
    orderBy: [
      { clockedInAt: 'desc' },
      { createdAt: 'desc' },
    ],
    include: {
      employee: {
        select: TIME_CLOCK_EMPLOYEE_SELECT,
      },
    },
  });
}

export async function adjustTimeClockEntry(
  prisma: PrismaClient,
  args: {
    actorUserId: string;
    permissions?: Iterable<string> | null;
    entryId: string;
    storeId?: number;
    clockedInAt?: Date;
    clockedOutAt?: Date | null;
    nonSales?: boolean;
    note?: string | null;
    reason: string;
  },
): Promise<TimeClockAdjustmentResult> {
  const permissions = asPermissionSet(args.permissions);
  if (!permissions.has(PERMISSIONS.TIME_CLOCK_MANAGE)) {
    throw new TimeClockForbiddenError();
  }

  return prisma.$transaction(async (tx) => {
    const entry = await requireTimeClockEntry(tx, args.entryId);
    const nextStoreId = args.storeId ?? entry.storeId;
    const nextClockedInAt = args.clockedInAt ?? entry.clockedInAt;
    const nextClockedOutAt = args.clockedOutAt !== undefined ? args.clockedOutAt : entry.clockedOutAt;
    const nextNonSales = args.nonSales ?? entry.nonSales;
    const nextNote = args.note !== undefined ? args.note : entry.note;
    const nextAutoClosedAtCap = args.clockedInAt !== undefined || args.clockedOutAt !== undefined
      ? false
      : entry.autoClosedAtCap;

    if (nextClockedOutAt) {
      assertShiftWindow(nextClockedInAt, nextClockedOutAt);
    }

    if (nextClockedOutAt == null) {
      const otherOpenEntry = await tx.timeClockEntry.findFirst({
        where: {
          employeeId: entry.employeeId,
          clockedOutAt: null,
          NOT: { id: entry.id },
        },
        orderBy: { clockedInAt: 'desc' },
      });
      if (otherOpenEntry) {
        throw new TimeClockAlreadyClockedInError(otherOpenEntry);
      }
    }

    const updated = await tx.timeClockEntry.update({
      where: { id: entry.id },
      data: {
        storeId: nextStoreId,
        clockedInAt: nextClockedInAt,
        clockedOutAt: nextClockedOutAt,
        nonSales: nextNonSales,
        note: nextNote,
        autoClosedAtCap: nextAutoClosedAtCap,
        clockedOutByUserId: nextClockedOutAt == null ? null : (entry.clockedOutByUserId ?? args.actorUserId),
      },
    });

    const adjustment = await tx.timeClockEntryAdjustment.create({
      data: {
        timeClockEntryId: entry.id,
        employeeId: entry.employeeId,
        actedByUserId: args.actorUserId,
        reason: args.reason,
        previousStoreId: entry.storeId,
        nextStoreId,
        previousClockedInAt: entry.clockedInAt,
        nextClockedInAt,
        previousClockedOutAt: entry.clockedOutAt,
        nextClockedOutAt,
        previousNonSales: entry.nonSales,
        nextNonSales,
        previousAutoClosedAtCap: entry.autoClosedAtCap,
        nextAutoClosedAtCap,
        previousNote: entry.note,
        nextNote,
      },
    });

    return { entry: updated, adjustment };
  });
}

export async function listTimeClockEntryAdjustments(
  prisma: TimeClockDbClient,
  args: {
    entryId: string;
  },
): Promise<TimeClockAdjustmentListEntry[]> {
  await requireTimeClockEntry(prisma, args.entryId);
  return prisma.timeClockEntryAdjustment.findMany({
    where: { timeClockEntryId: args.entryId },
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
  });
}

export async function listTimeClockReconciliationEntries(
  prisma: TimeClockDbClient,
  args: {
    storeId?: number;
    employeeId?: string;
    from?: Date;
    to?: Date;
    status?: 'OPEN' | 'AUTO_CLOSED' | 'ALL';
  },
): Promise<TimeClockEntryWithEmployee[]> {
  const status = args.status ?? 'ALL';
  return prisma.timeClockEntry.findMany({
    where: {
      ...(args.storeId !== undefined ? { storeId: args.storeId } : {}),
      ...(args.employeeId ? { employeeId: args.employeeId } : {}),
      ...buildTimeRangeWhere(args),
      ...(status === 'OPEN'
        ? { clockedOutAt: null }
        : status === 'AUTO_CLOSED'
          ? { autoClosedAtCap: true }
          : {
            OR: [
              { clockedOutAt: null },
              { autoClosedAtCap: true },
            ],
          }),
    },
    orderBy: [
      { clockedInAt: 'asc' },
      { createdAt: 'asc' },
    ],
    include: {
      employee: {
        select: TIME_CLOCK_EMPLOYEE_SELECT,
      },
    },
  });
}

export async function buildTimeClockReport(
  prisma: TimeClockDbClient,
  args: {
    storeIds?: number[];
    employeeIds?: string[];
    from?: Date;
    to?: Date;
    detail?: boolean;
    referenceAt?: Date;
  },
): Promise<TimeClockReportResult> {
  const referenceAt = args.referenceAt ?? new Date();
  const entries = await prisma.timeClockEntry.findMany({
    where: {
      ...(args.storeIds?.length ? { storeId: { in: args.storeIds } } : {}),
      ...(args.employeeIds?.length ? { employeeId: { in: args.employeeIds } } : {}),
      ...buildTimeRangeWhere(args),
    },
    orderBy: [
      { clockedInAt: 'asc' },
      { createdAt: 'asc' },
    ],
    include: {
      employee: {
        select: TIME_CLOCK_EMPLOYEE_SELECT,
      },
    },
  });

  const detailRows: TimeClockDetailReportRow[] = entries.map((entry) => {
    const workedMinutes = workedMinutesForEntry(entry, {
      from: args.from,
      to: args.to,
      referenceAt,
    });
    return {
      entryId: entry.id,
      employeeId: entry.employeeId,
      salespersonCode: entry.employee.salespersonCode,
      employeeName: entry.employee.displayName,
      storeId: entry.storeId,
      clockedInAt: entry.clockedInAt,
      clockedOutAt: entry.clockedOutAt,
      workedMinutes,
      workedHoursDecimal: hoursDecimalFromMinutes(workedMinutes),
      nonSales: entry.nonSales,
      status: getTimeClockEntryStatus(entry),
      note: entry.note,
    };
  });

  const totals = detailRows.reduce(
    (acc, row) => ({
      totalEntries: acc.totalEntries + 1,
      totalMinutes: acc.totalMinutes + row.workedMinutes,
      totalHoursDecimal: hoursDecimalFromMinutes(acc.totalMinutes + row.workedMinutes),
    }),
    { totalEntries: 0, totalMinutes: 0, totalHoursDecimal: 0 },
  );

  if (args.detail) {
    return {
      generatedAt: referenceAt,
      detail: true,
      rows: detailRows,
      totals,
    };
  }

  const summaryByEmployee = new Map<string, TimeClockSummaryReportRow>();
  for (const row of detailRows) {
    const existing = summaryByEmployee.get(row.employeeId) ?? {
      employeeId: row.employeeId,
      salespersonCode: row.salespersonCode,
      employeeName: row.employeeName,
      totalEntries: 0,
      totalMinutes: 0,
      totalHoursDecimal: 0,
      salesMinutes: 0,
      salesHoursDecimal: 0,
      nonSalesMinutes: 0,
      nonSalesHoursDecimal: 0,
      openEntries: 0,
      autoClosedEntries: 0,
    };

    existing.totalEntries += 1;
    existing.totalMinutes += row.workedMinutes;
    existing.totalHoursDecimal = hoursDecimalFromMinutes(existing.totalMinutes);

    if (row.nonSales) {
      existing.nonSalesMinutes += row.workedMinutes;
      existing.nonSalesHoursDecimal = hoursDecimalFromMinutes(existing.nonSalesMinutes);
    } else {
      existing.salesMinutes += row.workedMinutes;
      existing.salesHoursDecimal = hoursDecimalFromMinutes(existing.salesMinutes);
    }

    if (row.status === 'OPEN') {
      existing.openEntries += 1;
    }
    if (row.status === 'AUTO_CLOSED') {
      existing.autoClosedEntries += 1;
    }

    summaryByEmployee.set(row.employeeId, existing);
  }

  return {
    generatedAt: referenceAt,
    detail: false,
    rows: Array.from(summaryByEmployee.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
    totals,
  };
}
