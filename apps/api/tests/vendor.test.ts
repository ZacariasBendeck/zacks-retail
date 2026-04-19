import request from 'supertest';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';

function getCategoryId(ricsCode: number): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_categories WHERE rics_code = ?').get(ricsCode) as { id: number } | undefined;
  return row ? row.id : null;
}

function getBrandId(code: string): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_brands WHERE code = ?').get(code) as { id: number } | undefined;
  return row ? row.id : null;
}

function getColorId(code: string): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_colors WHERE code = ?').get(code) as { id: number } | undefined;
  return row ? row.id : null;
}

const validVendor = {
  name: 'Calzados Premium',
  contactEmail: 'ventas@calzados.com',
  phone: '+58-212-555-0100',
  paymentTerms: 'NET_30',
  leadTimeDays: 14,
};

beforeEach(() => {
  resetDb();
});

afterAll(() => {
  resetDb();
});

describe('POST /api/v1/vendors', () => {
  it('creates a vendor with all fields', async () => {
    const res = await request(app).post('/api/v1/vendors').send(validVendor);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Calzados Premium');
    expect(res.body.contactEmail).toBe('ventas@calzados.com');
    expect(res.body.phone).toBe('+58-212-555-0100');
    expect(res.body.paymentTerms).toBe('NET_30');
    expect(res.body.leadTimeDays).toBe(14);
    expect(res.body.active).toBe(true);
    expect(res.body.id).toBeDefined();
  });

  it('rejects vendor missing mandatory fields (contactEmail, paymentTerms, leadTimeDays)', async () => {
    const res = await request(app).post('/api/v1/vendors').send({ name: 'Simple Vendor' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing name', async () => {
    const res = await request(app).post('/api/v1/vendors').send({ contactEmail: 'test@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid payment terms', async () => {
    const res = await request(app).post('/api/v1/vendors').send({ ...validVendor, paymentTerms: 'NET_45' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid email', async () => {
    const res = await request(app).post('/api/v1/vendors').send({ ...validVendor, contactEmail: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('rejects negative lead time', async () => {
    const res = await request(app).post('/api/v1/vendors').send({ ...validVendor, leadTimeDays: -5 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/vendors/:vendorId', () => {
  it('returns a vendor by ID', async () => {
    const created = await request(app).post('/api/v1/vendors').send(validVendor);
    const res = await request(app).get(`/api/v1/vendors/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Calzados Premium');
  });

  it('returns 404 for missing vendor', async () => {
    const res = await request(app).get('/api/v1/vendors/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/vendors/:vendorId', () => {
  it('updates vendor fields', async () => {
    const created = await request(app).post('/api/v1/vendors').send(validVendor);
    const res = await request(app)
      .patch(`/api/v1/vendors/${created.body.id}`)
      .send({ paymentTerms: 'NET_60', leadTimeDays: 21 });
    expect(res.status).toBe(200);
    expect(res.body.paymentTerms).toBe('NET_60');
    expect(res.body.leadTimeDays).toBe(21);
    expect(res.body.name).toBe('Calzados Premium'); // unchanged
  });

  it('returns 404 for missing vendor', async () => {
    const res = await request(app)
      .patch('/api/v1/vendors/00000000-0000-0000-0000-000000000099')
      .send({ name: 'New Name' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/vendors/:vendorId', () => {
  it('deletes a vendor with no associated SKUs', async () => {
    const created = await request(app).post('/api/v1/vendors').send(validVendor);
    const res = await request(app).delete(`/api/v1/vendors/${created.body.id}`);
    expect(res.status).toBe(204);

    const check = await request(app).get(`/api/v1/vendors/${created.body.id}`);
    expect(check.status).toBe(404);
  });

  it('blocks deletion when vendor has associated SKUs', async () => {
    const vendor = await request(app).post('/api/v1/vendors').send(validVendor);

    // Create a SKU linked to this vendor
    await request(app).post('/api/v1/skus').send({
      style: 'Air Max',
      price: 129.99,
      department: 'FORMAL',
      categoryId: getCategoryId(560),
      brandId: getBrandId('KISS'),
      colorId: getColorId('BK'),
      vendorId: vendor.body.id,
    });

    const res = await request(app).delete(`/api/v1/vendors/${vendor.body.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VENDOR_HAS_ASSOCIATIONS');
  });

  it('returns 404 for missing vendor', async () => {
    const res = await request(app).delete('/api/v1/vendors/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/vendors (list)', () => {
  beforeEach(async () => {
    const vendors = [
      { name: 'Alpha Shoes', contactEmail: 'alpha@shoes.com', paymentTerms: 'NET_30', leadTimeDays: 10 },
      { name: 'Beta Calzados', contactEmail: 'beta@calzados.com', paymentTerms: 'NET_60', leadTimeDays: 15 },
      { name: 'Gamma Footwear', contactEmail: 'gamma@footwear.com', paymentTerms: 'NET_90', leadTimeDays: 20 },
    ];
    for (const v of vendors) {
      await request(app).post('/api/v1/vendors').send(v);
    }
  });

  it('returns vendors sorted by name', async () => {
    const res = await request(app).get('/api/v1/vendors');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    const names = res.body.data.map((v: any) => v.name);
    expect(names).toEqual(['Alpha Shoes', 'Beta Calzados', 'Gamma Footwear']);
  });

  it('paginates results', async () => {
    const res = await request(app).get('/api/v1/vendors?page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination.totalItems).toBe(3);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  it('searches by name', async () => {
    const res = await request(app).get('/api/v1/vendors?q=Beta');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Beta Calzados');
  });
});
