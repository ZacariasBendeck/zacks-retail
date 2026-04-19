import express, { Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import skuRoutes from './routes/skuRoutes';
import inventoryRoutes from './routes/inventoryRoutes';
import vendorRoutes from './routes/vendorRoutes';
import reportRoutes from './routes/reportRoutes';
import purchaseOrderRoutes from './routes/purchaseOrderRoutes';
import otbBudgetRoutes from './routes/otbBudgetRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import adjustmentRoutes from './routes/adjustmentRoutes';
import inventoryMutationRoutes from './routes/inventoryMutationRoutes';
import ricsInventoryRoutes from './routes/ricsInventoryRoutes';
import locationRoutes from './routes/locationRoutes';
import transferOrderRoutes from './routes/transferOrderRoutes';
import salesLedgerRoutes from './routes/salesLedgerRoutes';
import salesReportRoutes from './routes/salesReportRoutes';
import otbLinesRoutes from './routes/otbLinesRoutes';
import otbMonthlyPlanRoutes from './routes/otbMonthlyPlanRoutes';
import publicProductRoutes from './routes/publicProductRoutes';
import cartRoutes from './routes/cartRoutes';
import orderRoutes from './routes/orderRoutes';
import shiftRoutes from './routes/shiftRoutes';
import ticketRoutes from './routes/ticketRoutes';
import payoutRoutes from './routes/payoutRoutes';
import registerRoutes from './routes/registerRoutes';
import salesPasswordRoutes from './routes/salesPasswordRoutes';
import posReportRoutes from './routes/posReportRoutes';
import posSkuRoutes from './routes/posSkuRoutes';
import customerRoutes from './routes/customerRoutes';

const app: Express = express();

app.use(cors());
app.use(express.json());

// RICS product images — served from the legacy RICS install's pics folder.
// Defaults to C:\RICSWIN\ricspics on Windows. Override with RICS_IMAGES_DIR.
// URLs resolve like /rics-images/DMTDU1BK.jpg.
const RICS_IMAGES_DIR = path.resolve(process.env.RICS_IMAGES_DIR || 'C:/RICSWIN/ricspics');
if (fs.existsSync(RICS_IMAGES_DIR)) {
  app.use(
    '/rics-images',
    express.static(RICS_IMAGES_DIR, {
      maxAge: '1d',
      fallthrough: true,
      immutable: false,
    }),
  );
  console.log(`[app] Serving RICS images from ${RICS_IMAGES_DIR}`);
} else {
  console.warn(`[app] RICS_IMAGES_DIR not found at ${RICS_IMAGES_DIR}; product images will 404.`);
}

// Swagger
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Benlow RICS Inventory API',
      version: '1.0.0',
      description: 'REST API for shoe inventory management',
    },
    servers: [{ url: 'http://localhost:4000' }],
  },
  apis: ['./src/routes/*.ts'],
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/api/v1/skus', skuRoutes);
app.use('/api/v1/skus', inventoryRoutes);
app.use('/api/v1/vendors', vendorRoutes);
app.use('/api/v1/reports/sales', salesReportRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/purchase-orders', purchaseOrderRoutes);
app.use('/api/v1/otb-budgets', otbBudgetRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/inventory/adjustments', adjustmentRoutes);
app.use('/api/v1/inventory', inventoryMutationRoutes);
app.use('/api/v1/inventory', ricsInventoryRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/transfer-orders', transferOrderRoutes);
app.use('/api/v1/sales', salesLedgerRoutes);
app.use('/api/v1/otb', otbLinesRoutes);
app.use('/api/v1/otb/monthly-plans', otbMonthlyPlanRoutes);
app.use('/api/public/products', publicProductRoutes);
app.use('/api/public/cart', cartRoutes);
app.use('/api/public/orders', orderRoutes);

// sales-pos module
app.use('/api/v1/shifts', shiftRoutes);
app.use('/api/v1/tickets', ticketRoutes);
app.use('/api/v1/pay-outs', payoutRoutes);
app.use('/api/v1/pos', registerRoutes);
app.use('/api/v1/pos', salesPasswordRoutes);
app.use('/api/v1/pos', posSkuRoutes);
app.use('/api/v1/reports/pos', posReportRoutes);

// crm module
app.use('/api/v1/customers', customerRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An internal server error occurred.' } });
});

export default app;
