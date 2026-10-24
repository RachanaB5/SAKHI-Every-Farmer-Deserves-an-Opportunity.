// Money math for orders and farmer settlements. Pure functions, unit-tested
// in tests/fees.test.ts. All amounts are rupees rounded to 2 decimals.
//
// Who pays what:
//  • Buyer pays  total = subtotal + deliveryFee (deliveryFee is 0 for pickup,
//    and waived for retail baskets above the free-delivery threshold).
//  • Farmer receives net = subtotal − platformFee − deliveryCost, where
//    platformFee = commission% × subtotal and deliveryCost is the part of
//    the actual courier cost that the buyer's delivery fee did not cover,
//    capped at FARMER_DELIVERY_SHARE_CAP of the order value (FoodFlow absorbs
//    the rest) so a small order can never leave a farmer out of pocket.

export const DEFAULT_COMMISSION_PCT = 5;
export const FREE_DELIVERY_THRESHOLD = 499;
/**
 * Courier pricing per order. Riders run pooled "milk runs" (several farms →
 * several homes per trip), so the per-order share is a small flat charge
 * plus a per-km rate, capped.
 */
export const COURIER_BASE = 15;
export const COURIER_PER_KM = 1.5;
export const COURIER_CAP = 60;
/** Max share of an order's value a farmer can be charged for delivery. */
export const FARMER_DELIVERY_SHARE_CAP = 0.15;

/** Rounds to paise, avoiding binary float drift (e.g. 1.005 → 1.01). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface LineItem {
  qty: number;
  unitPrice: number;
}

/** Sum of qty × unit price across items. */
export function subtotalOf(items: LineItem[]): number {
  return round2(items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0));
}

/**
 * Delivery fee charged to the buyer.
 * @param fulfilment - DELIVERY or PICKUP
 * @param subtotal - basket subtotal for this farmer's order
 * @param baseFee - service-area base fee
 * @param type - RETAIL orders above the threshold ship free; BULK always pays the base fee
 */
export function buyerDeliveryFee(
  fulfilment: "DELIVERY" | "PICKUP",
  subtotal: number,
  baseFee: number,
  type: "RETAIL" | "BULK" = "RETAIL",
): number {
  if (fulfilment === "PICKUP") return 0;
  if (type === "RETAIL" && subtotal >= FREE_DELIVERY_THRESHOLD) return 0;
  return round2(baseFee);
}

/** Actual courier cost for an order travelling `distanceKm` (capped). */
export function courierCost(distanceKm: number): number {
  return round2(Math.min(COURIER_CAP, COURIER_BASE + COURIER_PER_KM * Math.max(0, distanceKm)));
}

/** Commission withheld from the farmer's gross. */
export function platformFeeOf(subtotal: number, commissionPct: number): number {
  return round2((subtotal * commissionPct) / 100);
}

export interface OrderTotals {
  subtotal: number;
  deliveryFee: number;
  platformFee: number;
  total: number;
}

/**
 * Computes everything stored on an Order row.
 * Note the platform fee is NOT added to the buyer's total — it is deducted
 * from the farmer's settlement.
 */
export function orderTotals(args: {
  items: LineItem[];
  fulfilment: "DELIVERY" | "PICKUP";
  baseFee: number;
  commissionPct: number;
  type?: "RETAIL" | "BULK";
}): OrderTotals {
  const subtotal = subtotalOf(args.items);
  const deliveryFee = buyerDeliveryFee(args.fulfilment, subtotal, args.baseFee, args.type);
  const platformFee = platformFeeOf(subtotal, args.commissionPct);
  return { subtotal, deliveryFee, platformFee, total: round2(subtotal + deliveryFee) };
}

export interface SettlementAmounts {
  gross: number;
  platformFee: number;
  deliveryCost: number;
  net: number;
}

/**
 * Farmer payout for a delivered order.
 * @param subtotal - goods value (farmer's gross)
 * @param platformFee - commission recorded on the order
 * @param buyerDeliveryFee - what the buyer paid towards delivery
 * @param actualCourierCost - real cost of the run (0 for pickup)
 */
export function settlementFor(args: {
  subtotal: number;
  platformFee: number;
  buyerDeliveryFee: number;
  actualCourierCost: number;
}): SettlementAmounts {
  // The farmer only absorbs the shortfall between courier cost and the fee the
  // buyer paid — and never more than 15% of the order value.
  const shortfall = Math.max(0, args.actualCourierCost - args.buyerDeliveryFee);
  const deliveryCost = round2(Math.min(shortfall, args.subtotal * FARMER_DELIVERY_SHARE_CAP));
  const net = round2(args.subtotal - args.platformFee - deliveryCost);
  return { gross: round2(args.subtotal), platformFee: round2(args.platformFee), deliveryCost, net };
}
