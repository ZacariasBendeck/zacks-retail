import { Router, Request, Response, IRouter } from 'express';
import * as vendorService from '../services/vendorService';
import {
  createVendorSchema,
  updateVendorSchema,
  vendorListQuerySchema,
  validate,
  validateQuery,
} from '../middleware/validation';

const router: IRouter = Router();

/**
 * @openapi
 * /api/v1/vendors:
 *   post:
 *     summary: Create a new vendor
 *     tags: [Vendors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateVendorInput'
 *     responses:
 *       201:
 *         description: Vendor created
 *       400:
 *         description: Validation error
 */
router.post('/', validate(createVendorSchema), (req: Request, res: Response): void => {
  const vendor = vendorService.createVendor(req.body);
  res.status(201).json(vendor);
});

/**
 * @openapi
 * /api/v1/vendors:
 *   get:
 *     summary: List vendors sorted by name
 *     tags: [Vendors]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - name: active
 *         in: query
 *         schema: { type: boolean }
 *       - name: q
 *         in: query
 *         schema: { type: string }
 *         description: Search by name, email, or phone
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [name, createdAt, leadTimeDays], default: name }
 *         description: Field to sort by
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: asc }
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: Paginated list of vendors
 */
router.get('/', validateQuery(vendorListQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery as { page: number; pageSize: number; active?: boolean; q?: string };
  const result = vendorService.listVendors(params);
  res.json(result);
});

/**
 * @openapi
 * /api/v1/vendors/{vendorId}:
 *   get:
 *     summary: Get a vendor by ID
 *     tags: [Vendors]
 *     parameters:
 *       - name: vendorId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Vendor found
 *       404:
 *         description: Vendor not found
 */
router.get('/:vendorId', (req: Request, res: Response): void => {
  const vendorId = req.params.vendorId as string;
  const vendor = vendorService.getVendorById(vendorId);
  if (!vendor) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Vendor not found.' } });
    return;
  }
  res.json(vendor);
});

/**
 * @openapi
 * /api/v1/vendors/{vendorId}:
 *   patch:
 *     summary: Update a vendor
 *     tags: [Vendors]
 *     parameters:
 *       - name: vendorId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateVendorInput'
 *     responses:
 *       200:
 *         description: Vendor updated
 *       404:
 *         description: Vendor not found
 */
router.patch('/:vendorId', validate(updateVendorSchema), (req: Request, res: Response): void => {
  const vendorId = req.params.vendorId as string;
  const vendor = vendorService.updateVendor(vendorId, req.body);
  if (!vendor) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Vendor not found.' } });
    return;
  }
  res.json(vendor);
});

/**
 * @openapi
 * /api/v1/vendors/{vendorId}:
 *   delete:
 *     summary: Delete a vendor (blocked if vendor has associated SKUs/POs)
 *     tags: [Vendors]
 *     parameters:
 *       - name: vendorId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Vendor deleted
 *       404:
 *         description: Vendor not found
 *       409:
 *         description: Vendor has associated records, deletion blocked
 */
router.delete('/:vendorId', (req: Request, res: Response): void => {
  const vendorId = req.params.vendorId as string;
  const result = vendorService.deleteVendor(vendorId);

  if (!result.deleted && result.blocked) {
    res.status(409).json({
      error: {
        code: 'VENDOR_HAS_ASSOCIATIONS',
        message: 'Cannot delete vendor with associated SKUs or purchase orders.',
      },
    });
    return;
  }

  if (!result.deleted) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Vendor not found.' } });
    return;
  }

  res.status(204).send();
});

export default router;
