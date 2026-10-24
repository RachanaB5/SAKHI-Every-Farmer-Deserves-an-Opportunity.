// Test fixtures: minimal users, an approved batch and a listing in the
// throwaway SQLite test DB.
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

let n = 0;
/** Unique 10-digit phone for each fixture user. */
function phone() {
  n += 1;
  return `7${String(Date.now()).slice(-6)}${String(n).padStart(3, "0")}`.slice(0, 10);
}

export async function makeUser(role: "FARMER" | "CONSUMER" | "BULK_BUYER" | "ADMIN" | "DELIVERY", extra: Record<string, unknown> = {}) {
  return db.user.create({ data: { name: `${role} ${randomBytes(2).toString("hex")}`, phone: phone(), pinHash: "x", role, area: "Yelahanka", ...extra } });
}

/** Approved batch + ACTIVE listing with `qty` available at `price`. */
export async function makeListing(farmerId: string, qty: number, price = 30) {
  const batch = await db.batch.create({
    data: { farmerId, crop: "tomato", category: "vegetables", quantityKg: qty, harvestDate: new Date(), status: "APPROVED", proposedPrice: price },
  });
  return db.listing.create({
    data: {
      batchId: batch.id,
      farmerId,
      title: "Tomato",
      crop: "tomato",
      category: "vegetables",
      unit: "kg",
      pricePerUnit: price,
      totalQty: qty,
      availableQty: qty,
      area: "Yelahanka",
      harvestDate: new Date(),
    },
  });
}

/** A PLACED order for one or more listings (no stock touched yet). */
export async function placeOrder(buyerId: string, farmerId: string, lines: { listingId: string; qty: number; price?: number }[]) {
  const { createPlacedOrder } = await import("@/lib/orders/lifecycle");
  const subtotal = lines.reduce((s, l) => s + l.qty * (l.price ?? 30), 0);
  return createPlacedOrder({
    buyerId,
    farmerId,
    type: "RETAIL",
    fulfilment: "DELIVERY",
    area: "Yelahanka",
    items: lines.map((l) => ({ listingId: l.listingId, title: "Tomato", unit: "kg", qty: l.qty, unitPrice: l.price ?? 30 })),
    totals: { subtotal, deliveryFee: 25, platformFee: subtotal * 0.05, total: subtotal + 25 },
  });
}
