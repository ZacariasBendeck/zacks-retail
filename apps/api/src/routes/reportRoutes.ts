import { Router, Request, Response, IRouter } from 'express';
import * as reportService from '../services/reportService';
import { validateQuery } from '../middleware/validation';
import { z } from 'zod';

const router: IRouter = Router();

const DEPARTMENTS = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT'] as const;

const onHandQuerySchema = z.object({
  department: z.enum(DEPARTMENTS).optional(),
  category: z.coerce.number().int().min(556).max(599).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

/**
 * @openapi
 * /api/v1/reports/on-hand:
 *   get:
 *     summary: On-hand inventory report grouped by department
 *     tags: [Reports]
 *     parameters:
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *         description: Drill-down into a specific department to see by-category breakdown
 *       - name: category
 *         in: query
 *         schema: { type: integer, minimum: 556, maximum: 599 }
 *         description: Filter to a specific category (requires department)
 *       - name: format
 *         in: query
 *         schema: { type: string, enum: [json, csv], default: json }
 *         description: Response format (json or csv)
 *     responses:
 *       200:
 *         description: On-hand inventory report
 */
router.get('/on-hand', validateQuery(onHandQuerySchema), (req: Request, res: Response): void => {
  const query = (req as any).validatedQuery as {
    department?: string;
    category?: number;
    format: 'json' | 'csv';
  };

  if (query.format === 'csv') {
    const details = reportService.getOnHandDetails({
      department: query.department,
      category: query.category,
    });

    const header = 'SKU Code,Brand,Style,Color,Size,Department,Category,Price,Quantity On Hand,Cost Value';
    const rows = details.map((d) =>
      [
        escapeCsv(d.skuCode),
        escapeCsv(d.brand),
        escapeCsv(d.style),
        escapeCsv(d.color),
        escapeCsv(d.size),
        d.department,
        d.category,
        d.price.toFixed(2),
        d.quantityOnHand,
        d.costValue.toFixed(2),
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="on-hand-report.csv"');
    res.send(csv);
    return;
  }

  // JSON response
  if (query.department) {
    // Drill-down: show categories within a department
    const categories = reportService.getOnHandByCategory(query.department);
    const details = reportService.getOnHandDetails({
      department: query.department,
      category: query.category,
    });

    res.json({
      department: query.department,
      categories,
      details,
    });
    return;
  }

  // Top-level: show department summary
  const departments = reportService.getOnHandByDepartment();
  res.json({ departments });
});

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default router;
