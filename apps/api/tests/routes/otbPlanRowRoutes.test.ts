import request from 'supertest';
import app from '../../src/app';
import { resetDb } from '../../src/db/database';

const valid = {
  storeId: 'store-1',
  categoryId: 'cat-556',
  fiscalYear: 2026,
  pctChangeLyToCy: 7.5,
  plannedGpPct: 48,
  lySales: Array(12).fill(10000) as (number | null)[],
};

beforeEach(() => {
  resetDb();
});

describe('POST /api/v1/otb/plan-rows', () => {
  it('creates a row', async () => {
    const res = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.storeId).toBe('store-1');
    expect(res.body.lySales).toEqual(Array(12).fill(10000));
  });

  it('returns 409 on duplicate key', async () => {
    await request(app).post('/api/v1/otb/plan-rows').send(valid);
    const res = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_KEY');
  });

  it('returns 400 on malformed monthly array', async () => {
    const res = await request(app).post('/api/v1/otb/plan-rows').send({ ...valid, lySales: [1, 2, 3] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/otb/plan-rows', () => {
  it('lists with pagination', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/v1/otb/plan-rows').send({ ...valid, categoryId: `cat-55${i}` });
    }
    const res = await request(app).get('/api/v1/otb/plan-rows?page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(3);
  });
});

describe('GET /api/v1/otb/plan-rows/:id', () => {
  it('returns the row', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    const res = await request(app).get(`/api/v1/otb/plan-rows/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('returns 404 for missing', async () => {
    const res = await request(app).get('/api/v1/otb/plan-rows/nope');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/otb/plan-rows/:id', () => {
  it('patches and returns the updated row', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    const res = await request(app).patch(`/api/v1/otb/plan-rows/${created.body.id}`).send({ pctChangeLyToCy: 10 });
    expect(res.status).toBe(200);
    expect(res.body.pctChangeLyToCy).toBe(10);
  });
});

describe('POST /api/v1/otb/plan-rows/:id/recalculate', () => {
  it('recalculates planned sales from LY × (1 + pct/100)', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send({
      ...valid,
      lySales: Array(12).fill(10000),
      pctChangeLyToCy: 10,
    });
    const res = await request(app).post(`/api/v1/otb/plan-rows/${created.body.id}/recalculate`).send({});
    expect(res.status).toBe(200);
    expect(res.body.plannedSales[0]).toBe(11000);
  });
});

describe('POST /api/v1/otb/plan-rows/:id/copy', () => {
  it('copies to a new store/category', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    const res = await request(app)
      .post(`/api/v1/otb/plan-rows/${created.body.id}/copy`)
      .send({ targetStoreId: 'store-2', targetCategoryId: 'cat-557' });
    expect(res.status).toBe(201);
    expect(res.body.storeId).toBe('store-2');
    expect(res.body.categoryId).toBe('cat-557');
    expect(res.body.id).not.toBe(created.body.id);
  });

  it('returns 409 on collision', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    await request(app).post('/api/v1/otb/plan-rows').send({ ...valid, storeId: 'store-2', categoryId: 'cat-557' });
    const res = await request(app)
      .post(`/api/v1/otb/plan-rows/${created.body.id}/copy`)
      .send({ targetStoreId: 'store-2', targetCategoryId: 'cat-557' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/v1/otb/plan-rows/:id', () => {
  it('returns 204 on delete', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    const res = await request(app).delete(`/api/v1/otb/plan-rows/${created.body.id}`);
    expect(res.status).toBe(204);
  });
});

describe('GET /api/v1/otb/plan-rows/:id/audit', () => {
  it('returns the audit trail', async () => {
    const created = await request(app).post('/api/v1/otb/plan-rows').send(valid);
    await request(app).patch(`/api/v1/otb/plan-rows/${created.body.id}`).send({ pctChangeLyToCy: 10, changedBy: 'buyer1' });
    const res = await request(app).get(`/api/v1/otb/plan-rows/${created.body.id}/audit`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].fieldChanged).toBe('pct_change_ly_to_cy');
    expect(res.body[0].changedBy).toBe('buyer1');
  });
});
