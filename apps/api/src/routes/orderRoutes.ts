import { Router, Request, Response, IRouter } from 'express';
import { z } from 'zod';
import { odoo } from '../services/odooClient';
import type { Order } from '../models/order';

const router: IRouter = Router();

const checkoutSchema = z.object({
  shippingName: z.string().min(1),
  shippingPhone: z.string().min(1),
  shippingAddress: z.string().min(1),
  shippingCity: z.string().min(1),
  shippingDepartment: z.string().min(1),
  shippingNotes: z.string().optional(),
  paymentMethod: z.string().min(1),
});

// POST /api/public/orders
router.post('/', async (req: Request, res: Response) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
    return;
  }

  try {
    const order = await odoo.post<Order>('/orders', {
      shipping_name: parsed.data.shippingName,
      shipping_phone: parsed.data.shippingPhone,
      shipping_address: parsed.data.shippingAddress,
      shipping_city: parsed.data.shippingCity,
      shipping_department: parsed.data.shippingDepartment,
      shipping_notes: parsed.data.shippingNotes || null,
      payment_method: parsed.data.paymentMethod,
    });
    res.json(order);
  } catch (err: any) {
    console.error('Failed to checkout:', err.message);
    res.status(500).json({ error: { code: 'ORDER_ERROR', message: 'Failed to place order' } });
  }
});

// GET /api/public/orders/:orderId
router.get('/:orderId', async (req: Request, res: Response) => {
  const orderId = parseInt(req.params.orderId as string, 10);
  if (isNaN(orderId)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid order ID' } });
    return;
  }

  try {
    const order = await odoo.get<Order>(`/orders/${orderId}`);
    res.json(order);
  } catch (err: any) {
    console.error('Failed to get order:', err.message);
    res.status(500).json({ error: { code: 'ORDER_ERROR', message: 'Failed to get order' } });
  }
});

export default router;
