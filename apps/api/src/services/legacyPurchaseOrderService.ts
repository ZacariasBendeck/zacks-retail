import { prisma } from '../db/prisma';

export interface LegacyPurchaseOrderLine {
  skuCode: string;
  rowLabel: string;
  segment: number;
  orderedQty: number;
  receivedQty: number;
  openQty: number;
  cost: number | null;
  vendorCode: string | null;
  casePackCode: string | null;
  caseMultiplier: number | null;
  dateLastChanged: string | null;
}

export interface LegacyPurchaseOrderDetail {
  poNumber: string;
  billStore: number | null;
  shipStore: number | null;
  vendorCode: string | null;
  confirmation: string | null;
  account: string | null;
  terms: string | null;
  shipVia: string | null;
  backOrder: boolean;
  splitShipment: boolean;
  orderDate: string | null;
  dueDate: string | null;
  cancelDate: string | null;
  paymentDate: string | null;
  lastReceivedAt: string | null;
  comment: string | null;
  orderType: string | null;
  department: string | null;
  buyer: string | null;
  current: boolean | null;
  legacyStatus: string | null;
  dateLastChanged: string | null;
  totals: {
    orderedQty: number;
    receivedQty: number;
    openQty: number;
    lineCount: number;
  };
  lines: LegacyPurchaseOrderLine[];
}

function sumQtys(values: number[] | null | undefined): number {
  return (values ?? []).reduce((sum, value) => sum + Number(value ?? 0), 0);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export async function getLegacyPurchaseOrderByNumber(
  poNumber: string,
): Promise<LegacyPurchaseOrderDetail | null> {
  const trimmed = poNumber.trim();
  if (!trimmed) return null;

  const po = await prisma.purchaseOrderLegacy.findUnique({
    where: { poNumber: trimmed },
    include: {
      lines: {
        orderBy: [
          { skuCode: 'asc' },
          { rowLabel: 'asc' },
          { segment: 'asc' },
        ],
      },
    },
  });

  if (!po) return null;

  const lines = po.lines.map((line) => {
    const orderedQty = sumQtys(line.orderedQtys);
    const receivedQty = sumQtys(line.receivedQtys);
    return {
      skuCode: line.skuCode,
      rowLabel: line.rowLabel,
      segment: Number(line.segment),
      orderedQty,
      receivedQty,
      openQty: orderedQty - receivedQty,
      cost: line.cost == null ? null : Number(line.cost),
      vendorCode: line.vendorCode,
      casePackCode: line.casePackCode,
      caseMultiplier: line.caseMultiplier,
      dateLastChanged: toIso(line.dateLastChanged),
    };
  });

  const orderedQty = lines.reduce((sum, line) => sum + line.orderedQty, 0);
  const receivedQty = lines.reduce((sum, line) => sum + line.receivedQty, 0);

  return {
    poNumber: po.poNumber,
    billStore: po.billStore,
    shipStore: po.shipStore,
    vendorCode: po.vendorCode,
    confirmation: po.confirmation,
    account: po.account,
    terms: po.terms,
    shipVia: po.shipVia,
    backOrder: po.backOrder,
    splitShipment: po.splitShipment,
    orderDate: toIso(po.orderDate),
    dueDate: toIso(po.dueDate),
    cancelDate: toIso(po.cancelDate),
    paymentDate: toIso(po.paymentDate),
    lastReceivedAt: toIso(po.lastReceivedAt),
    comment: po.comment,
    orderType: po.orderType,
    department: po.department,
    buyer: po.buyer,
    current: po.current,
    legacyStatus: po.legacyStatus,
    dateLastChanged: toIso(po.dateLastChanged),
    totals: {
      orderedQty,
      receivedQty,
      openQty: orderedQty - receivedQty,
      lineCount: lines.length,
    },
    lines,
  };
}
