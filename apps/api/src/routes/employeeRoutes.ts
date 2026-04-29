import { Router } from 'express';
import { z } from 'zod';
import { CommissionOverrideScope, PrismaClient } from '../prismaClient';
import { requirePermission } from '../middleware/authMiddleware';
import { PERMISSIONS } from '../services/employees/permissions';
import {
  EmployeeNotFoundError,
  createEmployee,
  deactivateEmployee,
  getEmployee,
  listEmployees,
  reactivateEmployee,
  updateEmployee,
} from '../services/employees/employeeService';
import { hashPassword } from '../services/employees/passwordHash';
import { SalespersonCodeConflictError } from '../services/employees/userService';
import {
  SALES_PASSWORD_SCOPES,
  SalesPasswordInvalidError,
  SalesPasswordLockedError,
  SalesPasswordNotFoundError,
  SalesPasswordPinConflictError,
  SalesPasswordScopeDeniedError,
  SalesPasswordTokenError,
  consumeEmployeeSalesOverrideToken,
  issueEmployeeSalesPassword,
  listEmployeeSalesPasswords,
  revokeEmployeeSalesPassword,
  verifyEmployeeSalesPassword,
} from '../services/employees/salesPasswordBridgeService';
import {
  CommissionOverrideNotFoundError,
  CommissionOverrideValidationError,
  createCommissionOverride,
  deleteCommissionOverride,
  listEmployeeCommissionOverrides,
  updateCommissionOverride,
} from '../services/employees/commissionOverrideService';
import { clearCache as clearSalesReportCache } from '../services/salesReporting/ricsSalesReportAdapter';

function sanitizeEmployee(user: any) {
  const { passwordHash, timeClockPinHash, ...rest } = user;
  return rest;
}

function sanitizeSalesPassword(password: any) {
  const { pinHash, tokenHash, ...rest } = password;
  return rest;
}

function sanitizeCommissionOverride(override: any) {
  return {
    ...override,
    rate: override.rate?.toString?.() ?? override.rate,
  };
}

const commissionBaseSchema = z.enum(['NET_SALES', 'GROSS_PROFIT']);
const commissionOverrideScopeSchema = z.enum(['SKU', 'CATEGORY', 'DEPARTMENT']);
const salesPasswordScopeSchema = z.enum(SALES_PASSWORD_SCOPES);

const createEmployeeBody = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  password: z.string().min(8),
  roleId: z.string().uuid(),
  salespersonCode: z.string().trim().min(1).max(4),
  ricsUserId: z.string().trim().min(1).optional().nullable(),
  otherInformation: z.string().max(2000).optional().nullable(),
  commissionRate: z.number().min(0).max(100).optional().nullable(),
  commissionBase: commissionBaseSchema.optional(),
  active: z.boolean().optional(),
  homeStoreId: z.string().trim().min(1).optional().nullable(),
  hireDate: z.coerce.date().optional().nullable(),
  terminatedAt: z.coerce.date().optional().nullable(),
  timeClockEnabled: z.boolean().optional(),
  timeClockPin: z.string().regex(/^\d{4,12}$/).optional().nullable(),
});

const patchEmployeeBody = z.object({
  email: z.string().email().optional(),
  displayName: z.string().min(1).optional(),
  roleId: z.string().uuid().optional(),
  salespersonCode: z.string().trim().min(1).max(4).optional().nullable(),
  ricsUserId: z.string().trim().min(1).optional().nullable(),
  otherInformation: z.string().max(2000).optional().nullable(),
  commissionRate: z.number().min(0).max(100).optional().nullable(),
  commissionBase: commissionBaseSchema.optional(),
  active: z.boolean().optional(),
  homeStoreId: z.string().trim().min(1).optional().nullable(),
  hireDate: z.coerce.date().optional().nullable(),
  terminatedAt: z.coerce.date().optional().nullable(),
  timeClockEnabled: z.boolean().optional(),
  timeClockPin: z.string().regex(/^\d{4,12}$/).optional().nullable(),
});

const issueSalesPasswordBody = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
  scopes: z.array(salesPasswordScopeSchema).min(1),
});

const verifySalesPasswordBody = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
  scope: salesPasswordScopeSchema,
  employeeId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(100).optional(),
});

const consumeOverrideTokenBody = z.object({
  overrideToken: z.string().min(10),
  scope: salesPasswordScopeSchema,
  ticketId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(100).optional(),
});

const createCommissionOverrideBody = z.object({
  scope: commissionOverrideScopeSchema,
  skuId: z.string().trim().min(1).optional().nullable(),
  categoryId: z.string().trim().min(1).optional().nullable(),
  departmentId: z.string().trim().min(1).optional().nullable(),
  rate: z.number().min(0).max(100),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional().nullable(),
});

const patchCommissionOverrideBody = z.object({
  scope: commissionOverrideScopeSchema.optional(),
  skuId: z.string().trim().min(1).optional().nullable(),
  categoryId: z.string().trim().min(1).optional().nullable(),
  departmentId: z.string().trim().min(1).optional().nullable(),
  rate: z.number().min(0).max(100).optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional().nullable(),
});

const patchRicsSalespersonBody = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  active: z.boolean().optional(),
  otherInformation: z.string().max(2000).optional().nullable(),
  commissionRate: z.coerce.number().min(0).max(100).optional().nullable(),
  commissionBase: commissionBaseSchema.optional(),
  timeClockEnabled: z.boolean().optional(),
  timeClockAdmin: z.boolean().optional(),
  timeClockFullUser: z.boolean().optional(),
});

const createRicsSalespersonBody = z.object({
  salespersonCode: z.string().trim().regex(/^[A-Za-z0-9]{1,4}$/),
  displayName: z.string().trim().min(1).max(200),
  active: z.boolean().optional(),
  otherInformation: z.string().max(2000).optional().nullable(),
  commissionRate: z.coerce.number().min(0).max(100).optional().nullable(),
  commissionBase: commissionBaseSchema.optional(),
  timeClockEnabled: z.boolean().optional(),
  timeClockAdmin: z.boolean().optional(),
  timeClockFullUser: z.boolean().optional(),
});

type RicsSalespersonRow = {
  id: string;
  salespersonCode: string;
  displayName: string;
  active: boolean;
  otherInformation: string | null;
  commissionRate: string | null;
  commissionBase: string;
  ricsCommissionMethod: string | null;
  timeClockEnabled: boolean;
  timeClockAdmin: boolean;
  timeClockFullUser: boolean;
  hasTimeClockPin: boolean;
  hasLegacyCashierPin: boolean;
  ricsSalespersonChangedAt: Date | null;
  ricsSalespersonImportedAt: Date | null;
};

function normalizeSalespersonCodeParam(value: string): string {
  return value.trim().toUpperCase();
}

function serializeRicsSalesperson(row: RicsSalespersonRow) {
  return {
    ...row,
    commissionRate: row.commissionRate == null ? null : Number(row.commissionRate),
    ricsSalespersonChangedAt: row.ricsSalespersonChangedAt?.toISOString?.() ?? null,
    ricsSalespersonImportedAt: row.ricsSalespersonImportedAt?.toISOString?.() ?? null,
  };
}

async function listRicsSalespeople(prisma: PrismaClient): Promise<RicsSalespersonRow[]> {
  return prisma.$queryRawUnsafe<RicsSalespersonRow[]>(`
    SELECT
      id::text AS "id",
      salesperson_code AS "salespersonCode",
      display_name AS "displayName",
      active,
      other_information AS "otherInformation",
      commission_rate::text AS "commissionRate",
      commission_base AS "commissionBase",
      rics_commission_method AS "ricsCommissionMethod",
      time_clock_enabled AS "timeClockEnabled",
      time_clock_admin AS "timeClockAdmin",
      time_clock_full_user AS "timeClockFullUser",
      time_clock_pin_hash IS NOT NULL AS "hasTimeClockPin",
      legacy_cashier_pin_hash IS NOT NULL AS "hasLegacyCashierPin",
      rics_salesperson_changed_at AS "ricsSalespersonChangedAt",
      rics_salesperson_imported_at AS "ricsSalespersonImportedAt"
    FROM app.employee
    ORDER BY active DESC, salesperson_code ASC
  `);
}

async function findRicsSalespersonByCode(
  prisma: PrismaClient,
  salespersonCode: string,
): Promise<RicsSalespersonRow | null> {
  const rows = await prisma.$queryRawUnsafe<RicsSalespersonRow[]>(
    `
    SELECT
      id::text AS "id",
      salesperson_code AS "salespersonCode",
      display_name AS "displayName",
      active,
      other_information AS "otherInformation",
      commission_rate::text AS "commissionRate",
      commission_base AS "commissionBase",
      rics_commission_method AS "ricsCommissionMethod",
      time_clock_enabled AS "timeClockEnabled",
      time_clock_admin AS "timeClockAdmin",
      time_clock_full_user AS "timeClockFullUser",
      time_clock_pin_hash IS NOT NULL AS "hasTimeClockPin",
      legacy_cashier_pin_hash IS NOT NULL AS "hasLegacyCashierPin",
      rics_salesperson_changed_at AS "ricsSalespersonChangedAt",
      rics_salesperson_imported_at AS "ricsSalespersonImportedAt"
    FROM app.employee
    WHERE salesperson_code = $1
    `,
    salespersonCode,
  );
  return rows[0] ?? null;
}

function handleEmployeeError(res: any, err: unknown): boolean {
  if (err instanceof EmployeeNotFoundError) {
    res.status(404).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof SalespersonCodeConflictError) {
    res.status(409).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof SalesPasswordPinConflictError) {
    res.status(409).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof CommissionOverrideNotFoundError) {
    res.status(404).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof CommissionOverrideValidationError) {
    res.status(400).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof SalesPasswordNotFoundError) {
    res.status(404).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof SalesPasswordLockedError) {
    res.status(423).json({
      error: { code: err.code, message: err.message },
      lockedUntil: err.lockedUntil.toISOString(),
    });
    return true;
  }
  if (err instanceof SalesPasswordScopeDeniedError) {
    res.status(403).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  if (err instanceof SalesPasswordInvalidError) {
    res.status(401).json({ error: { code: err.code, message: err.message } });
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
  if ((err as any)?.code === 'P2002') {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'Employee already exists' } });
    return true;
  }
  if ((err as any)?.code === '23505') {
    res.status(409).json({ error: { code: 'SALESPERSON_CODE_CONFLICT', message: 'Salesperson code already in use' } });
    return true;
  }
  return false;
}

async function mapTimeClockPin(
  value: string | null | undefined,
): Promise<{ timeClockPinHash?: string | null }> {
  if (value === undefined) return {};
  if (value === null) return { timeClockPinHash: null };
  return { timeClockPinHash: await hashPassword(value) };
}

export function createEmployeeRoutes(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/', requirePermission(PERMISSIONS.EMPLOYEES_VIEW), async (_req, res, next) => {
    try {
      const employees = await listEmployees(prisma);
      res.json({ employees: employees.map(sanitizeEmployee) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/salespeople', requirePermission(PERMISSIONS.EMPLOYEES_VIEW), async (_req, res, next) => {
    try {
      const salespeople = await listRicsSalespeople(prisma);
      res.json({ salespeople: salespeople.map(serializeRicsSalesperson) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/salespeople', requirePermission(PERMISSIONS.EMPLOYEES_MANAGE), async (req, res, next) => {
    try {
      const parsed = createRicsSalespersonBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }

      const salespersonCode = normalizeSalespersonCodeParam(parsed.data.salespersonCode);
      const existing = await findRicsSalespersonByCode(prisma, salespersonCode);
      if (existing) {
        return res.status(409).json({
          error: { code: 'SALESPERSON_CODE_CONFLICT', message: 'Salesperson code already in use' },
        });
      }

      await prisma.$executeRawUnsafe(
        `
        INSERT INTO app.employee (
          salesperson_code,
          display_name,
          active,
          other_information,
          commission_rate,
          commission_base,
          time_clock_enabled,
          time_clock_admin,
          time_clock_full_user
        )
        VALUES ($1, $2, $3, $4, $5::numeric, $6, $7, $8, $9)
        `,
        salespersonCode,
        parsed.data.displayName.trim(),
        parsed.data.active ?? true,
        parsed.data.otherInformation ?? null,
        parsed.data.commissionRate ?? null,
        parsed.data.commissionBase ?? 'NET_SALES',
        parsed.data.timeClockEnabled ?? true,
        parsed.data.timeClockAdmin ?? false,
        parsed.data.timeClockFullUser ?? false,
      );

      clearSalesReportCache();
      const salesperson = await findRicsSalespersonByCode(prisma, salespersonCode);
      res.status(201).json({ salesperson: serializeRicsSalesperson(salesperson!) });
    } catch (err) {
      if (handleEmployeeError(res, err)) return;
      next(err);
    }
  });

  router.get('/salespeople/:code', requirePermission(PERMISSIONS.EMPLOYEES_VIEW), async (req, res, next) => {
    try {
      const salespersonCode = normalizeSalespersonCodeParam(String(req.params.code));
      const salesperson = await findRicsSalespersonByCode(prisma, salespersonCode);
      if (!salesperson) {
        return res.status(404).json({
          error: { code: 'SALESPERSON_NOT_FOUND', message: 'Salesperson not found' },
        });
      }
      res.json({ salesperson: serializeRicsSalesperson(salesperson) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/salespeople/:code', requirePermission(PERMISSIONS.EMPLOYEES_MANAGE), async (req, res, next) => {
    try {
      const parsed = patchRicsSalespersonBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }

      const salespersonCode = normalizeSalespersonCodeParam(String(req.params.code));
      const existing = await findRicsSalespersonByCode(prisma, salespersonCode);
      if (!existing) {
        return res.status(404).json({
          error: { code: 'SALESPERSON_NOT_FOUND', message: 'Salesperson not found' },
        });
      }

      await prisma.$executeRawUnsafe(
        `
        UPDATE app.employee
        SET
          display_name = COALESCE($2, display_name),
          active = COALESCE($3, active),
          other_information = CASE WHEN $4::boolean THEN $5 ELSE other_information END,
          commission_rate = CASE WHEN $6::boolean THEN $7::numeric ELSE commission_rate END,
          commission_base = COALESCE($8, commission_base),
          time_clock_enabled = COALESCE($9, time_clock_enabled),
          time_clock_admin = COALESCE($10, time_clock_admin),
          time_clock_full_user = COALESCE($11, time_clock_full_user),
          updated_at = CURRENT_TIMESTAMP
        WHERE salesperson_code = $1
        `,
        salespersonCode,
        parsed.data.displayName ?? null,
        parsed.data.active ?? null,
        Object.prototype.hasOwnProperty.call(parsed.data, 'otherInformation'),
        parsed.data.otherInformation ?? null,
        Object.prototype.hasOwnProperty.call(parsed.data, 'commissionRate'),
        parsed.data.commissionRate ?? null,
        parsed.data.commissionBase ?? null,
        parsed.data.timeClockEnabled ?? null,
        parsed.data.timeClockAdmin ?? null,
        parsed.data.timeClockFullUser ?? null,
      );

      clearSalesReportCache();
      const salesperson = await findRicsSalespersonByCode(prisma, salespersonCode);
      res.json({ salesperson: serializeRicsSalesperson(salesperson!) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/salespeople/:code', requirePermission(PERMISSIONS.EMPLOYEES_MANAGE), async (req, res, next) => {
    try {
      const salespersonCode = normalizeSalespersonCodeParam(String(req.params.code));
      const existing = await findRicsSalespersonByCode(prisma, salespersonCode);
      if (!existing) {
        return res.status(404).json({
          error: { code: 'SALESPERSON_NOT_FOUND', message: 'Salesperson not found' },
        });
      }

      await prisma.$executeRawUnsafe(
        `DELETE FROM app.employee WHERE salesperson_code = $1`,
        salespersonCode,
      );
      clearSalesReportCache();
      res.status(204).send();
    } catch (err) {
      if (handleEmployeeError(res, err)) return;
      next(err);
    }
  });

  router.post(
    '/sales-passwords/verify',
    requirePermission(PERMISSIONS.SALES_POS_OPERATE),
    async (req, res, next) => {
      try {
        const parsed = verifySalesPasswordBody.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: 'INVALID_BODY', message: parsed.error.message },
          });
        }
        const result = await verifyEmployeeSalesPassword(prisma, {
          ...parsed.data,
          invokingUserId: req.user!.id,
          ipAddress: req.ip,
        });
        res.json({
          overrideToken: result.overrideToken,
          expiresAt: result.expiresAt,
          employee: sanitizeEmployee(result.employee),
          password: sanitizeSalesPassword(result.password),
        });
      } catch (err) {
        if (handleEmployeeError(res, err)) return;
        next(err);
      }
    },
  );

  router.post(
    '/sales-passwords/consume-token',
    requirePermission(PERMISSIONS.SALES_POS_OPERATE),
    async (req, res, next) => {
      try {
        const parsed = consumeOverrideTokenBody.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: 'INVALID_BODY', message: parsed.error.message },
          });
        }
        const token = await consumeEmployeeSalesOverrideToken(prisma, {
          ...parsed.data,
          invokingUserId: req.user!.id,
          ipAddress: req.ip,
        });
        res.json({ token: sanitizeSalesPassword(token) });
      } catch (err) {
        if (handleEmployeeError(res, err)) return;
        next(err);
      }
    },
  );

  router.get('/:id', requirePermission(PERMISSIONS.EMPLOYEES_VIEW), async (req, res, next) => {
    try {
      const employee = await getEmployee(prisma, String(req.params.id));
      res.json({ employee: sanitizeEmployee(employee) });
    } catch (err) {
      if (handleEmployeeError(res, err)) return;
      next(err);
    }
  });

  router.post('/', requirePermission(PERMISSIONS.EMPLOYEES_MANAGE), async (req, res, next) => {
    try {
      const parsed = createEmployeeBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }
      const { timeClockPin, ...rest } = parsed.data;
      const employee = await createEmployee(prisma, {
        ...rest,
        ...(await mapTimeClockPin(timeClockPin)),
      });
      res.status(201).json({ employee: sanitizeEmployee(employee) });
    } catch (err) {
      if (handleEmployeeError(res, err)) return;
      next(err);
    }
  });

  router.patch('/:id', requirePermission(PERMISSIONS.EMPLOYEES_MANAGE), async (req, res, next) => {
    try {
      const parsed = patchEmployeeBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }
      const { timeClockPin, ...rest } = parsed.data;
      const employee = await updateEmployee(prisma, String(req.params.id), {
        ...rest,
        ...(await mapTimeClockPin(timeClockPin)),
      });
      res.json({ employee: sanitizeEmployee(employee) });
    } catch (err) {
      if (handleEmployeeError(res, err)) return;
      next(err);
    }
  });

  router.get(
    '/:id/commission-overrides',
    requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
    async (req, res, next) => {
      try {
        const overrides = await listEmployeeCommissionOverrides(prisma, String(req.params.id));
        res.json({ overrides: overrides.map(sanitizeCommissionOverride) });
      } catch (err) {
        if (handleEmployeeError(res, err)) return;
        next(err);
      }
    },
  );

  router.post(
    '/:id/commission-overrides',
    requirePermission(PERMISSIONS.EMPLOYEES_MANAGE),
    async (req, res, next) => {
      try {
        const parsed = createCommissionOverrideBody.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: 'INVALID_BODY', message: parsed.error.message },
          });
        }
        const override = await createCommissionOverride(prisma, {
          employeeId: String(req.params.id),
          scope: parsed.data.scope as CommissionOverrideScope,
          skuId: parsed.data.skuId,
          categoryId: parsed.data.categoryId,
          departmentId: parsed.data.departmentId,
          rate: parsed.data.rate,
          effectiveFrom: parsed.data.effectiveFrom,
          effectiveTo: parsed.data.effectiveTo,
          actorUserId: req.user!.id,
        });
        res.status(201).json({ override: sanitizeCommissionOverride(override) });
      } catch (err) {
        if (handleEmployeeError(res, err)) return;
        next(err);
      }
    },
  );

  router.patch(
    '/commission-overrides/:overrideId',
    requirePermission(PERMISSIONS.EMPLOYEES_MANAGE),
    async (req, res, next) => {
      try {
        const parsed = patchCommissionOverrideBody.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: 'INVALID_BODY', message: parsed.error.message },
          });
        }
        const override = await updateCommissionOverride(prisma, String(req.params.overrideId), {
          scope: parsed.data.scope as CommissionOverrideScope | undefined,
          skuId: parsed.data.skuId,
          categoryId: parsed.data.categoryId,
          departmentId: parsed.data.departmentId,
          rate: parsed.data.rate,
          effectiveFrom: parsed.data.effectiveFrom,
          effectiveTo: parsed.data.effectiveTo,
          actorUserId: req.user!.id,
        });
        res.json({ override: sanitizeCommissionOverride(override) });
      } catch (err) {
        if (handleEmployeeError(res, err)) return;
        next(err);
      }
    },
  );

  router.delete(
    '/commission-overrides/:overrideId',
    requirePermission(PERMISSIONS.EMPLOYEES_MANAGE),
    async (req, res, next) => {
      try {
        const override = await deleteCommissionOverride(prisma, String(req.params.overrideId));
        res.json({ override: sanitizeCommissionOverride(override) });
      } catch (err) {
        if (handleEmployeeError(res, err)) return;
        next(err);
      }
    },
  );

  router.get('/:id/sales-passwords', requirePermission(PERMISSIONS.EMPLOYEES_VIEW), async (req, res, next) => {
    try {
      const passwords = await listEmployeeSalesPasswords(prisma, String(req.params.id));
      res.json({ passwords: passwords.map(sanitizeSalesPassword) });
    } catch (err) {
      if (handleEmployeeError(res, err)) return;
      next(err);
    }
  });

  router.post(
    '/:id/sales-passwords',
    requirePermission(PERMISSIONS.EMPLOYEES_MANAGE),
    async (req, res, next) => {
      try {
        const parsed = issueSalesPasswordBody.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: 'INVALID_BODY', message: parsed.error.message },
          });
        }
        const password = await issueEmployeeSalesPassword(prisma, {
          employeeId: String(req.params.id),
          pin: parsed.data.pin,
          scopes: parsed.data.scopes,
          actorUserId: req.user!.id,
        });
        res.status(201).json({ password: sanitizeSalesPassword(password) });
      } catch (err) {
        if (handleEmployeeError(res, err)) return;
        next(err);
      }
    },
  );

  router.post(
    '/:id/sales-passwords/:passwordId/revoke',
    requirePermission(PERMISSIONS.EMPLOYEES_MANAGE),
    async (req, res, next) => {
      try {
        const password = await revokeEmployeeSalesPassword(prisma, {
          employeeId: String(req.params.id),
          passwordId: String(req.params.passwordId),
          actorUserId: req.user!.id,
        });
        res.json({ password: sanitizeSalesPassword(password) });
      } catch (err) {
        if (handleEmployeeError(res, err)) return;
        next(err);
      }
    },
  );

  router.post(
    '/:id/deactivate',
    requirePermission(PERMISSIONS.EMPLOYEES_MANAGE),
    async (req, res, next) => {
      try {
        const employee = await deactivateEmployee(prisma, String(req.params.id));
        res.json({ employee: sanitizeEmployee(employee) });
      } catch (err) {
        if (handleEmployeeError(res, err)) return;
        next(err);
      }
    },
  );

  router.post(
    '/:id/reactivate',
    requirePermission(PERMISSIONS.EMPLOYEES_MANAGE),
    async (req, res, next) => {
      try {
        const employee = await reactivateEmployee(prisma, String(req.params.id));
        res.json({ employee: sanitizeEmployee(employee) });
      } catch (err) {
        if (handleEmployeeError(res, err)) return;
        next(err);
      }
    },
  );

  return router;
}


