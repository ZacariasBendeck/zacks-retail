const mockPrisma = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
  $transaction: jest.fn(),
};

jest.mock('../src/db/prisma', () => ({
  prisma: mockPrisma,
}));

import { combinePurchaseOrders } from '../src/services/purchaseOrderService';

type MockPoRow = {
  id: string;
  po_number: string;
  vendor_code: string;
  status: string;
  [key: string]: unknown;
};

function makePoRow(overrides: Partial<MockPoRow>): MockPoRow {
  const now = '2026-04-01T00:00:00.000Z';
  return {
    id: 'po-id',
    po_number: 'PO-000001',
    bill_to_store_id: null,
    ship_to_store_id: null,
    vendor_code: 'SUP1',
    vendor_name: 'Supplier 1',
    order_type: 'RO',
    classification: 'AT_ONCE',
    origin: 'NATIVE',
    origin_source_po_id: null,
    confirmation_number: null,
    account_number: null,
    terms: null,
    ship_via: null,
    backorder_allowed: false,
    split_shipment: false,
    program_code: null,
    store_labels_on_receive: false,
    buyer: null,
    order_date: now,
    ship_date: null,
    cancel_date: null,
    payment_date: null,
    status: 'DRAFT',
    comments: null,
    cancellation_reason: null,
    created_by: 'system',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function configurePrismaMock(rows: MockPoRow[], maxSequenceByPo: Record<string, number> = {}) {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const tx = {
    $queryRawUnsafe: jest.fn(async (query: string, ...params: unknown[]) => {
      const sql = String(query);
      if (sql.includes('FOR UPDATE')) {
        return params.map((id) => rowsById.get(String(id))).filter(Boolean);
      }
      if (sql.includes('MAX(line_sequence)')) {
        return [{ max_sequence: maxSequenceByPo[String(params[0])] ?? 0 }];
      }
      return [];
    }),
    $executeRawUnsafe: jest.fn(async () => 1),
  };

  mockPrisma.$queryRawUnsafe.mockImplementation(async (query: string, ...params: unknown[]) => {
    const sql = String(query);
    if (sql.includes('FROM app.purchase_order po')) {
      const row = rowsById.get(String(params[0]));
      return row ? [row] : [];
    }
    if (sql.includes('FROM app.purchase_order_line pol')) {
      return [];
    }
    return [];
  });
  mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
  mockPrisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
    callback(tx),
  );

  return tx;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('combinePurchaseOrders', () => {
  it('moves multiple same-vendor draft sources into the destination and cancels source headers', async () => {
    const destination = makePoRow({ id: 'dest-po', po_number: 'PO-DEST' });
    const sourceOne = makePoRow({ id: 'source-po-1', po_number: 'PO-SRC-1' });
    const sourceTwo = makePoRow({ id: 'source-po-2', po_number: 'PO-SRC-2' });
    const tx = configurePrismaMock([destination, sourceOne, sourceTwo], {
      'dest-po': 2,
      'source-po-1': 1,
      'source-po-2': 3,
    });

    const result = await combinePurchaseOrders(['source-po-1', 'source-po-2'], 'dest-po', {
      changedBy: 'buyer',
    });

    expect(result).toMatchObject({ id: 'dest-po', poNumber: 'PO-DEST' });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    const moveCalls = tx.$executeRawUnsafe.mock.calls.filter(([query]) =>
      String(query).includes('UPDATE app.purchase_order_line'),
    );
    expect(moveCalls).toHaveLength(2);
    expect(moveCalls[0].slice(1)).toEqual(['dest-po', 2, 'source-po-1']);
    expect(moveCalls[1].slice(1)).toEqual(['dest-po', 3, 'source-po-2']);

    const sourceCancelCalls = tx.$executeRawUnsafe.mock.calls.filter(([query]) =>
      String(query).includes("SET status = 'CANCELLED'"),
    );
    expect(sourceCancelCalls).toHaveLength(2);
    expect(sourceCancelCalls[0].slice(1)).toEqual(['source-po-1', 'Merged into PO PO-DEST']);
    expect(sourceCancelCalls[1].slice(1)).toEqual(['source-po-2', 'Merged into PO PO-DEST']);

    const historyCalls = tx.$executeRawUnsafe.mock.calls.filter(([query]) =>
      String(query).includes('INSERT INTO app.po_status_history'),
    );
    expect(historyCalls).toHaveLength(3);
    expect(historyCalls.map((call) => call[5])).toEqual(['buyer', 'buyer', 'buyer']);
    expect(historyCalls[2][6]).toBe('Merged source POs: PO-SRC-1, PO-SRC-2');
  });

  it('keeps the single-source combine payload compatible', async () => {
    const destination = makePoRow({ id: 'dest-po', po_number: 'PO-DEST' });
    const source = makePoRow({ id: 'source-po', po_number: 'PO-SRC' });
    configurePrismaMock([destination, source]);

    const result = await combinePurchaseOrders('source-po', 'dest-po');

    expect(result).toMatchObject({ id: 'dest-po' });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects different vendors before opening the merge transaction', async () => {
    const destination = makePoRow({ id: 'dest-po', vendor_code: 'SUP1' });
    const source = makePoRow({ id: 'source-po', vendor_code: 'SUP2' });
    configurePrismaMock([destination, source]);

    const result = await combinePurchaseOrders(['source-po'], 'dest-po');

    expect(result).toEqual({ error: 'PO_VENDOR_MISMATCH' });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects non-draft destination or source POs', async () => {
    const destination = makePoRow({ id: 'dest-po', status: 'SUBMITTED' });
    const source = makePoRow({ id: 'source-po' });
    configurePrismaMock([destination, source]);

    await expect(combinePurchaseOrders(['source-po'], 'dest-po')).resolves.toEqual({
      error: 'DESTINATION_PO_NOT_DRAFT',
    });

    const draftDestination = makePoRow({ id: 'draft-dest' });
    const submittedSource = makePoRow({ id: 'submitted-source', status: 'SUBMITTED' });
    configurePrismaMock([draftDestination, submittedSource]);

    await expect(combinePurchaseOrders(['submitted-source'], 'draft-dest')).resolves.toEqual({
      error: 'SOURCE_PO_NOT_DRAFT',
    });
  });

  it('rejects empty sources and source/destination overlap', async () => {
    await expect(combinePurchaseOrders([], 'dest-po')).resolves.toEqual({
      error: 'EMPTY_SOURCE_PO_IDS',
    });
    await expect(combinePurchaseOrders(['dest-po'], 'dest-po')).resolves.toEqual({
      error: 'SOURCE_EQUALS_DESTINATION',
    });
    await expect(combinePurchaseOrders(['source-po', 'dest-po'], 'dest-po')).resolves.toEqual({
      error: 'SOURCE_DESTINATION_OVERLAP',
    });
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
