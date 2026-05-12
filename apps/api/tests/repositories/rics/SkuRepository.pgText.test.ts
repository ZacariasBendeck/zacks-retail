const mockQuery = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockQuery,
  })),
}));

import { SkuRepository } from '../../../src/repositories/rics/SkuRepository';

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [] });
});

describe('SkuRepository Postgres text parameters', () => {
  it('strips NUL bytes from text filters before calling pg', async () => {
    const result = await SkuRepository.findAll({
      q: 'bo\0ot',
      sku: 'ab\0*',
      vendor: 've\0ndor',
      description: 'le\0ather',
      styleColor: 'bl\0ack',
      codes: ['\0'],
    });

    expect(result.ok).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FALSE');
    expect(params).toEqual(['%BOOT%', 'AB%', '%LEATHER%', ['VENDOR'], '%BLACK%']);
  });
});
