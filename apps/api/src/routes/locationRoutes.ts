import { Router, Request, Response, IRouter } from 'express';
import * as adjustmentService from '../services/adjustmentService';

const router: IRouter = Router();

/**
 * @openapi
 * /api/v1/locations:
 *   get:
 *     summary: List all active locations
 *     tags: [Locations]
 *     responses:
 *       200:
 *         description: Array of locations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 */
router.get('/', (_req: Request, res: Response): void => {
  res.json(adjustmentService.listLocations());
});

export default router;
