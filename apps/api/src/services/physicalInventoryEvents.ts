/**
 * Physical Inventory module — Wave 4 event bus.
 *
 * In-process EventEmitter only. The platform module's notification + retention
 * + telemetry surfaces are not yet built; until they are, listeners attach
 * directly here. Event names mirror the spec's "Events emitted" section.
 *
 * Events are fire-and-forget — listeners must be sync-fast or push to their
 * own queue. We do not await listener completion in the service.
 */

import { EventEmitter } from 'node:events';

export type PhysicalInventoryEventName =
  | 'count-session.opened'
  | 'count-session.frozen'
  | 'count-session.review-ready'
  | 'count-session.exported'
  | 'count-session.cancelled'
  | 'count-session.extreme-variance';

export interface CountSessionOpenedEvent {
  sessionId: string;
  storeId: number;
  scope: unknown;
  openedBy: string;
  openedAt: string;
}

export interface CountSessionFrozenEvent {
  sessionId: string;
  storeId: number;
  frozenAt: string;
  cellCount: number;
}

export interface CountSessionReviewReadyEvent {
  sessionId: string;
  storeId: number;
  totalCellsWithEntry: number;
  materialCount: number;
  extremeCount: number;
}

export interface CountSessionExportedEvent {
  sessionId: string;
  storeId: number;
  exportedBy: string;
  exportedAt: string;
}

export interface CountSessionCancelledEvent {
  sessionId: string;
  storeId: number;
  cancelledBy: string;
  reason: string;
}

export interface ExtremeVarianceFlaggedEvent {
  sessionId: string;
  storeId: number;
  varianceId: string;
  skuId: string;
  columnLabel: string;
  rowLabel: string;
  delta: number;
  variancePct: number | null;
}

class TypedEmitter extends EventEmitter {
  emitOpened(payload: CountSessionOpenedEvent): void { this.emit('count-session.opened', payload); }
  emitFrozen(payload: CountSessionFrozenEvent): void { this.emit('count-session.frozen', payload); }
  emitReviewReady(payload: CountSessionReviewReadyEvent): void { this.emit('count-session.review-ready', payload); }
  emitExported(payload: CountSessionExportedEvent): void { this.emit('count-session.exported', payload); }
  emitCancelled(payload: CountSessionCancelledEvent): void { this.emit('count-session.cancelled', payload); }
  emitExtremeVariance(payload: ExtremeVarianceFlaggedEvent): void { this.emit('count-session.extreme-variance', payload); }
}

export const physicalInventoryEvents = new TypedEmitter();

// Increase listener cap; multiple consumers (notifications, audit, telemetry)
// may all attach in production once those surfaces exist.
physicalInventoryEvents.setMaxListeners(50);
