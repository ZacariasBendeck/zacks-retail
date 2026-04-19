import { Router, Request, Response, IRouter } from 'express';
import * as customerService from '../services/customerService';
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerListQuerySchema,
  customerSearchQuerySchema,
  createFamilyMemberSchema,
  updateFamilyMemberSchema,
  validate,
  validateQuery,
} from '../middleware/validation';

const router: IRouter = Router();

/**
 * @openapi
 * /api/v1/customers:
 *   post:
 *     summary: Create a customer
 *     tags: [Customers]
 *     responses:
 *       201: { description: Customer created }
 */
router.post('/', validate(createCustomerSchema), (req: Request, res: Response): void => {
  try {
    const customer = customerService.createCustomer(req.body);
    res.status(201).json(customer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: { code: 'ACCOUNT_NUMBER_CONFLICT', message: 'Account number already exists.' } });
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
router.get('/search', validateQuery(customerSearchQuerySchema), (req: Request, res: Response): void => {
  const params = (req as unknown as { validatedQuery: { q: string; limit: number } }).validatedQuery;
  const results = customerService.searchCustomers(params.q, params.limit);
  res.json({ data: results });
});

/**
 * @openapi
 * /api/v1/customers:
 *   get:
 *     summary: List customers
 *     tags: [Customers]
 */
router.get('/', validateQuery(customerListQuerySchema), (req: Request, res: Response): void => {
  const params = (req as unknown as { validatedQuery: customerService.CustomerListParams }).validatedQuery;
  const result = customerService.listCustomers(params);
  res.json(result);
});

/**
 * @openapi
 * /api/v1/customers/by-account/{accountNumber}:
 *   get:
 *     summary: Get customer by account number
 *     tags: [Customers]
 */
router.get('/by-account/:accountNumber', (req: Request, res: Response): void => {
  const customer = customerService.getCustomerByAccountNumber(req.params.accountNumber as string);
  if (!customer) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
    return;
  }
  res.json(customer);
});

/**
 * @openapi
 * /api/v1/customers/{customerId}:
 *   get:
 *     summary: Get customer by id (with family members)
 *     tags: [Customers]
 */
router.get('/:customerId', (req: Request, res: Response): void => {
  const customer = customerService.getCustomerWithFamily(req.params.customerId as string);
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
router.get('/:customerId/balances', (req: Request, res: Response): void => {
  const balances = customerService.getCustomerBalances(req.params.customerId as string);
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
router.patch('/:customerId', validate(updateCustomerSchema), (req: Request, res: Response): void => {
  try {
    const customer = customerService.updateCustomer(req.params.customerId as string, req.body);
    if (!customer) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
      return;
    }
    res.json(customer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: { code: 'ACCOUNT_NUMBER_CONFLICT', message: 'Account number already exists.' } });
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
router.delete('/:customerId', (req: Request, res: Response): void => {
  const result = customerService.deleteCustomer(req.params.customerId as string);
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
router.get('/:customerId/family', (req: Request, res: Response): void => {
  const members = customerService.listFamilyMembers(req.params.customerId as string);
  res.json({ data: members });
});

/**
 * @openapi
 * /api/v1/customers/{customerId}/family:
 *   post:
 *     summary: Add a family member to a customer
 *     tags: [Customers]
 */
router.post('/:customerId/family', validate(createFamilyMemberSchema), (req: Request, res: Response): void => {
  try {
    const member = customerService.createFamilyMember(req.params.customerId as string, req.body);
    res.status(201).json(member);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'CUSTOMER_NOT_FOUND') {
      res.status(404).json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' } });
      return;
    }
    if (message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: { code: 'FAMILY_CODE_CONFLICT', message: 'Family member code already used for this customer.' } });
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
router.patch('/:customerId/family/:familyId', validate(updateFamilyMemberSchema), (req: Request, res: Response): void => {
  const member = customerService.updateFamilyMember(req.params.familyId as string, req.body);
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
router.delete('/:customerId/family/:familyId', (req: Request, res: Response): void => {
  const deleted = customerService.deleteFamilyMember(req.params.familyId as string);
  if (!deleted) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Family member not found.' } });
    return;
  }
  res.status(204).send();
});

export default router;
