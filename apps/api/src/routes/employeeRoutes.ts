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


