/**
 * Route-level tests for GET /api/v1/skus/:skuCode/upcs
 *
 * The RICS adapter does not yet expose UPC data, so the route returns []
 * unconditionally for now. Phase 2 will hook up the SkuUpc repository.
 */

import request from 'supertest';

describe('GET /api/v1/skus/:skuCode/upcs', () => {
  let app: any;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
  });

  it('returns 200 with an empty array for any SKU code', async () => {
    const res = await request(app).get('/api/v1/skus/ZN02-NDPT/upcs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('returns 200 with an empty array for another SKU code', async () => {
    const res = await request(app).get('/api/v1/skus/SOME-OTHER-SKU/upcs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
