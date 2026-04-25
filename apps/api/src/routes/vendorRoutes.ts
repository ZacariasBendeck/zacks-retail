/**
 * Legacy vendor routes — now a read-only projection over app.vendor +
 * app.vendor_overlay.
 *
 * Writes (POST/PATCH/DELETE) respond with 501 NOT_IMPLEMENTED pointing at the
 * RICS-backed endpoints under `/api/v1/products/vendors/*`. The read paths
 * (GET list + GET by id) stream through the Postgres mirror.
 */

import { Router, Request, Response, NextFunction, IRouter } from 'express';
import * as vendorService from '../services/vendorService';
import {
  createVendorSchema,
  updateVendorSchema,
  vendorListQuerySchema,
  validate,
  validateQuery,
} from '../middleware/validation';

const router: IRouter = Router();

const WRITE_NOT_SUPPORTED_BODY = {
  error: {
    code: 'WRITE_NOT_SUPPORTED',
    message:
      'Legacy /api/v1/vendors is read-only (projection over app.vendor/app.vendor_overlay). ' +
      'Use /api/v1/products/vendors/* for create/update/delete — those go through the RICS ' +
      'write path with EDI validation and SKU-reference guards.',
  },
};

/**
 * @openapi
 * /api/v1/vendors:
 *   post:
 *     summary: DEPRECATED — writes go to /api/v1/products/vendors
 *     tags: [Vendors]
 *     responses:
 *       501:
 *         description: Not implemented — use /api/v1/products/vendors
 */
router.post('/', validate(createVendorSchema), (_req: Request, res: Response): void => {
  res.status(501).json(WRITE_NOT_SUPPORTED_BODY);
});

/**
 * @openapi
 * /api/v1/vendors:
 *   get:
 *     summary: List vendors (read-only projection over app.vendor/app.vendor_overlay)
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
 *         description: Accepted for back-compat; ignored (all mirror rows are current).
 *       - name: q
 *         in: query
 *         schema: { type: string }
 *         description: Search by short_name, mail_name, e_mail, or phone
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [name, createdAt, leadTimeDays], default: name }
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: asc }
 *     responses:
 *       200:
 *         description: Paginated list of vendors
 */
router.get(
  '/',
  validateQuery(vendorListQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = (req as any).validatedQuery as {
        page: number;
        pageSize: number;
        sort?: string;
        order?: 'asc' | 'desc';
        active?: boolean;
        q?: string;
      };
      const result = await vendorService.listVendors(params);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/v1/vendors/{vendorId}:
 *   get:
 *     summary: "Get a vendor by RICS code (back-compat: param is named vendorId)"
 *     tags: [Vendors]
 *     parameters:
 *       - name: vendorId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: "RICS vendor code (string); the legacy UUID shape is gone."
 *     responses:
 *       200:
 *         description: Vendor found
 *       404:
 *         description: Vendor not found
 */
router.get(
  '/:vendorId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vendorId = req.params.vendorId as string;
      const vendor = await vendorService.getVendorById(vendorId);
      if (!vendor) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Vendor not found.' } });
        return;
      }
      res.json(vendor);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/v1/vendors/{vendorId}:
 *   patch:
 *     summary: DEPRECATED — writes go to /api/v1/products/vendors
 *     tags: [Vendors]
 *     responses:
 *       501:
 *         description: Not implemented — use /api/v1/products/vendors
 */
router.patch('/:vendorId', validate(updateVendorSchema), (_req: Request, res: Response): void => {
  res.status(501).json(WRITE_NOT_SUPPORTED_BODY);
});

/**
 * @openapi
 * /api/v1/vendors/{vendorId}:
 *   delete:
 *     summary: DEPRECATED — writes go to /api/v1/products/vendors
 *     tags: [Vendors]
 *     responses:
 *       501:
 *         description: Not implemented — use /api/v1/products/vendors
 */
router.delete('/:vendorId', (_req: Request, res: Response): void => {
  res.status(501).json(WRITE_NOT_SUPPORTED_BODY);
});

export default router;
