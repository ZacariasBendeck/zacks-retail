import request from 'supertest';
import app from '../src/app';
import { resetDb } from '../src/db/database';

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

  it('creates a vendor with only name', async () => {
    const res = await request(app).post('/api/v1/vendors').send({ name: 'Simple Vendor' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Simple Vendor');
    expect(res.body.contactEmail).toBeNull();
    expect(res.body.paymentTerms).toBeNull();
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
      brand: 'Nike',
      style: 'Air Max',
      color: 'Black',
      size: '9',
      price: 129.99,
      category: 560,
      department: 'FORMAL',
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
      { name: 'Alpha Shoes', paymentTerms: 'NET_30' },
      { name: 'Beta Calzados', paymentTerms: 'NET_60' },
      { name: 'Gamma Footwear', paymentTerms: 'NET_90' },
    ];
    for (const v of vendors) {
      await request(app).post('/api/v1/vendors').send(v);
    }
  });

  it('returns vendors sorted by name', async () => {
    const res = await request(app).get('/api/v1/vendors');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    expect(res.body.data[0].name).toBe('Alpha Shoes');
    expect(res.body.data[1].name).toBe('Beta Calzados');
    expect(res.body.data[2].name).toBe('Gamma Footwear');
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
