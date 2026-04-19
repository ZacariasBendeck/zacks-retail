import request from 'supertest';
import app from '../../src/app';
import { resetDb } from '../../src/db/database';

beforeEach(() => {
  resetDb();
});

describe('GET /api/v1/company-settings/otb-entry-method', () => {
  it('returns the seeded default', async () => {
    const res = await request(app).get('/api/v1/company-settings/otb-entry-method');
    expect(res.status).toBe(200);
    expect(res.body.value).toBe('CHANGE_OVER_LAST_YEAR');
  });
});

describe('PUT /api/v1/company-settings/otb-entry-method', () => {
  it('accepts a valid value', async () => {
    const res = await request(app)
      .put('/api/v1/company-settings/otb-entry-method')
      .send({ value: 'FIXED_MONTHLY_MIX', changedBy: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe('FIXED_MONTHLY_MIX');

    const re = await request(app).get('/api/v1/company-settings/otb-entry-method');
    expect(re.body.value).toBe('FIXED_MONTHLY_MIX');
  });

  it('rejects an unknown enum value', async () => {
    const res = await request(app)
      .put('/api/v1/company-settings/otb-entry-method')
      .send({ value: 'BOGUS' });
    expect(res.status).toBe(400);
  });
});
