jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

import {
  clearSeasonalityIndexCache,
  getDepartmentSeasonalityRow,
} from '../src/services/seasonalityIndexService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../src/db/prisma');

describe('department seasonality query construction', () => {
  beforeEach(() => {
    clearSeasonalityIndexCache();
    (prisma.$queryRawUnsafe as jest.Mock).mockReset();
  });

  it('loads reorder planner seasonality through sku_id-linked sales lines', async () => {
    (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValueOnce([
      { department_number: 57, department_label: '57 - Sample', year_month: '2026-04', qty: 10 },
    ]);

    const row = await getDepartmentSeasonalityRow(57, '2026-04');
    const [sql, ...params] = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[0];

    expect(sql).toContain('JOIN app.sales_history_ticket_line l ON l.sku_id = s.id');
    expect(sql).not.toContain('s_by_code');
    expect(sql).not.toContain('UPPER(');
    expect(params).toEqual(['2025-05', '2026-04', 57]);
    expect(row.departmentNumber).toBe(57);
    expect(row.sampleMonths).toBe(1);
  });

  it('caches department seasonality by department and history window', async () => {
    (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValueOnce([
      { department_number: 57, department_label: '57 - Sample', year_month: '2026-04', qty: 10 },
    ]);

    await getDepartmentSeasonalityRow(57, '2026-04');
    await getDepartmentSeasonalityRow(57, '2026-04');

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
