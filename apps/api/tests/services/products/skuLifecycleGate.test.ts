/**
 * Integration tests for skuLifecycleGate — the helper that wraps the
 * per-consumer gatekeepers (sell / allocate / print-barcode / receive) and
 * resolves SKU identifiers against `app.sku`. Hits the live Postgres table.
 * Skipped when DATABASE_URL is missing.
 */
import { skuLifecycle } from '../../../src/services/products/skuLifecycleService';
import { skuGate } from '../../../src/services/products/skuLifecycleGate';
import { prisma } from '../../../src/db/prisma';

const ACTOR = `jest-gate-${process.pid}`;

async function cleanup(): Promise<void> {
  await prisma.sku.deleteMany({ where: { createdBy: ACTOR } });
}

const maybeDescribe = process.env.DATABASE_URL ? describe : describe.skip;

maybeDescribe('skuLifecycleGate', () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function newDraft(): Promise<{ id: string; provisionalCode: string }> {
    const r = await skuLifecycle.create({ vendorSku: 'GATE-VEN' }, ACTOR);
    if (!r.ok) throw new Error('precondition failed');
    return { id: r.value.id, provisionalCode: r.value.provisionalCode };
  }

  async function newActive(code: string): Promise<{ id: string; code: string }> {
    const r = await skuLifecycle.create(
      {
        familyCode: 'zapatos',
        categoryNumber: 591,
        brandId: 1,
        descriptionRics: 'Gate test',
      },
      ACTOR,
    );
    if (!r.ok) throw new Error('precondition failed');
    const fin = await skuLifecycle.finalize(r.value.id, { code }, ACTOR);
    if (!fin.ok) throw new Error('precondition failed');
    return { id: fin.value.id, code };
  }

  describe('findActiveSku', () => {
    it('returns null when the identifier matches nothing in app.sku', async () => {
      const r = await skuGate.findActiveSku({ code: 'DOES-NOT-EXIST' });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toBeNull();
    });

    it('returns the SKU when ACTIVE (by code)', async () => {
      const { code } = await newActive('GATE-A01');
      const r = await skuGate.findActiveSku({ code });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value?.code).toBe(code);
      expect(r.value?.skuState).toBe('ACTIVE');
    });

    it('blocks with NotFound when the matched SKU is DRAFT', async () => {
      const { provisionalCode } = await newDraft();
      const r = await skuGate.findActiveSku({ code: provisionalCode });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.kind).toBe('NotFound');
      expect(r.error.message).toMatch(/no disponible/);
    });

    it('looks up by id', async () => {
      const { code, id } = await newActive('GATE-A02');
      const r = await skuGate.findActiveSku({ id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value?.code).toBe(code);
    });
  });

  describe('gateForSell', () => {
    it('passes through null when no app.sku match (legacy RICS pass-through)', async () => {
      const r = await skuGate.gateForSell({ code: 'NOT-IN-APP-SKU' });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toBeNull();
    });

    it('allows ACTIVE', async () => {
      const { id } = await newActive('GATE-S01');
      const r = await skuGate.gateForSell({ id });
      expect(r.ok).toBe(true);
    });

    it('blocks DRAFT', async () => {
      const { id } = await newDraft();
      const r = await skuGate.gateForSell({ id });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.kind).toBe('ConstraintViolation');
    });

    it('blocks DISCONTINUED', async () => {
      const { id } = await newActive('GATE-S02');
      await skuLifecycle.discontinue(id, ACTOR);
      const r = await skuGate.gateForSell({ id });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.kind).toBe('ConstraintViolation');
    });
  });

  describe('gateForReceive (DRAFT + ACTIVE both allowed)', () => {
    it('allows DRAFT (warehouse can receive before finalize)', async () => {
      const { id } = await newDraft();
      const r = await skuGate.gateForReceive({ id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value?.skuState).toBe('DRAFT');
    });

    it('allows ACTIVE', async () => {
      const { id } = await newActive('GATE-R01');
      const r = await skuGate.gateForReceive({ id });
      expect(r.ok).toBe(true);
    });

    it('blocks DISCONTINUED', async () => {
      const { id } = await newActive('GATE-R02');
      await skuLifecycle.discontinue(id, ACTOR);
      const r = await skuGate.gateForReceive({ id });
      expect(r.ok).toBe(false);
    });
  });

  describe('gateForAllocate (ACTIVE only)', () => {
    it('blocks DRAFT (warehouse has stock but can\'t allocate to store)', async () => {
      const { id } = await newDraft();
      const r = await skuGate.gateForAllocate({ id });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.kind).toBe('ConstraintViolation');
    });

    it('allows ACTIVE', async () => {
      const { id } = await newActive('GATE-AL1');
      const r = await skuGate.gateForAllocate({ id });
      expect(r.ok).toBe(true);
    });
  });

  describe('gateForPrintBarcode (ACTIVE + non-null code)', () => {
    it('blocks DRAFT with Spanish message', async () => {
      const { id } = await newDraft();
      const r = await skuGate.gateForPrintBarcode({ id });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.message).toMatch(/borrador/);
    });

    it('allows ACTIVE with final code', async () => {
      const { id, code } = await newActive('GATE-B01');
      const r = await skuGate.gateForPrintBarcode({ id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value?.code).toBe(code);
    });
  });
});
