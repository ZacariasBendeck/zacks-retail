import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const DEPARTMENTS = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT'] as const;

export const createSkuSchema = z.object({
  brand: z.string().min(1).max(100),
  style: z.string().min(1).max(100),
  color: z.string().min(1).max(50),
  size: z.string().min(1),
  price: z.number().positive(),
  category: z.number().int().min(556).max(599),
  department: z.enum(DEPARTMENTS),
  vendorId: z.string().uuid(),
  barcode: z.string().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  heelType: z.string().max(100).optional().nullable(),
  material: z.string().max(100).optional().nullable(),
  active: z.boolean().optional().default(true),
});

export const updateSkuSchema = z.object({
  brand: z.string().min(1).max(100).optional(),
  style: z.string().min(1).max(100).optional(),
  color: z.string().min(1).max(50).optional(),
  size: z.string().min(1).optional(),
  price: z.number().positive().optional(),
  category: z.number().int().min(556).max(599).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  vendorId: z.string().uuid().optional(),
  barcode: z.string().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  heelType: z.string().max(100).optional().nullable(),
  material: z.string().max(100).optional().nullable(),
  active: z.boolean().optional(),
});

export const skuListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['brand', 'style', 'price', 'createdAt']).default('brand'),
  order: z.enum(['asc', 'desc']).default('asc'),
  brand: z.string().optional(),
  department: z.enum(DEPARTMENTS).optional(),
  category: z.coerce.number().int().min(556).max(599).optional(),
  vendorId: z.string().uuid().optional(),
  active: z.preprocess((v) => {
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  }, z.boolean().optional()),
  q: z.string().optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  size: z.string().optional(),
});

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        },
      });
      return;
    }
    (req as any).validatedQuery = result.data;
    next();
  };
}
