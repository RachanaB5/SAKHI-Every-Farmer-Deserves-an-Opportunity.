// In-process event bus behind the /api/events SSE stream. Route handlers
// publish changes (orders, inventory, batches, deliveries); connected
// clients receive the ones addressed to them. Single-instance by design —
// clients also poll every few seconds, so multi-instance deploys still update.
import { EventEmitter } from "node:events";

export type LiveEventType =
  | "order.updated"
  | "inventory.updated"
  | "batch.updated"
  | "delivery.updated"
  | "demand.updated"
  | "offer.updated"
  | "settlement.updated";

export interface LiveEvent {
  type: LiveEventType;
  /** Entity id (order id, listing id…). */
  id: string;
  /** User ids that should receive it; empty = everyone of `roles`. */
  userIds?: string[];
  /** Roles that should receive it (e.g. ADMIN for the review queue). */
  roles?: string[];
  data?: Record<string, unknown>;
  at: number;
}

const globalForBus = globalThis as unknown as { foodflowBus?: EventEmitter };
/** Survives dev hot reloads so open SSE connections keep receiving events. */
export const bus = globalForBus.foodflowBus ?? new EventEmitter();
bus.setMaxListeners(500);
globalForBus.foodflowBus = bus;

/**
 * Broadcasts a change to subscribed SSE clients.
 * @param event - what changed and who should hear about it
 */
export function publish(event: Omit<LiveEvent, "at">): void {
  bus.emit("event", { ...event, at: Date.now() } satisfies LiveEvent);
}
