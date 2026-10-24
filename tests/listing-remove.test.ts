// Farmer removing a listing or a harvest: removed listings are kept as
// REMOVED (orders still point at them) and can't be bought or revived;
// removal waits for in-progress orders; a harvest that never went live is
// deleted outright.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { removeOwnBatch } from "@/lib/batches";
import { setAvailableStock } from "@/lib/inventory";
import { removeOwnListing, updateOwnListing } from "@/lib/listings";
import { confirmOrder } from "@/lib/orders/lifecycle";
import { makeListing, makeUser, placeOrder } from "./helpers";

let farmer: { id: string; role: string };
let buyerId: string;

beforeAll(async () => {
  farmer = await makeUser("FARMER");
  buyerId = (await makeUser("CONSUMER")).id;
});

describe("removing a listing", () => {
  it("marks it REMOVED, and it can't be ordered, edited or restocked after", async () => {
    const listing = await makeListing(farmer.id, 5);
    expect(await removeOwnListing(farmer.id, listing.id)).toEqual({ id: listing.id, status: "REMOVED" });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("REMOVED");

    const order = await placeOrder(buyerId, farmer.id, [{ listingId: listing.id, qty: 1 }]);
    expect((await confirmOrder(order.id)).ok).toBe(false);
    await expect(updateOwnListing(farmer.id, listing.id, { status: "ACTIVE" })).rejects.toMatchObject({ status: 409 });
    await expect(setAvailableStock(farmer.id, listing.id, 0)).rejects.toMatchObject({ status: 409 });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("REMOVED");
  });

  it("is refused for another farmer's listing", async () => {
    const other = await makeUser("FARMER");
    const listing = await makeListing(other.id, 5);
    await expect(removeOwnListing(farmer.id, listing.id)).rejects.toMatchObject({ status: 403 });
  });

  it("waits for placed and confirmed orders, then keeps the order history", async () => {
    const listing = await makeListing(farmer.id, 5);
    const order = await placeOrder(buyerId, farmer.id, [{ listingId: listing.id, qty: 2 }]);
    await expect(removeOwnListing(farmer.id, listing.id)).rejects.toMatchObject({ status: 409 });
    expect((await confirmOrder(order.id)).ok).toBe(true);
    await expect(removeOwnListing(farmer.id, listing.id)).rejects.toMatchObject({ status: 409 });

    // Handed over: stock committed, nothing in progress any more.
    await db.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
    await db.listing.update({ where: { id: listing.id }, data: { reservedQty: 0 } });
    await removeOwnListing(farmer.id, listing.id);
    const items = await db.orderItem.findMany({ where: { orderId: order.id } });
    expect(items.map((i) => i.listingId)).toEqual([listing.id]);
  });

  it("withdraws open bulk offers made from it", async () => {
    const listing = await makeListing(farmer.id, 50);
    const demand = await db.demandRequest.create({
      data: { buyerId, crop: "tomato", qtyKg: 20, targetPrice: 25, deadline: new Date(Date.now() + 86_400_000), area: "Yelahanka" },
    });
    const offer = await db.offer.create({ data: { demandId: demand.id, farmerId: farmer.id, listingId: listing.id, qtyKg: 20, pricePerKg: 26, etaHours: 24 } });
    await removeOwnListing(farmer.id, listing.id);
    expect((await db.offer.findUniqueOrThrow({ where: { id: offer.id } })).status).toBe("WITHDRAWN");
  });
});

describe("removing a harvest", () => {
  it("deletes one that never went live, with its media", async () => {
    const batch = await db.batch.create({
      data: { farmerId: farmer.id, crop: "onion", category: "vegetables", quantityKg: 40, harvestDate: new Date(), status: "PENDING_REVIEW" },
    });
    await db.mediaAsset.create({ data: { batchId: batch.id, url: "/uploads/x.jpg", type: "IMAGE", sha256: "abc" } });
    expect(await removeOwnBatch(farmer, batch.id)).toMatchObject({ deleted: true });
    expect(await db.batch.findUnique({ where: { id: batch.id } })).toBeNull();
    expect(await db.mediaAsset.count({ where: { batchId: batch.id } })).toBe(0);
  });

  it("takes the listing down instead once it went live", async () => {
    const listing = await makeListing(farmer.id, 5);
    expect(await removeOwnBatch(farmer, listing.batchId)).toMatchObject({ deleted: false, listing: { status: "REMOVED" } });
    expect(await db.batch.findUnique({ where: { id: listing.batchId } })).not.toBeNull();
  });

  it("is refused for another farmer's harvest", async () => {
    const other = await makeUser("FARMER");
    const listing = await makeListing(other.id, 5);
    await expect(removeOwnBatch(farmer, listing.batchId)).rejects.toMatchObject({ status: 403 });
  });
});
