import { Router, Request, Response, IRouter } from 'express';
import { z } from 'zod';
import { odoo } from '../services/odooClient';
import type { Cart } from '../models/cart';

const router: IRouter = Router();

const addItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).default(1),
});

const updateItemSchema = z.object({
  lineId: z.number().int().positive(),
  quantity: z.number().int().min(0),
});

// GET /api/public/cart
router.get('/', async (_req: Request, res: Response) => {
  try {
    const cart = await odoo.get<Cart>('/cart');
    res.json(cart);
  } catch (err: any) {
    console.error('Failed to get cart:', err.message);
    res.status(500).json({ error: { code: 'CART_ERROR', message: 'Failed to get cart' } });
  }
});

// POST /api/public/cart/items
router.post('/items', async (req: Request, res: Response) => {
  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
    return;
  }

  try {
    const cart = await odoo.post<Cart>('/cart/items', {
      product_id: parsed.data.productId,
      quantity: parsed.data.quantity,
    });
    res.json(cart);
  } catch (err: any) {
    console.error('Failed to add to cart:', err.message);
    res.status(500).json({ error: { code: 'CART_ERROR', message: 'Failed to add item to cart' } });
  }
});

// PATCH /api/public/cart/items
router.patch('/items', async (req: Request, res: Response) => {
  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
    return;
  }

  try {
    const cart = await odoo.patch<Cart>('/cart/items', {
      line_id: parsed.data.lineId,
      quantity: parsed.data.quantity,
    });
    res.json(cart);
  } catch (err: any) {
    console.error('Failed to update cart item:', err.message);
    res.status(500).json({ error: { code: 'CART_ERROR', message: 'Failed to update cart item' } });
  }
});

// DELETE /api/public/cart/items/:lineId
router.delete('/items/:lineId', async (req: Request, res: Response) => {
  const lineId = parseInt(req.params.lineId as string, 10);
  if (isNaN(lineId)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid line ID' } });
    return;
  }

  try {
    const cart = await odoo.delete<Cart>(`/cart/items/${lineId}`);
    res.json(cart);
  } catch (err: any) {
    console.error('Failed to remove cart item:', err.message);
    res.status(500).json({ error: { code: 'CART_ERROR', message: 'Failed to remove cart item' } });
  }
});

export default router;
