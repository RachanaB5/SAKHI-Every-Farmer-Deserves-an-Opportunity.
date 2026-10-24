// Checkout: quote a multi-farmer cart (server-side prices, per-farmer
// orders, delivery fees, service-area check) and place it. Each farmer
// gets their own order so delivery, OTP handover and settlement are
// unambiguous; orders from one checkout share a groupId.
import "server-only";
import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { z } from "zod";
import { coordsFor } from "@/lib/areas";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { orderTotals, round2 } from "@/lib/fees";
import { visibleCategories } from "@/lib/listings";
import { commissionPct, serviceArea } from "@/lib/settings";
import { confirmOrder, createPlacedOrder } from "./lifecycle";

export const checkoutSchema = z.object({
  items: z
    .array(z.object({ listingId: z.string().min(1), qty: z.coerce.number().positive().max(10_000) }))
    .min(1, "Your cart is empty")
    .max(40),
  fulfilment: z.enum(["DELIVERY", "PICKUP"]),
  area: z.string().trim().max(60).optional(),
  addressLine: z.string().trim().max(200).optional(),
  slot: z.string().trim().max(40).optional(),
  paymentMethod: z.enum(["UPI", "CARD"]).default("UPI"),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export interface QuoteIssue {
  listingId: string;
  title: string;
  problem: "gone" | "not_in_area" | "short" | "below_min";
  message: string;
  available?: number;
}

/**
 * Prices a cart without placing anything. Delivery addresses outside the
 * pilot service areas come back with `blocked` (a friendly message) and no
 * groups — a quote is a question, not a failure.
 */
export async function quoteCheckout(buyer: User, input: CheckoutInput) {
  const area = input.fulfilment === "DELIVERY" ? await serviceArea(input.area ?? buyer.area) : null;
  if (input.fulfilment === "DELIVERY" && !area) {
    const place = input.area || buyer.area || "that address";
    // Name only the areas an admin currently has switched on.
    const open = (await db.serviceArea.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } })).map((a) => a.name);
    return {
      area: place,
      fulfilment: input.fulfilment,
      type: buyer.role === "BULK_BUYER" ? ("BULK" as const) : ("RETAIL" as const),
      groups: [],
      issues: [],
      subtotal: 0,
      deliveryFee: 0,
      total: 0,
      blocked: {
        code: "OUT_OF_AREA" as const,
        message: `We don't deliver to ${place} yet, FoodFlow currently delivers in ${open.join(", ")}. Choose one of those areas or switch to self-pickup.`,
      },
    };
  }
  const buyerArea = area?.name ?? buyer.area ?? "Hebbal";
  const [commission, cats] = await Promise.all([commissionPct(), visibleCategories(buyerArea)]);
  const listings = await db.listing.findMany({
    where: { id: { in: input.items.map((i) => i.listingId) } },
    include: { farmer: { select: { id: true, name: true, farmerProfile: { select: { village: true, farmName: true } } } } },
  });
  const byId = new Map(listings.map((l) => [l.id, l]));
  const issues: QuoteIssue[] = [];
  const groups = new Map<string, { farmerId: string; farmerName: string; village: string | null; items: { listingId: string; title: string; unit: string; qty: number; unitPrice: number; lineTotal: number; imageUrl: string | null }[] }>();

  for (const item of input.items) {
    const l = byId.get(item.listingId);
    if (!l || l.status !== "ACTIVE") {
      issues.push({ listingId: item.listingId, title: l?.title ?? "An item", problem: "gone", message: `${l?.title ?? "An item"} is no longer available` });
      continue;
    }
    if (!cats.includes(l.category)) {
      issues.push({ listingId: l.id, title: l.title, problem: "not_in_area", message: `${l.title} isn't sold in ${buyerArea} yet` });
      continue;
    }
    if (item.qty > l.availableQty) {
      issues.push({ listingId: l.id, title: l.title, problem: "short", message: `Only ${l.availableQty} ${l.unit} of ${l.title} left`, available: l.availableQty });
      continue;
    }
    if (item.qty < l.minOrderQty) {
      issues.push({ listingId: l.id, title: l.title, problem: "below_min", message: `Minimum ${l.minOrderQty} ${l.unit} for ${l.title}` });
      continue;
    }
    const g = groups.get(l.farmerId) ?? { farmerId: l.farmerId, farmerName: l.farmer.name, village: l.farmer.farmerProfile?.village ?? null, items: [] };
    g.items.push({ listingId: l.id, title: l.title, unit: l.unit, qty: item.qty, unitPrice: l.pricePerUnit, lineTotal: round2(item.qty * l.pricePerUnit), imageUrl: l.imageUrl });
    groups.set(l.farmerId, g);
  }

  const type: "RETAIL" | "BULK" = buyer.role === "BULK_BUYER" ? "BULK" : "RETAIL";
  const quoted = [...groups.values()].map((g) => ({
    ...g,
    ...orderTotals({
      items: g.items.map((i) => ({ qty: i.qty, unitPrice: i.unitPrice })),
      fulfilment: input.fulfilment,
      baseFee: area?.baseDeliveryFee ?? 0,
      commissionPct: commission,
      type,
    }),
  }));
  return {
    area: buyerArea,
    fulfilment: input.fulfilment,
    type,
    groups: quoted,
    issues,
    subtotal: round2(quoted.reduce((s, g) => s + g.subtotal, 0)),
    deliveryFee: round2(quoted.reduce((s, g) => s + g.deliveryFee, 0)),
    total: round2(quoted.reduce((s, g) => s + g.total, 0)),
    blocked: null,
  };
}

/**
 * Places the cart: creates one PLACED order per farmer (payment
 * AUTHORISED) and immediately confirms each — reserving stock atomically.
 * Farmers whose stock ran out in the meantime get a cancelled order with
 * the authorisation released; the rest go through.
 */
export async function placeCheckout(buyer: User, input: CheckoutInput, opts: { subscriptionId?: string; notes?: string } = {}) {
  const quote = await quoteCheckout(buyer, input);
  if (quote.blocked) throw new HttpError(422, quote.blocked.message, { code: quote.blocked.code });
  if (quote.issues.length) throw new HttpError(409, quote.issues[0].message, { issues: quote.issues });
  if (!quote.groups.length) throw new HttpError(400, "Your cart is empty");

  const groupId = randomUUID();
  const at = buyer.lat && buyer.lng ? { lat: buyer.lat, lng: buyer.lng } : coordsFor(quote.area);
  const placed: { id: string; code: string; farmerId: string; farmerName: string; total: number }[] = [];
  const failed: { farmerId: string; farmerName: string; reason: string }[] = [];

  for (const g of quote.groups) {
    const order = await createPlacedOrder({
      buyerId: buyer.id,
      farmerId: g.farmerId,
      type: quote.type,
      fulfilment: input.fulfilment,
      area: quote.area,
      addressLine: input.fulfilment === "DELIVERY" ? input.addressLine || buyer.address : null,
      slot: input.slot,
      lat: at?.lat,
      lng: at?.lng,
      groupId,
      subscriptionId: opts.subscriptionId ?? null,
      notes: opts.notes ?? null,
      paymentMethod: input.paymentMethod === "CARD" ? "Card (simulated)" : "UPI (simulated)",
      items: g.items.map(({ listingId, title, unit, qty, unitPrice }) => ({ listingId, title, unit, qty, unitPrice })),
      totals: { subtotal: g.subtotal, deliveryFee: g.deliveryFee, platformFee: g.platformFee, total: g.total },
    });
    const res = await confirmOrder(order.id, buyer.id);
    if (res.ok) placed.push({ id: order.id, code: order.code, farmerId: g.farmerId, farmerName: g.farmerName, total: g.total });
    else failed.push({ farmerId: g.farmerId, farmerName: g.farmerName, reason: res.reason });
  }
  return { groupId, placed, failed, total: round2(placed.reduce((s, p) => s + p.total, 0)) };
}
