import { Prisma } from '../prismaClient';

export interface TransferCommitCell {
  columnLabel: string;
  rowLabel: string;
  suggestedQuantity: number;
}

export interface TransferCommitLine {
  skuId: string;
  skuCode: string;
  unitCostSnapshot: number;
  fromStoreId: number;
  toStoreId: number;
  cells: TransferCommitCell[];
}

function buildTransferPairKey(fromStoreId: number, toStoreId: number): string {
  return `${fromStoreId}:${toStoreId}`;
}

export function buildTransferNumber(prefix: 'AT' | 'BT'): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const entropy = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${entropy}`;
}

export async function materializeTransfersFromPreview(
  tx: Prisma.TransactionClient,
  params: {
    origin: 'AUTO' | 'BALANCING';
    originRunId: string;
    requestedBy: string;
    committedAt: Date;
    inTransitPos: boolean;
    lines: TransferCommitLine[];
    makeSourceConflictError: (line: TransferCommitLine) => Error;
  },
): Promise<string[]> {
  const transferIds: string[] = [];
  const linesByPair = new Map<string, TransferCommitLine[]>();
  for (const line of params.lines) {
    const key = buildTransferPairKey(line.fromStoreId, line.toStoreId);
    const group = linesByPair.get(key) ?? [];
    group.push(line);
    linesByPair.set(key, group);
  }

  for (const group of linesByPair.values()) {
    const firstLine = group[0];
    if (!firstLine) continue;
    const transfer = await tx.transfer.create({
      data: {
        transferNumber: buildTransferNumber(params.origin === 'AUTO' ? 'AT' : 'BT'),
        fromStoreId: firstLine.fromStoreId,
        toStoreId: firstLine.toStoreId,
        status: params.inTransitPos ? 'IN_TRANSIT' : 'RECEIVED',
        origin: params.origin,
        originRunId: params.originRunId,
        reason: params.origin === 'AUTO' ? 'Automatic transfer run' : 'Balancing transfer run',
        createdBy: params.requestedBy,
        shippedAt: params.committedAt,
        receivedAt: params.inTransitPos ? null : params.committedAt,
      },
      select: { id: true },
    });
    transferIds.push(transfer.id);

    for (const previewLine of group) {
      for (const cell of previewLine.cells) {
        const outboundMovement = await tx.stockMovement.create({
          data: {
            storeId: previewLine.fromStoreId,
            skuId: previewLine.skuId,
            columnLabel: cell.columnLabel,
            rowLabel: cell.rowLabel,
            movementType: 'TRANSFER_OUT',
            quantityDelta: -cell.suggestedQuantity,
            unitCostSnapshot: new Prisma.Decimal(previewLine.unitCostSnapshot),
            retailPriceSnapshot: null,
            sourceDocumentType: 'TRANSFER',
            sourceDocumentId: transfer.id,
            reasonCode: null,
            comment: `${params.origin === 'AUTO' ? 'Automatic' : 'Balancing'} transfer ${previewLine.skuCode}`,
            performedBy: params.requestedBy,
            movementAt: params.committedAt,
          },
          select: { id: true },
        });

        const updated = await tx.stockLevel.updateMany({
          where: {
            storeId: previewLine.fromStoreId,
            skuId: previewLine.skuId,
            columnLabel: cell.columnLabel,
            rowLabel: cell.rowLabel,
            onHand: { gte: cell.suggestedQuantity },
          },
          data: {
            onHand: { decrement: cell.suggestedQuantity },
            lastMovementAt: params.committedAt,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw params.makeSourceConflictError(previewLine);
        }

        let inboundMovementId: string | null = null;
        if (!params.inTransitPos) {
          const inboundMovement = await tx.stockMovement.create({
            data: {
              storeId: previewLine.toStoreId,
              skuId: previewLine.skuId,
              columnLabel: cell.columnLabel,
              rowLabel: cell.rowLabel,
              movementType: 'TRANSFER_IN',
              quantityDelta: cell.suggestedQuantity,
              unitCostSnapshot: new Prisma.Decimal(previewLine.unitCostSnapshot),
              retailPriceSnapshot: null,
              sourceDocumentType: 'TRANSFER',
              sourceDocumentId: transfer.id,
              reasonCode: null,
              comment: `${params.origin === 'AUTO' ? 'Automatic' : 'Balancing'} transfer ${previewLine.skuCode}`,
              performedBy: params.requestedBy,
              movementAt: params.committedAt,
            },
            select: { id: true },
          });
          inboundMovementId = inboundMovement.id;

          await tx.stockLevel.upsert({
            where: {
              storeId_skuId_columnLabel_rowLabel: {
                storeId: previewLine.toStoreId,
                skuId: previewLine.skuId,
                columnLabel: cell.columnLabel,
                rowLabel: cell.rowLabel,
              },
            },
            create: {
              storeId: previewLine.toStoreId,
              skuId: previewLine.skuId,
              columnLabel: cell.columnLabel,
              rowLabel: cell.rowLabel,
              onHand: cell.suggestedQuantity,
              reserved: 0,
              lastReceivedAt: params.committedAt,
              lastMovementAt: params.committedAt,
              version: 1,
            },
            update: {
              onHand: { increment: cell.suggestedQuantity },
              lastReceivedAt: params.committedAt,
              lastMovementAt: params.committedAt,
              version: { increment: 1 },
            },
          });
        }

        await tx.transferLine.create({
          data: {
            transferId: transfer.id,
            skuId: previewLine.skuId,
            columnLabel: cell.columnLabel,
            rowLabel: cell.rowLabel,
            quantity: cell.suggestedQuantity,
            unitCostSnapshot: new Prisma.Decimal(previewLine.unitCostSnapshot),
            outboundMovementId: outboundMovement.id,
            inboundMovementId,
          },
        });
      }
    }
  }

  return transferIds;
}
