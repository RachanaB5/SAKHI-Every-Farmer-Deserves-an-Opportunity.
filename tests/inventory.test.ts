// Shared-inventory guarantees: no double-selling under concurrency, whole
// orders reserve atomically, confirmation is idempotent, and cancellation
// releases stock.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelOrder, confirmOrder } from "@/lib/orders/lifecycle";
import { makeListing, makeUser, placeOrder } from "./helpers";

let farmerId: string;
let buyerA: string;
let buyerB: string;

beforeAll(async () => {
  farmerId = (await makeUser("FARMER")).id;
  buyerA = (await makeUser("CONSUMER")).id;
  buyerB = (await makeUser("CONSUMER")).id;
});

describe("inventory reservation", () => {
  it("lets exactly one of two concurrent orders take the last stock", async () => {
    const listing = await makeListing(farmerId, 1);
    const [a, b] = await Promise.all([
      placeOrder(buyerA, farmerId, [{ listingId: listing.id, qty: 1 }]),
      placeOrder(buyerB, farmerId, [{ listingId: listing.id, qty: 1 }]),
    ]);
    const results = await Promise.all([confirmOrder(a.id), confirmOrder(b.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);

    const after = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(after.availableQty).toBe(0);
    expect(after.reservedQty).toBe(1);
    expect(after.status).toBe("SOLD_OUT");

    const orders = await db.order.findMany({ where: { id: { in: [a.id, b.id] } }, include: { payment: true } });
    const loser = orders.find((o) => o.status === "CANCELLED")!;
    const winner = orders.find((o) => o.status === "CONFIRMED")!;
    expect(winner.payment?.status).toBe("CAPTURED");
    // The losing buyer's authorisation is released — no money taken.
    expect(loser.payment?.status).toBe("FAILED");
  });

  it("never oversells under a burst of 8 concurrent buyers", async () => {
    const listing = await makeListing(farmerId, 5);
    const buyers = await Promise.all(Array.from({ length: 8 }, () => makeUser("CONSUMER")));
    const orders = await Promise.all(buyers.map((u) => placeOrder(u.id, farmerId, [{ listingId: listing.id, qty: 1 }])));
    const results = await Promise.all(orders.map((o) => confirmOrder(o.id)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    const after = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(after.availableQty).toBe(0);
    expect(after.reservedQty).toBe(5);
  });

  it("reserves all items of an order or none of them", async () => {
    const plenty = await makeListing(farmerId, 10);
    const scarce = await makeListing(farmerId, 1);
    const order = await placeOrder(buyerA, farmerId, [
      { listingId: plenty.id, qty: 3 },
      { listingId: scarce.id, qty: 2 },
    ]);
    const res = await confirmOrder(order.id);
    expect(res.ok).toBe(false);
    // The first item's decrement was rolled back with the transaction.
    expect((await db.listing.findUniqueOrThrow({ where: { id: plenty.id } })).availableQty).toBe(10);
    expect((await db.listing.findUniqueOrThrow({ where: { id: scarce.id } })).availableQty).toBe(1);
  });

  it("treats a second confirmation as a no-op", async () => {
    const listing = await makeListing(farmerId, 4);
    const order = await placeOrder(buyerA, farmerId, [{ listingId: listing.id, qty: 2 }]);
    expect((await confirmOrder(order.id)).ok).toBe(true);
    expect((await confirmOrder(order.id)).ok).toBe(true);
    const after = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(after.availableQty).toBe(2);
    expect(after.reservedQty).toBe(2);
  });

  it("releases stock and refunds when a confirmed order is cancelled", async () => {
    const listing = await makeListing(farmerId, 2);
    const order = await placeOrder(buyerA, farmerId, [{ listingId: listing.id, qty: 2 }]);
    await confirmOrder(order.id);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("SOLD_OUT");
    await cancelOrder(order.id, buyerA, "Changed my mind");
    const after = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(after).toMatchObject({ availableQty: 2, reservedQty: 0, status: "ACTIVE" });
    const payment = await db.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe("REFUNDED");
  });

  it("never lets carts or browsing change stock", async () => {
    // Placing (not confirming) an order is the closest the API gets to a cart — stock must not move.
    const listing = await makeListing(farmerId, 3);
    await placeOrder(buyerA, farmerId, [{ listingId: listing.id, qty: 3 }]);
    const after = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(after.availableQty).toBe(3);
    expect(after.reservedQty).toBe(0);
  });
});
