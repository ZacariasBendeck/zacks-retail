import express, { Express } from 'express';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import skuRoutes from './routes/skuRoutes';
import inventoryRoutes from './routes/inventoryRoutes';
import vendorRoutes from './routes/vendorRoutes';
import reportRoutes from './routes/reportRoutes';
import purchaseOrderRoutes from './routes/purchaseOrderRoutes';
import otbBudgetRoutes from './routes/otbBudgetRoutes';

const app: Express = express();

app.use(cors());
app.use(express.json());

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
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/purchase-orders', purchaseOrderRoutes);
app.use('/api/v1/otb-budgets', otbBudgetRoutes);

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
