import express, { Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { PrismaClient } from './prismaClient';
import skuRoutes from './routes/skuRoutes';
import inventoryRoutes from './routes/inventoryRoutes';
import vendorRoutes from './routes/vendorRoutes';
import reportRoutes from './routes/reportRoutes';
import purchaseOrderRoutes from './routes/purchaseOrderRoutes';
import otbBudgetRoutes from './routes/otbBudgetRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import adjustmentRoutes from './routes/adjustmentRoutes';
import manualReceiptRoutes from './routes/manualReceiptRoutes';
import manualReturnRoutes from './routes/manualReturnRoutes';
import replenishmentTargetRoutes from './routes/replenishmentTargetRoutes';
import transferRunRoutes from './routes/transferRunRoutes';
import inventoryMutationRoutes from './routes/inventoryMutationRoutes';
import ricsInventoryRoutes from './routes/ricsInventoryRoutes';
import locationRoutes from './routes/locationRoutes';
import transferOrderRoutes from './routes/transferOrderRoutes';
import salesLedgerRoutes from './routes/salesLedgerRoutes';
import salesReportRoutes from './routes/salesReportRoutes';
import otbLinesRoutes from './routes/otbLinesRoutes';
import otbMonthlyPlanRoutes from './routes/otbMonthlyPlanRoutes';
import otbPlanRowRoutes from './routes/otbPlanRowRoutes';
import purchasePlanningRoutes from './routes/purchasePlanningRoutes';
import companySettingsRoutes from './routes/companySettingsRoutes';
import publicProductRoutes from './routes/publicProductRoutes';
import cartRoutes from './routes/cartRoutes';
import orderRoutes from './routes/orderRoutes';
import posRoutes from './routes/posRoutes';
import posSkuRoutes from './routes/posSkuRoutes';
import storeRoutes from './routes/storeRoutes';
import customerRoutes from './routes/customerRoutes';
import customerTransactionsRoutes from './routes/customerTransactionsRoutes';
import customerSegmentationRoutes from './routes/customerSegmentationRoutes';
import physicalInventoryRoutes from './routes/physicalInventoryRoutes';
import productsTaxonomyRoutes from './routes/products/taxonomyRoutes';
import productsVendorRoutes from './routes/products/vendorRoutes';
import productsSkuRoutes from './routes/products/skuRoutes';
import productsSkuLookupRoutes from './routes/products/skuLookupRoutes';
import productsOnHandTotalsRoutes from './routes/products/onHandTotalsRoutes';
import productsAttributesRoutes from './routes/products/attributesRoutes';
import productsFamilyRoutes from './routes/products/familyRoutes';
import productsCategoryRoutes from './routes/products/categoryRoutes';
import productsSkuDraftRoutes from './routes/products/skuDraftRoutes';
import utilitiesBatchRoutes from './routes/utilities/batchRoutes';
import { createAuthRoutes } from './routes/authRoutes';
import { createEmployeeRoutes } from './routes/employeeRoutes';
import { createTimeClockRoutes } from './routes/timeClockRoutes';
import { createUserRoutes } from './routes/userRoutes';
import { createReportTemplatesRoutes } from './routes/reports/reportTemplatesRoutes';
import { createReportRunsRoutes } from './routes/reports/reportRunsRoutes';
import { attachUser } from './middleware/authMiddleware';

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());
const prisma = new PrismaClient();
app.use(attachUser(prisma));

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
app.use('/api/v1/inventory/manual-receipts', manualReceiptRoutes);
app.use('/api/v1/inventory/manual-returns', manualReturnRoutes);
app.use('/api/v1/inventory/replenishment-targets', replenishmentTargetRoutes);
app.use('/api/v1/inventory', inventoryMutationRoutes);
app.use('/api/v1/inventory', transferRunRoutes);
app.use('/api/v1/inventory', ricsInventoryRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/transfer-orders', transferOrderRoutes);
app.use('/api/v1/sales', salesLedgerRoutes);
app.use('/api/v1/otb', otbLinesRoutes);
app.use('/api/v1/otb/monthly-plans', otbMonthlyPlanRoutes);
app.use('/api/v1/otb/plan-rows', otbPlanRowRoutes);
app.use('/api/v1/purchase-planning', purchasePlanningRoutes);
app.use('/api/v1/company-settings', companySettingsRoutes);
app.use('/api/public/products', publicProductRoutes);
app.use('/api/public/cart', cartRoutes);
app.use('/api/public/orders', orderRoutes);

// shared store-master reads
app.use('/api/v1/stores', storeRoutes);

// sales-pos module
app.use('/api/v1/pos', posRoutes);
app.use('/api/v1/pos', posSkuRoutes);

// crm module
app.use('/api/v1/customers', customerRoutes);

// customer-transactions module
app.use('/api/v1/customer-transactions', customerTransactionsRoutes);

// customer-intelligence segmentation module
app.use('/api/v1', customerSegmentationRoutes);

// physical-inventory module (P1.a Wave 1 — lifecycle + entries; no commit-back)
app.use('/api/v1/count-sessions', physicalInventoryRoutes);

// products module — Phase 1 Step 2 taxonomy CRUD
app.use('/api/v1/taxonomy', productsTaxonomyRoutes);
app.use('/api/v1/products/vendors', productsVendorRoutes);
app.use('/api/v1/products/families', productsFamilyRoutes);
app.use('/api/v1/products/categories', productsCategoryRoutes); // all RICS categories joined with family
app.use('/api/v1/products/sku-drafts', productsSkuDraftRoutes); // lifecycle routes — must mount BEFORE /products/skus
app.use('/api/v1/products/skus/lookup', productsSkuLookupRoutes); // criteria lookup — must mount BEFORE /products/skus
app.use('/api/v1/products/skus/on-hand-totals', productsOnHandTotalsRoutes);
app.use('/api/v1/products', productsAttributesRoutes); // /attributes/* + /skus/:code/attributes
app.use('/api/v1/products/skus', productsSkuRoutes);

// utilities module — batch-change primitives (spec: docs/modules/utilities.md)
app.use('/api/v1/utilities', utilitiesBatchRoutes);

// employees module
app.use('/api/v1/auth', createAuthRoutes(prisma));
app.use('/api/v1/employees', createEmployeeRoutes(prisma));
app.use('/api/v1', createTimeClockRoutes(prisma));
app.use('/api/v1/users', createUserRoutes(prisma));

// reports module — saved templates (Phase 1) + frozen snapshots (Phase 1.1).
app.use('/api/v1/reports/templates', createReportTemplatesRoutes(prisma));
app.use('/api/v1/reports/runs', createReportRunsRoutes(prisma));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler. Logs the request method/path alongside the stack so
// operators can trace a client-side 500 back to the exact route without
// guessing. In dev, we also echo the error name in the response body — the
// client still only sees INTERNAL_ERROR in prod so we don't leak details.
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal server error occurred.',
      ...(isDev ? { devDetail: `${err.name}: ${err.message}` } : {}),
    },
  });
});

export default app;


