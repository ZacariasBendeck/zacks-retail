import request from 'supertest';

const mockApplyBatchChange = jest.fn();
const mockUndoBatch = jest.fn();

jest.mock('../src/middleware/authMiddleware', () => ({
  SESSION_COOKIE: 'sid',
  attachUser: () => (req: any, _res: any, next: any) => {
    const userId = req.get('x-test-user');
    if (userId) {
      req.user = { id: userId, email: `${userId}@example.com`, displayName: 'Utilities Route Tester' };
      req.permissions = new Set(
        String(req.get('x-test-permissions') ?? '')
          .split(',')
          .map((permission) => permission.trim())
          .filter(Boolean),
      );
    }
    next();
  },
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
      return;
    }
    next();
  },
  requirePermission: (permission: string) => (req: any, res: any, next: any) => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
      return;
    }
    if (!req.permissions?.has(permission)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: `Missing permission: ${permission}` } });
      return;
    }
    next();
  },
}));

jest.mock('../src/services/utilities/batchChangeService', () => ({
  applyBatchChange: mockApplyBatchChange,
  undoBatch: mockUndoBatch,
  BatchChangeValidationError: class BatchChangeValidationError extends Error {},
}));

import app from '../src/app';

const SKU_BULK_WRITE_PERMISSION = 'products.sku_bulk_write';

describe('utilities batch routes permissions', () => {
  beforeEach(() => {
    mockApplyBatchChange.mockReset();
    mockUndoBatch.mockReset();
    mockApplyBatchChange.mockResolvedValue({ batchId: 'batch-1', affectedCount: 1, preview: ['ABC123'] });
    mockUndoBatch.mockResolvedValue({ reversed: 1 });
  });

  it('requires SKU bulk-write permission to apply a batch change', async () => {
    const body = {
      operationType: 'CHANGE_CATEGORY',
      criteria: { skus: ['ABC123'] },
      change: { type: 'CHANGE_CATEGORY', category: 42 },
    };

    const anonymous = await request(app).post('/api/v1/utilities/batch').send(body);
    expect(anonymous.status).toBe(401);

    const forbidden = await request(app)
      .post('/api/v1/utilities/batch')
      .set('x-test-user', 'buyer')
      .send(body);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.message).toContain(SKU_BULK_WRITE_PERMISSION);

    const allowed = await request(app)
      .post('/api/v1/utilities/batch')
      .set('x-test-user', 'admin')
      .set('x-test-permissions', SKU_BULK_WRITE_PERMISSION)
      .send(body);
    expect(allowed.status).toBe(200);
    expect(allowed.body.affectedCount).toBe(1);
    expect(mockApplyBatchChange).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'admin@example.com',
      operationType: 'CHANGE_CATEGORY',
    }));
  });

  it('requires SKU bulk-write permission to undo a batch change', async () => {
    const forbidden = await request(app)
      .post('/api/v1/utilities/batch/batch-1/undo')
      .set('x-test-user', 'buyer')
      .send();
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.message).toContain(SKU_BULK_WRITE_PERMISSION);

    const allowed = await request(app)
      .post('/api/v1/utilities/batch/batch-1/undo')
      .set('x-test-user', 'admin')
      .set('x-test-permissions', SKU_BULK_WRITE_PERMISSION)
      .send();
    expect(allowed.status).toBe(200);
    expect(allowed.body.reversed).toBe(1);
    expect(mockUndoBatch).toHaveBeenCalledWith('batch-1', 'admin@example.com');
  });
});
