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

// ── Sales Performance Report ──────────────────────────────────────

const salesPerformanceQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  department: z.enum(DEPARTMENTS).optional(),
  category: z.coerce.number().int().min(556).max(599).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

/**
 * @openapi
 * /api/v1/reports/sales-performance:
 *   get:
 *     summary: Sales performance report by department and time period
 *     tags: [Reports]
 *     parameters:
 *       - name: startDate
 *         in: query
 *         required: true
 *         schema: { type: string, format: date }
 *         description: Start date (YYYY-MM-DD, inclusive)
 *       - name: endDate
 *         in: query
 *         required: true
 *         schema: { type: string, format: date }
 *         description: End date (YYYY-MM-DD, inclusive)
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *         description: Drill-down into a specific department
 *       - name: category
 *         in: query
 *         schema: { type: integer, minimum: 556, maximum: 599 }
 *         description: Filter to a specific category (requires department)
 *       - name: format
 *         in: query
 *         schema: { type: string, enum: [json, csv], default: json }
 *     responses:
 *       200:
 *         description: Sales performance report
 */
router.get('/sales-performance', validateQuery(salesPerformanceQuerySchema), (req: Request, res: Response): void => {
  const query = (req as any).validatedQuery as {
    startDate: string;
    endDate: string;
    department?: string;
    category?: number;
    format: 'json' | 'csv';
  };

  // endDate is inclusive, so add one day for the < comparison
  const endDateExclusive = new Date(query.endDate);
  endDateExclusive.setDate(endDateExclusive.getDate() + 1);
  const endStr = endDateExclusive.toISOString().split('T')[0];

  if (query.format === 'csv') {
    const details = reportService.getSalesPerformanceDetails(query.startDate, endStr, {
      department: query.department,
      category: query.category,
    });

    if (details.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="sales-performance.csv"');
      res.send('No sales data found for the selected period.');
      return;
    }

    const header = 'SKU Code,Brand,Style,Color,Size,Department,Category,Units Sold,Revenue,Avg Selling Price';
    const rows = details.map((d) =>
      [
        escapeCsv(d.skuCode),
        escapeCsv(d.brand),
        escapeCsv(d.style),
        escapeCsv(d.color),
        escapeCsv(d.size),
        d.department,
        d.category,
        d.totalUnitsSold,
        d.totalRevenue.toFixed(2),
        d.avgSellingPrice.toFixed(2),
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-performance.csv"');
    res.send(csv);
    return;
  }

  // JSON response
  if (query.department) {
    const categories = reportService.getSalesPerformanceByCategory(query.startDate, endStr, query.department);
    const details = reportService.getSalesPerformanceDetails(query.startDate, endStr, {
      department: query.department,
      category: query.category,
    });

    res.json({
      startDate: query.startDate,
      endDate: query.endDate,
      department: query.department,
      categories,
      details,
    });
    return;
  }

  // Top-level: by department
  const departments = reportService.getSalesPerformanceByDepartment(query.startDate, endStr);
  res.json({
    startDate: query.startDate,
    endDate: query.endDate,
    departments,
  });
});

// ── Inventory Turnover Report ────────────────────────────────────

const inventoryTurnoverQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  department: z.enum(DEPARTMENTS).optional(),
  category: z.coerce.number().int().min(556).max(599).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

/**
 * @openapi
 * /api/v1/reports/inventory-turnover:
 *   get:
 *     summary: Inventory turnover report — COGS / average inventory by department
 *     tags: [Reports]
 *     parameters:
 *       - name: startDate
 *         in: query
 *         schema: { type: string, format: date }
 *         description: Start date for COGS period (YYYY-MM-DD, inclusive)
 *       - name: endDate
 *         in: query
 *         schema: { type: string, format: date }
 *         description: End date for COGS period (YYYY-MM-DD, inclusive)
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
 *     responses:
 *       200:
 *         description: Inventory turnover report
 */
router.get('/inventory-turnover', validateQuery(inventoryTurnoverQuerySchema), (req: Request, res: Response): void => {
  const query = (req as any).validatedQuery as {
    startDate?: string;
    endDate?: string;
    department?: string;
    category?: number;
    format: 'json' | 'csv';
  };

  const filters: reportService.TurnoverFilters = {
    startDate: query.startDate,
    endDate: query.endDate,
    department: query.department,
    category: query.category,
  };

  if (query.format === 'csv') {
    const details = reportService.getTurnoverDetails(filters);

    const header = 'SKU Code,Brand,Style,Color,Size,Department,Category,Price,Qty On Hand,Inventory Value,COGS,Turnover Ratio';
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
        d.inventoryValue.toFixed(2),
        d.cogs.toFixed(2),
        d.turnoverRatio.toFixed(2),
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-turnover-report.csv"');
    res.send(csv);
    return;
  }

  // JSON response
  if (query.department) {
    const categories = reportService.getTurnoverByCategory(query.department, filters);
    const details = reportService.getTurnoverDetails(filters);

    res.json({
      startDate: query.startDate ?? null,
      endDate: query.endDate ?? null,
      department: query.department,
      categories,
      details,
    });
    return;
  }

  // Top-level: department summary sorted by turnover (lowest first = slow movers)
  const departments = reportService.getTurnoverByDepartment(filters);
  res.json({
    startDate: query.startDate ?? null,
    endDate: query.endDate ?? null,
    departments,
  });
});

// ── Sell-Through Analysis Report ────────────────────────────────

const sellThroughQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  department: z.enum(DEPARTMENTS).optional(),
  category: z.coerce.number().int().min(556).max(599).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

/**
 * @openapi
 * /api/v1/reports/sell-through:
 *   get:
 *     summary: Sell-through analysis — units sold / units received by style and period
 *     tags: [Reports]
 *     parameters:
 *       - name: startDate
 *         in: query
 *         schema: { type: string, format: date }
 *         description: Start date (YYYY-MM-DD, inclusive)
 *       - name: endDate
 *         in: query
 *         schema: { type: string, format: date }
 *         description: End date (YYYY-MM-DD, inclusive)
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *         description: Drill-down into a specific department
 *       - name: category
 *         in: query
 *         schema: { type: integer, minimum: 556, maximum: 599 }
 *         description: Filter to a specific category (requires department)
 *       - name: format
 *         in: query
 *         schema: { type: string, enum: [json, csv], default: json }
 *     responses:
 *       200:
 *         description: Sell-through analysis report
 */
router.get('/sell-through', validateQuery(sellThroughQuerySchema), (req: Request, res: Response): void => {
  const query = (req as any).validatedQuery as {
    startDate?: string;
    endDate?: string;
    department?: string;
    category?: number;
    format: 'json' | 'csv';
  };

  const filters: reportService.SellThroughFilters = {
    startDate: query.startDate,
    endDate: query.endDate,
    department: query.department,
    category: query.category,
  };

  if (query.format === 'csv') {
    const details = reportService.getSellThroughDetails(filters);

    const header = 'SKU Code,Brand,Style,Color,Size,Department,Category,Price,Units Sold,Units Received,Sell-Through %';
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
        d.unitsSold,
        d.unitsReceived,
        d.sellThroughPct.toFixed(1),
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sell-through-report.csv"');
    res.send(csv);
    return;
  }

  // JSON response
  if (query.department) {
    const categories = reportService.getSellThroughByCategory(query.department, filters);
    const details = reportService.getSellThroughDetails(filters);

    res.json({
      startDate: query.startDate ?? null,
      endDate: query.endDate ?? null,
      department: query.department,
      categories,
      details,
    });
    return;
  }

  // Top-level: department summary sorted by sell-through (lowest first = underperformers)
  const departments = reportService.getSellThroughByDepartment(filters);
  res.json({
    startDate: query.startDate ?? null,
    endDate: query.endDate ?? null,
    departments,
  });
});

// ── Inventory Aging Report ──────────────────────────────────────

const inventoryAgingQuerySchema = z.object({
  department: z.enum(DEPARTMENTS).optional(),
  category: z.coerce.number().int().min(556).max(599).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

/**
 * @openapi
 * /api/v1/reports/inventory-aging:
 *   get:
 *     summary: Inventory aging report — stock bucketed by days on hand
 *     tags: [Reports]
 *     parameters:
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *         description: Filter to a specific department
 *       - name: category
 *         in: query
 *         schema: { type: integer, minimum: 556, maximum: 599 }
 *         description: Filter to a specific category (requires department)
 *       - name: format
 *         in: query
 *         schema: { type: string, enum: [json, csv], default: json }
 *     responses:
 *       200:
 *         description: Inventory aging report
 */
router.get('/inventory-aging', validateQuery(inventoryAgingQuerySchema), (req: Request, res: Response): void => {
  const query = (req as any).validatedQuery as {
    department?: string;
    category?: number;
    format: 'json' | 'csv';
  };

  if (query.format === 'csv') {
    const details = reportService.getAgingDetails({
      department: query.department,
      category: query.category,
    });

    const header = 'SKU Code,Brand,Style,Color,Size,Department,Category,Price,Qty On Hand,Cost Value,Days On Hand,Aging Bucket,Flagged,Last Received';
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
        d.daysOnHand,
        d.agingBucket,
        d.flagged ? 'YES' : '',
        d.lastReceivedAt ?? '',
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-aging-report.csv"');
    res.send(csv);
    return;
  }

  // JSON response
  if (query.department) {
    const details = reportService.getAgingDetails({
      department: query.department,
      category: query.category,
    });

    res.json({
      department: query.department,
      details,
    });
    return;
  }

  // Top-level: department summary with aging buckets
  const departments = reportService.getAgingByDepartment();
  res.json({ departments });
});

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default router;
