// End to end on the test DB: buyer reviews move a listing's live grade, one
// buyer alone can't drop it, and the farmer is notified of complaints and of
// the grade change.
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyReview } from "@/lib/quality/listing";
import type { PhotoVerdict } from "@/lib/quality/score";
import { makeListing, makeUser, placeOrder } from "./helpers";

async function gradeA() {
  const farmer = await makeUser("FARMER");
  const listing = await makeListing(farmer.id, 50);
  await db.batch.update({ where: { id: listing.batchId }, data: { aiQualityScore: 90, aiConfidence: 0.9, grade: "A" } });
  await db.listing.update({ where: { id: listing.id }, data: { grade: "A", qualityScore: 90, title: "Tomato · Grade A" } });
  return { farmer, listing };
}

/** A delivered order of the listing, reviewed by `buyerId`, applied like the feedback route does. */
async function review(buyerId: string, farmerId: string, listingId: string, rating: number, issue: string, photoVerdict: PhotoVerdict | null = null) {
  const order = await placeOrder(buyerId, farmerId, [{ listingId, qty: 1 }]);
  await db.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
  await db.feedback.create({ data: { orderId: order.id, buyerId, rating, issue, photoVerdict } });
  await applyReview({ listingIds: [listingId], issue, rating, withPhoto: photoVerdict !== null, photoVerdict, orderCode: order.code });
}

describe("review-driven grades", () => {
  it("drops the grade only once two buyers complain, and tells the farmer", async () => {
    const { farmer, listing } = await gradeA();
    const [b1, b2] = [await makeUser("CONSUMER"), await makeUser("CONSUMER")];

    await review(b1.id, farmer.id, listing.id, 1, "NOT_FRESH", "supports");
    let l = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(l).toMatchObject({ grade: "A", complaintCount: 1, reviewCount: 1 });
    expect(l.qualityScore).toBeLessThan(90);
    let notes = await db.notification.findMany({ where: { userId: farmer.id }, orderBy: { createdAt: "asc" } });
    expect(notes.map((n) => n.type)).toEqual(["QUALITY_COMPLAINT"]);
    expect(notes[0].data).toMatchObject({ crop: "tomato", issue: "NOT_FRESH", photoBacked: true });

    await review(b2.id, farmer.id, listing.id, 2, "DAMAGED", "supports");
    l = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(l).toMatchObject({ grade: "B", complaintCount: 2, title: "Tomato" });
    expect(l.gradeUpdatedAt).not.toBeNull();
    notes = await db.notification.findMany({ where: { userId: farmer.id }, orderBy: { createdAt: "asc" } });
    expect(notes.map((n) => n.type)).toEqual(["QUALITY_COMPLAINT", "QUALITY_COMPLAINT", "GRADE_DOWN"]);
    expect(notes[2].data).toMatchObject({ from: "A", to: "B" });
  });

  it("ignores a late delivery for produce quality", async () => {
    const { farmer, listing } = await gradeA();
    const buyer = await makeUser("CONSUMER");
    await review(buyer.id, farmer.id, listing.id, 1, "LATE");
    const l = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(l).toMatchObject({ grade: "A", qualityScore: 90, reviewCount: 0 });
    expect(await db.notification.count({ where: { userId: farmer.id } })).toBe(0);
  });
});
