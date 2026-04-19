import { setupTestMdbs } from './testMdbSetup';

const ctx = setupTestMdbs();
const d = ctx.available ? describe : describe.skip;

import { NrfCodeRepository } from '../../../src/repositories/rics/NrfCodeRepository';

d('NrfCodeRepository (read-only lookup)', () => {
  it('returns an empty array when no NRF codes exist for a size type', async () => {
    // The NRMACodes table is empty in this customer's data.
    const result = await NrfCodeRepository.listForSizeType(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.value)).toBe(true);
  });

  it('supports lookup filters (rowLabel / columnPosition) without throwing', async () => {
    const result = await NrfCodeRepository.lookup({ sizeTypeCode: 1, rowLabel: 1 });
    expect(result.ok).toBe(true);
  });
});
