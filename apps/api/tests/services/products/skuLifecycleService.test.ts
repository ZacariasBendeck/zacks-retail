/**
 * Integration tests for skuLifecycleService — the DRAFT → ACTIVE → DISCONTINUED
 * state machine. Hits the live Postgres `app.sku` table. Each test cleans up
 * rows it created via a unique `createdBy` actor string so runs don't bleed
 * into each other.
 *
 * NOTE: These tests require a running Postgres with the 20260422160000
 * migration applied AND app.product_family seeded (via
 * `pnpm seed:product-families`). They are skipped automatically if
 * DATABASE_URL is missing.
 */
import {
  skuLifecycle,
  assertCanReceive,
  assertCanAllocate,
  assertCanPrintBarcode,
  assertCanSell,
  type SkuRow,
} from '../../../src/services/products/skuLifecycleService';
import { prisma } from '../../../src/db/prisma';

// Unique actor per test file so parallel runs don't clobber.
const ACTOR = `jest-lifecycle-${process.pid}`;

const maybeDescribe = process.env.DATABASE_URL ? describe : describe.skip;

async function cleanupActor(): Promise<void> {
  await prisma.sku.deleteMany({ where: { createdBy: ACTOR } });
}

maybeDescribe('skuLifecycleService', () => {
  beforeEach(cleanupActor);
  afterAll(async () => {
    await cleanupActor();
    await prisma.$disconnect();
  });

  describe('create', () => {
    it('creates a DRAFT with an auto-generated provisional code', async () => {
      const result = await skuLifecycle.create(
        { vendorSku: 'VEN-123', descriptionRics: 'Test draft' },
        ACTOR,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.skuState).toBe('DRAFT');
      expect(result.value.code).toBeNull();
      expect(result.value.provisionalCode).toMatch(/^DRF-\d{6}-[0-9A-F]{6}$/);
      expect(result.value.vendorSku).toBe('VEN-123');
      expect(result.value.createdBy).toBe(ACTOR);
    });

    it('writes a "created" row to sku_activity', async () => {
      const created = await skuLifecycle.create({}, ACTOR);
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const activity = await prisma.skuActivity.findMany({
        where: { skuId: created.value.id },
      });
      expect(activity).toHaveLength(1);
      expect(activity[0].event).toBe('created');
      expect(activity[0].toState).toBe('DRAFT');
    });
  });

  describe('finalize', () => {
    async function createWithRequired(): Promise<SkuRow> {
      const r = await skuLifecycle.create(
        {
          familyCode: 'zapatos',
          categoryNumber: 591,
          brandId: 1,
          descriptionRics: 'Bota de prueba',
        },
        ACTOR,
      );
      if (!r.ok) throw new Error(`precondition failed: ${r.error.message}`);
      return r.value;
    }

    it('transitions a complete DRAFT to ACTIVE with the supplied code', async () => {
      const draft = await createWithRequired();
      const result = await skuLifecycle.finalize(draft.id, { code: 'FIN-001' }, ACTOR);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.skuState).toBe('ACTIVE');
      expect(result.value.code).toBe('FIN-001');
      expect(result.value.activatedBy).toBe(ACTOR);
      expect(result.value.activatedAt).toBeInstanceOf(Date);
    });

    it('blocks finalize if required fields are missing', async () => {
      const r = await skuLifecycle.create({ vendorSku: 'NO-META' }, ACTOR);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const finalized = await skuLifecycle.finalize(r.value.id, { code: 'FIN-002' }, ACTOR);
      expect(finalized.ok).toBe(false);
      if (finalized.ok) return;
      expect(finalized.error.kind).toBe('ConstraintViolation');
      expect(finalized.error.message).toMatch(/familia|categoría|marca|descripción/);
    });

    it('blocks finalize if the code is too long', async () => {
      const draft = await createWithRequired();
      const finalized = await skuLifecycle.finalize(
        draft.id,
        { code: 'THIS-CODE-IS-TOO-LONG' },
        ACTOR,
      );
      expect(finalized.ok).toBe(false);
      if (finalized.ok) return;
      expect(finalized.error.kind).toBe('ConstraintViolation');
      expect(finalized.error.message).toMatch(/15 caracteres/);
    });

    it('blocks finalize if the code has illegal characters', async () => {
      const draft = await createWithRequired();
      const finalized = await skuLifecycle.finalize(draft.id, { code: 'FIN 001!' }, ACTOR);
      expect(finalized.ok).toBe(false);
      if (finalized.ok) return;
      expect(finalized.error.kind).toBe('ConstraintViolation');
    });

    it('blocks finalize on a non-DRAFT SKU', async () => {
      const draft = await createWithRequired();
      const firstFinalize = await skuLifecycle.finalize(draft.id, { code: 'FIN-003' }, ACTOR);
      expect(firstFinalize.ok).toBe(true);

      const secondFinalize = await skuLifecycle.finalize(draft.id, { code: 'FIN-004' }, ACTOR);
      expect(secondFinalize.ok).toBe(false);
      if (secondFinalize.ok) return;
      expect(secondFinalize.error.kind).toBe('ConstraintViolation');
      expect(secondFinalize.error.message).toMatch(/borrador/);
    });

    it('blocks finalize if the code collides with another app.sku', async () => {
      const a = await createWithRequired();
      const b = await createWithRequired();
      const finA = await skuLifecycle.finalize(a.id, { code: 'FIN-CLSH' }, ACTOR);
      expect(finA.ok).toBe(true);
      const finB = await skuLifecycle.finalize(b.id, { code: 'FIN-CLSH' }, ACTOR);
      expect(finB.ok).toBe(false);
      if (finB.ok) return;
      expect(finB.error.kind).toBe('DuplicatePrimaryKey');
    });

    it('atomic finalize — patch + state flip in one transaction', async () => {
      // Create a DRAFT missing required fields, then finalize with the
      // missing fields in the same call.
      const r = await skuLifecycle.create({ vendorSku: 'VEN-ATOMIC' }, ACTOR);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const finalized = await skuLifecycle.finalize(
        r.value.id,
        {
          code: 'ATOM-001',
          data: {
            familyCode: 'zapatos',
            categoryNumber: 591,
            brandId: 1,
            descriptionRics: 'Atómico',
          },
        },
        ACTOR,
      );
      expect(finalized.ok).toBe(true);
      if (!finalized.ok) return;
      expect(finalized.value.skuState).toBe('ACTIVE');
      expect(finalized.value.code).toBe('ATOM-001');
      expect(finalized.value.familyCode).toBe('zapatos');
      expect(finalized.value.categoryNumber).toBe(591);
      expect(finalized.value.brandId).toBe(1);
      expect(finalized.value.descriptionRics).toBe('Atómico');
    });

    it('atomic finalize rolls back the patch if validation fails', async () => {
      // Create a DRAFT, try to finalize with code that's too long AND a data
      // patch. Both the state flip and the patch should roll back — re-read
      // the row and confirm the patch didn't land.
      const r = await skuLifecycle.create({ vendorSku: 'VEN-ROLL' }, ACTOR);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const tooLong = await skuLifecycle.finalize(
        r.value.id,
        {
          code: 'THIS-CODE-IS-WAY-TOO-LONG-AND-FAILS-VALIDATION',
          data: {
            familyCode: 'zapatos',
            descriptionRics: 'Should not persist',
          },
        },
        ACTOR,
      );
      expect(tooLong.ok).toBe(false);

      const after = await skuLifecycle.getById(r.value.id);
      expect(after.ok).toBe(true);
      if (!after.ok) return;
      expect(after.value.skuState).toBe('DRAFT');
      // Code-level validation happens BEFORE the transaction opens, so the
      // patch isn't attempted at all. descriptionRics stays null.
      expect(after.value.descriptionRics).toBeNull();
      expect(after.value.familyCode).toBeNull();
    });
  });

  describe('update — code-rename guard', () => {
    async function finalizedSku(): Promise<SkuRow> {
      const r = await skuLifecycle.create(
        {
          familyCode: 'zapatos',
          categoryNumber: 591,
          brandId: 1,
          descriptionRics: 'Test',
        },
        ACTOR,
      );
      if (!r.ok) throw new Error('precondition failed');
      const fin = await skuLifecycle.finalize(r.value.id, { code: 'GUARD-001' }, ACTOR);
      if (!fin.ok) throw new Error('precondition failed');
      return fin.value;
    }

    it('blocks renaming code on ACTIVE sku', async () => {
      const active = await finalizedSku();
      const renamed = await skuLifecycle.update(
        active.id,
        { code: 'DIFFERENT-01' } as Parameters<typeof skuLifecycle.update>[1],
        ACTOR,
      );
      expect(renamed.ok).toBe(false);
      if (renamed.ok) return;
      expect(renamed.error.kind).toBe('ConstraintViolation');
      expect(renamed.error.message).toMatch(/no se puede renombrar/);
    });

    it('allows a no-op code pass-through on ACTIVE sku (same value, not a rename)', async () => {
      const active = await finalizedSku();
      const noop = await skuLifecycle.update(
        active.id,
        { code: active.code } as Parameters<typeof skuLifecycle.update>[1],
        ACTOR,
      );
      expect(noop.ok).toBe(true);
    });

    it('allows free code edits while DRAFT (no guard)', async () => {
      const r = await skuLifecycle.create({ vendorSku: 'VEN-DRAFT' }, ACTOR);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // While DRAFT the column is NULL anyway — the guard shouldn't fire on
      // code=undefined or code=null patches.
      const patched = await skuLifecycle.update(r.value.id, { vendorSku: 'VEN-DRAFT-NEW' }, ACTOR);
      expect(patched.ok).toBe(true);
    });
  });

  describe('update', () => {
    it('allows free edits in DRAFT', async () => {
      const r = await skuLifecycle.create({ vendorSku: 'OLD' }, ACTOR);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const patched = await skuLifecycle.update(r.value.id, { vendorSku: 'NEW', retailPrice: 99.99 }, ACTOR);
      expect(patched.ok).toBe(true);
      if (!patched.ok) return;
      expect(patched.value.vendorSku).toBe('NEW');
      expect(patched.value.retailPrice).toBe(99.99);
    });

    it('blocks edits on DISCONTINUED', async () => {
      const r = await skuLifecycle.create({ vendorSku: 'DISC' }, ACTOR);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const disc = await skuLifecycle.discontinue(r.value.id, ACTOR);
      expect(disc.ok).toBe(true);
      const patched = await skuLifecycle.update(r.value.id, { vendorSku: 'OOPS' }, ACTOR);
      expect(patched.ok).toBe(false);
      if (patched.ok) return;
      expect(patched.error.kind).toBe('ConstraintViolation');
      expect(patched.error.message).toMatch(/descontinuado/);
    });
  });

  describe('gatekeepers', () => {
    it('assertCanReceive: DRAFT ok, ACTIVE ok, DISCONTINUED blocks', () => {
      expect(assertCanReceive({ skuState: 'DRAFT' })).toBeNull();
      expect(assertCanReceive({ skuState: 'ACTIVE' })).toBeNull();
      const blocked = assertCanReceive({ skuState: 'DISCONTINUED' });
      expect(blocked?.kind).toBe('ConstraintViolation');
    });

    it('assertCanAllocate: ONLY ACTIVE passes', () => {
      expect(assertCanAllocate({ skuState: 'DRAFT' })?.kind).toBe('ConstraintViolation');
      expect(assertCanAllocate({ skuState: 'ACTIVE' })).toBeNull();
      expect(assertCanAllocate({ skuState: 'DISCONTINUED' })?.kind).toBe('ConstraintViolation');
    });

    it('assertCanPrintBarcode: blocks DRAFT with a Spanish message', () => {
      const r = assertCanPrintBarcode({ skuState: 'DRAFT', code: null });
      expect(r?.kind).toBe('ConstraintViolation');
      expect(r?.message).toMatch(/borrador/);
    });

    it('assertCanPrintBarcode: ACTIVE with code passes', () => {
      expect(assertCanPrintBarcode({ skuState: 'ACTIVE', code: 'FIN-9' })).toBeNull();
    });

    it('assertCanSell: only ACTIVE', () => {
      expect(assertCanSell({ skuState: 'DRAFT' })?.kind).toBe('ConstraintViolation');
      expect(assertCanSell({ skuState: 'ACTIVE' })).toBeNull();
      expect(assertCanSell({ skuState: 'DISCONTINUED' })?.kind).toBe('ConstraintViolation');
    });
  });

  describe('listDrafts', () => {
    it('returns only DRAFT rows, newest first', async () => {
      await skuLifecycle.create({ vendorSku: 'D1' }, ACTOR);
      await new Promise((res) => setTimeout(res, 10));
      await skuLifecycle.create({ vendorSku: 'D2' }, ACTOR);
      const result = await skuLifecycle.listDrafts();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const mine = result.value.filter((r) => r.createdBy === ACTOR);
      expect(mine).toHaveLength(2);
      expect(mine[0].vendorSku).toBe('D2'); // newest first
      expect(mine.every((r) => r.skuState === 'DRAFT')).toBe(true);
    });
  });
});
