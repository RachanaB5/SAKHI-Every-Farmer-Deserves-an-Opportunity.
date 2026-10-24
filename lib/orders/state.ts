// Order state machine. Every status change goes through `moveOrder`, which
// uses a conditional update (WHERE status IN allowed-from) so two racing
// requests can't both apply a transition, and records an OrderEvent.
//
//   PLACED → CONFIRMED → PACKED → OUT_FOR_DELIVERY → DELIVERED
//                              ↘ READY_FOR_PICKUP  → COLLECTED
//   (before handover) → CANCELLED        (after handover) → DISPUTED
import type { OrderStatus, Prisma } from "@prisma/client";

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKED", "CANCELLED"],
  PACKED: ["OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DISPUTED", "PACKED"],
  READY_FOR_PICKUP: ["COLLECTED", "CANCELLED"],
  DELIVERED: ["DISPUTED"],
  COLLECTED: ["DISPUTED"],
  DISPUTED: ["DELIVERED", "COLLECTED", "CANCELLED"],
  CANCELLED: [],
};

/** Statuses that still hold reserved stock. */
export const HOLDS_STOCK: OrderStatus[] = ["CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"];
/** Terminal "goods handed over" statuses. */
export const HANDED_OVER: OrderStatus[] = ["DELIVERED", "COLLECTED"];
/** Statuses shown as "in progress" to buyers. */
export const IN_FLIGHT: OrderStatus[] = ["PLACED", "CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"];

/** True when `to` is reachable from `from` in one step. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** All statuses that may move to `to`. */
export function sourcesOf(to: OrderStatus): OrderStatus[] {
  return (Object.keys(TRANSITIONS) as OrderStatus[]).filter((s) => TRANSITIONS[s].includes(to));
}

/**
 * Atomically moves an order to `to` if it is currently in a valid source state.
 * @param tx - transaction client
 * @param from - optional narrower set of allowed source statuses
 * @returns true when this call performed the transition (false = already moved / invalid)
 */
export async function moveOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  to: OrderStatus,
  opts: { from?: OrderStatus[]; actorId?: string | null; note?: string; data?: Prisma.OrderUpdateManyMutationInput } = {},
): Promise<boolean> {
  const from = opts.from ?? sourcesOf(to);
  const res = await tx.order.updateMany({ where: { id: orderId, status: { in: from } }, data: { ...opts.data, status: to } });
  if (res.count !== 1) return false;
  await tx.orderEvent.create({ data: { orderId, status: to, note: opts.note, actorId: opts.actorId ?? null } });
  return true;
}
