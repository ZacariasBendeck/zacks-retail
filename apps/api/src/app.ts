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
import supplierQuotationRoutes from './routes/supplierQuotationRoutes';
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
import otbDashboardRoutes from './routes/otbDashboardRoutes';
import otbLinesRoutes from './routes/otbLinesRoutes';
import otbMonthlyPlanRoutes from './routes/otbMonthlyPlanRoutes';
import otbPlanRowRoutes from './routes/otbPlanRowRoutes';
import purchasePlanningRoutes from './routes/purchasePlanningRoutes';
import assortmentPlanningRoutes from './routes/assortmentPlanningRoutes';
import importManagementRoutes from './routes/importManagementRoutes';
import companySettingsRoutes from './routes/companySettingsRoutes';
import publicProductRoutes from './routes/publicProductRoutes';
import cartRoutes from './routes/cartRoutes';
import orderRoutes from './routes/orderRoutes';
import posRoutes from './routes/posRoutes';
import posSkuRoutes from './routes/posSkuRoutes';
import storeRoutes from './routes/storeRoutes';
import casePackRoutes from './routes/casePackRoutes';
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
import productsMatchingSetRoutes from './routes/products/matchingSetRoutes';
import utilitiesBatchRoutes from './routes/utilities/batchRoutes';
import migrationDayRoutes from './routes/operations/migrationDayRoutes';
import inventoryCloseRoutes from './routes/operations/inventoryCloseRoutes';
import { createAuthRoutes } from './routes/authRoutes';
import { createEmployeeRoutes } from './routes/employeeRoutes';
import { createTimeClockRoutes } from './routes/timeClockRoutes';
import { createUserRoutes } from './routes/userRoutes';
import { createPlatformAuditRoutes } from './routes/platformAuditRoutes';
import { createPlatformRequestTraceRoutes } from './routes/platformRequestTraceRoutes';
import { createActivityReviewRoutes } from './routes/activityReviewRoutes';
import { createReportTemplatesRoutes } from './routes/reports/reportTemplatesRoutes';
import { createReportRunsRoutes } from './routes/reports/reportRunsRoutes';
import { attachUser } from './middleware/authMiddleware';
import {
  enrichRequestContextMiddleware,
  requestLoggingMiddleware,
} from './observability/requestLoggingMiddleware';
import { getTraceId } from './observability/requestContext';
import { logger } from './observability/logger';

const app: Express = express();
const prisma = new PrismaClient();

app.use(requestLoggingMiddleware(prisma));
app.use(cors());
// Bumped from the 100KB default so Save-snapshot can POST a full report
// payload. The reportRuns route enforces its own 20 MB resultJson cap via
// zod (see routes/reports/schemas.ts MAX_RESULT_BYTES); 25 MB here gives
// that cap a little envelope/overhead headroom without itself becoming the
// hard ceiling. Without this, a few-thousand-row Sales Pivot snapshot is
// rejected with 413 PayloadTooLarge before the route handler even runs.
app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());
app.use(attachUser(prisma));
app.use(enrichRequestContextMiddleware);

const DEFAULT_RICS_REMOTE_IMAGE_BASE_URL = 'https://proc-scenes-filtering-danny.trycloudflare.com/RICSPICS';
const RICS_REMOTE_IMAGE_BASE_URL = (process.env.RICS_IMAGE_BASE_URL?.trim() || DEFAULT_RICS_REMOTE_IMAGE_BASE_URL).replace(/\/+$/, '');
const resolvedRicsImageUrls = new Map<string, { url: string | null; expiresAt: number }>();
const RICS_IMAGE_RESOLUTION_TTL_MS = 10 * 60_000;
// RICS product images - served from the legacy RICS install's pics folder.
// Defaults to C:\RICSWIN\ricspics on Windows. Override with RICS_IMAGES_DIR.
// URLs resolve like /rics-images/DMTDU1BK.jpg.
const RICS_IMAGES_DIR = path.resolve(process.env.RICS_IMAGES_DIR || 'C:/RICSWIN/ricspics');

function sanitizeRicsImageFileName(raw: string | undefined): string | null {
  const fileName = raw?.trim();
  if (!fileName || fileName.length > 255) return null;
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0')) return null;
  return fileName;
}

function candidateRicsImageFileNames(fileName: string): string[] {
  const candidates = [fileName];
  const match = fileName.match(/^(.*)\.(jpg|jpeg|gif|bmp|png|webp)$/i);
  if (match) {
    const stem = match[1];
    const ext = match[2].toLowerCase();
    candidates.push(`${stem}.${ext.toUpperCase()}`, `${stem}.${ext.toLowerCase()}`);
    if (ext === 'jpg') candidates.push(`${stem}.jpeg`, `${stem}.JPEG`);
    if (ext === 'jpeg') candidates.push(`${stem}.jpg`, `${stem}.JPG`);
  }
  return Array.from(new Set(candidates));
}

async function remoteImageExists(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveLocalRicsImagePath(fileName: string): string | null {
  if (!fs.existsSync(RICS_IMAGES_DIR)) return null;
  for (const candidate of candidateRicsImageFileNames(fileName)) {
    const candidatePath = path.resolve(RICS_IMAGES_DIR, candidate);
    if (!candidatePath.startsWith(RICS_IMAGES_DIR + path.sep)) continue;
    if (fs.existsSync(candidatePath)) return candidatePath;
  }
  return null;
}

async function resolveRicsImageUrl(fileName: string): Promise<string | null> {
  const cacheKey = fileName.toLowerCase();
  const cached = resolvedRicsImageUrls.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  let resolved: string | null = null;
  for (const candidate of candidateRicsImageFileNames(fileName)) {
    const url = `${RICS_REMOTE_IMAGE_BASE_URL}/${encodeURIComponent(candidate)}`;
    if (await remoteImageExists(url)) {
      resolved = url;
      break;
    }
  }

  resolvedRicsImageUrls.set(cacheKey, {
    url: resolved,
    expiresAt: Date.now() + RICS_IMAGE_RESOLUTION_TTL_MS,
  });
  return resolved;
}

app.get('/api/rics-images/:filename', async (req, res): Promise<void> => {
  const fileName = sanitizeRicsImageFileName(req.params.filename);
  if (!fileName) {
    res.status(400).send('Invalid image filename.');
    return;
  }

  const localPath = resolveLocalRicsImagePath(fileName);
  if (localPath) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(localPath);
    return;
  }

  const url = await resolveRicsImageUrl(fileName);
  if (!url) {
    res.status(404).send('Image not found.');
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.redirect(302, url);
});

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
app.use('/api/v1/purchasing/supplier-quotations', supplierQuotationRoutes);
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
app.use('/api/v1/otb/dashboard', otbDashboardRoutes);
app.use('/api/v1/otb', otbLinesRoutes);
app.use('/api/v1/otb/monthly-plans', otbMonthlyPlanRoutes);
app.use('/api/v1/otb/plan-rows', otbPlanRowRoutes);
app.use('/api/v1/purchase-planning', purchasePlanningRoutes);
app.use('/api/v1/assortment-planning', assortmentPlanningRoutes);
app.use('/api/v1/import-management', importManagementRoutes);
app.use('/api/v1/company-settings', companySettingsRoutes);
app.use('/api/public/products', publicProductRoutes);
app.use('/api/public/cart', cartRoutes);
app.use('/api/public/orders', orderRoutes);

// shared store-master reads
app.use('/api/v1/stores', storeRoutes);
app.use('/api/v1/case-packs', casePackRoutes);

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
app.use('/api/v1/products/matching-sets', productsMatchingSetRoutes);
app.use('/api/v1/products/sku-drafts', productsSkuDraftRoutes); // lifecycle routes — must mount BEFORE /products/skus
app.use('/api/v1/products/skus/lookup', productsSkuLookupRoutes); // criteria lookup — must mount BEFORE /products/skus
app.use('/api/v1/products/skus/on-hand-totals', productsOnHandTotalsRoutes);
app.use('/api/v1/products', productsAttributesRoutes); // /attributes/* + /skus/:code/attributes
app.use('/api/v1/products/skus', productsSkuRoutes);

// utilities module — batch-change primitives (spec: docs/modules/utilities.md)
app.use('/api/v1/utilities', utilitiesBatchRoutes);
app.use('/api/v1/operations/migration-day', migrationDayRoutes);
app.use('/api/v1/operations/inventory-close', inventoryCloseRoutes);

// identity-access module
app.use('/api/v1/auth', createAuthRoutes(prisma));
app.use('/api/v1/users', createUserRoutes(prisma));

// platform shared audit log
app.use('/api/v1/platform/audit', createPlatformAuditRoutes(prisma));
app.use('/api/v1/platform/request-traces', createPlatformRequestTraceRoutes(prisma));
app.use('/api/v1/activity-review', createActivityReviewRoutes(prisma));

// employees module
app.use('/api/v1/employees', createEmployeeRoutes(prisma));
app.use('/api/v1', createTimeClockRoutes(prisma));

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
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);

  const traceId = getTraceId();
  res.locals.requestError = {
    code: 'INTERNAL_ERROR',
    message: 'An internal server error occurred.',
  };
  logger.error(
    {
      err,
      method: req.method,
      originalUrl: req.originalUrl,
      traceId,
    },
    'unhandled request error',
  );
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal server error occurred.',
      traceId,
      ...(isDev ? { devDetail: `${err.name}: ${err.message}` } : {}),
    },
  });
});

export default app;


