import { Router, Request, Response, IRouter } from 'express';
import { Prisma } from '../prismaClient';
import * as customerService from '../services/customerService';
import * as customerKpiService from '../services/customer-kpi/computeFullMetrics';
import { listCustomerMetricFilterOptions } from '../services/customer-kpi/listCustomerMetricFilterOptions';
import { listCustomerMetrics, type CustomerKpiListParams } from '../services/customer-kpi/listCustomerMetrics';
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerListQuerySchema,
  customerSearchQuerySchema,
  customerMetricsBulkRecomputeSchema,
  createFamilyMemberSchema,
  updateFamilyMemberSchema,
  validate,
  validateQuery,
} from '../middleware/validation';

const router: IRouter = Router();

/** Postgres raises P2002 on a unique-constraint violation; both the POST and
 *  PATCH handlers translate it to the same 409 the SQLite error-message-sniffing
 *  used to emit. */
function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * @openapi
 * /api/v1/customers:
 *   post:
 *     summary: Create a customer
 *     tags: [Customers]
 *     responses:
 *       201: { description: Customer created }
 */
router.post('/', validate(createCustomerSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const customer = await customerService.createCustomer(req.body);
    res.status(201).json(customer);
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      res.status(409).json({
        error: { code: 'ACCOUNT_NUMBER_CONFLICT', message: 'Account number already exists.' },
      });
      return;
    }
    throw err;
  }
});

/**
 * @openapi
 * /api/v1/customers/search:
 *   get:
 *     summary: Typeahead customer search (account #, name, phone, email)
 *     tags: [Customers]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *     responses:
 *       200: { description: Matching customers }
 */
router.get('/search', validateQuery(customerSearchQuerySchema), async (req: Request, res: Response): Promise<void> => {
  const params = (req as unknown as { validatedQuery: { q: string; limit: number } }).validatedQuery;
  const results = await customerService.searchCustomers(params.q, params.limit);
  res.json({ data: results });
});

/**
 * @openapi
 * /api/v1/customers:
 *   get:
 *     summary: List customers
 *     tags: [Customers]
 */
router.get('/', validateQuery(customerListQuerySchema), async (req: Request, res: Response): Promise<void> => {
  const params = (req as unknown as { validatedQuery: customerService.CustomerListParams }).validatedQuery;
  const result = await customerService.listCustomers(params);
  res.json(result);
});

router.get('/metrics/summary', async (_req: Request, res: Response): Promise<void> => {
  const summary = await customerKpiService.getCustomerMetricsSummary();
  res.json(summary);
});

router.get('/metrics/options', async (_req: Request, res: Response): Promise<void> => {
  const options = await listCustomerMetricFilterOptions();
  res.json(options);
});

router.get('/metrics/list', async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, string | undefined>;
  const params: CustomerKpiListParams = {
    page: q.page ? Number(q.page) : undefined,
    pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    q: q.q,
    churnRisk: q.churnRisk as CustomerKpiListParams['churnRisk'],
    segment: q.segment as CustomerKpiListParams['segment'],
    channel: q.channel as CustomerKpiListParams['channel'],
    minLtv: q.minLtv ? Number(q.minLtv) : undefined,
    maxLtv: q.maxLtv ? Number(q.maxLtv) : undefined,
    minRecency: q.minRecency ? Number(q.minRecency) : undefined,
    maxRecency: q.maxRecency ? Number(q.maxRecency) : undefined,
    minDiscountRatio: q.minDiscountRatio ? Number(q.minDiscountRatio) : undefined,
    primaryStoreId: q.primaryStoreId,
    primaryStoreCity: q.primaryStoreCity,
    primaryStoreChain: q.primaryStoreChain as CustomerKpiListParams['primaryStoreChain'],
    active: q.active != null ? q.active === 'true' : undefined,
    dormant: q.dormant != null ? q.dormant === 'true' : undefined,
    sort: q.sort as CustomerKpiListParams['sort'],
    order: q.order as CustomerKpiListParams['order'],
  };
  const result = await listCustomerMetrics(params);
  res.json(result);
});

router.post('/recompute-metrics', validate(customerMetricsBulkRecomputeSchema), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { batch_size: number };
  const result = await customerKpiService.recomputeAllCustomerMetrics({ batchSize: body.batch_size });
  res.status(202).json(result);
});

/**
 * @openapi
 * /api/v1/customers/by-account/{accountNumber}:
 *   get:
 *     summary: Get customer by account number
 *     tags: [Customers]
 */
router.get('/by-account/:accountNumber', async (req: Request, res: Response): Promise<void> => {
  const customer = await customerService.getCustomerByAccountNumber(req.params.accountNumber as string);
  if (!customer) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
    return;
  }
  res.json(customer);
});

router.get('/:customerId/metrics', async (req: Request, res: Response): Promise<void> => {
  const metrics = await customerKpiService.getCustomerMetrics(req.params.customerId as string);
  if (!metrics) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
    return;
  }
  res.json(metrics);
});

router.post('/:customerId/recompute-metrics', async (req: Request, res: Response): Promise<void> => {
  const customerId = await customerKpiService.resolveCustomerMetricsCustomerId(req.params.customerId as string);
  if (!customerId) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
    return;
  }

  const metrics = await customerKpiService.computeFullMetrics(customerId);
  res.json(metrics);
});

router.get('/:customerId/tickets', async (req: Request, res: Response): Promise<void> => {
  const tickets = await customerService.listCustomerTicketHistory(req.params.customerId as string);
  if (!tickets) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
    return;
  }
  res.json({ data: tickets });
});

/**
 * @openapi
 * /api/v1/customers/{customerId}:
 *   get:
 *     summary: Get customer by id (with family members)
 *     tags: [Customers]
 */
router.get('/:customerId', async (req: Request, res: Response): Promise<void> => {
  const customer = await customerService.getCustomerWithFamily(req.params.customerId as string);
  if (!customer) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
    return;
  }
  res.json(customer);
});

/**
 * @openapi
 * /api/v1/customers/{customerId}/balances:
 *   get:
 *     summary: Get cached A/R + store-credit balance for the customer (Stage 1 placeholder)
 *     tags: [Customers]
 */
router.get('/:customerId/balances', async (req: Request, res: Response): Promise<void> => {
  const balances = await customerService.getCustomerBalances(req.params.customerId as string);
  if (!balances) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
    return;
  }
  res.json(balances);
});

/**
 * @openapi
 * /api/v1/customers/{customerId}:
 *   patch:
 *     summary: Update customer
 *     tags: [Customers]
 */
router.patch('/:customerId', validate(updateCustomerSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const customer = await customerService.updateCustomer(req.params.customerId as string, req.body);
    if (!customer) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
      return;
    }
    res.json(customer);
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      res.status(409).json({
        error: { code: 'ACCOUNT_NUMBER_CONFLICT', message: 'Account number already exists.' },
      });
      return;
    }
    throw err;
  }
});

/**
 * @openapi
 * /api/v1/customers/{customerId}:
 *   delete:
 *     summary: Delete customer (blocked if referenced by a sales ticket)
 *     tags: [Customers]
 */
router.delete('/:customerId', async (req: Request, res: Response): Promise<void> => {
  const result = await customerService.deleteCustomer(req.params.customerId as string);
  if (result.blocked) {
    res.status(409).json({
      error: {
        code: 'CUSTOMER_HAS_ASSOCIATIONS',
        message: 'Cannot delete customer referenced by a sales ticket.',
      },
    });
    return;
  }
  if (!result.deleted) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
    return;
  }
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Family members
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/v1/customers/{customerId}/family:
 *   get:
 *     summary: List a customer's family members
 *     tags: [Customers]
 */
router.get('/:customerId/family', async (req: Request, res: Response): Promise<void> => {
  const members = await customerService.listFamilyMembers(req.params.customerId as string);
  res.json({ data: members });
});

/**
 * @openapi
 * /api/v1/customers/{customerId}/family:
 *   post:
 *     summary: Add a family member to a customer
 *     tags: [Customers]
 */
router.post('/:customerId/family', validate(createFamilyMemberSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const member = await customerService.createFamilyMember(req.params.customerId as string, req.body);
    res.status(201).json(member);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'CUSTOMER_NOT_FOUND') {
      res.status(404).json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' } });
      return;
    }
    if (isUniqueConstraintError(err)) {
      res.status(409).json({
        error: {
          code: 'FAMILY_CODE_CONFLICT',
          message: 'Family member code already used for this customer.',
        },
      });
      return;
    }
    throw err;
  }
});

/**
 * @openapi
 * /api/v1/customers/{customerId}/family/{familyId}:
 *   patch:
 *     summary: Update a family member
 *     tags: [Customers]
 */
router.patch('/:customerId/family/:familyId', validate(updateFamilyMemberSchema), async (req: Request, res: Response): Promise<void> => {
  const member = await customerService.updateFamilyMember(req.params.familyId as string, req.body);
  if (!member) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Family member not found.' } });
    return;
  }
  res.json(member);
});

/**
 * @openapi
 * /api/v1/customers/{customerId}/family/{familyId}:
 *   delete:
 *     summary: Delete a family member
 *     tags: [Customers]
 */
router.delete('/:customerId/family/:familyId', async (req: Request, res: Response): Promise<void> => {
  const deleted = await customerService.deleteFamilyMember(req.params.familyId as string);
  if (!deleted) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Family member not found.' } });
    return;
  }
  res.status(204).send();
});

export default router;


