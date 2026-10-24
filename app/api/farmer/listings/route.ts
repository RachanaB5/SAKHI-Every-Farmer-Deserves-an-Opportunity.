// GET /api/farmer/listings — the signed-in farmer's listings in every state
// except the ones they removed.
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { soldQty } from "@/lib/inventory";

/** Live, paused and sold-out listings with stock split and live quality. */
export const GET = handler({ roles: ["FARMER"] }, async ({ user }) => {
  const rows = await db.listing.findMany({
    where: { farmerId: user.id, status: { not: "REMOVED" } },
    include: { batch: { select: { aiQualityScore: true } }, _count: { select: { orderItems: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  return rows.map((l) => ({
    id: l.id,
    title: l.title,
    crop: l.crop,
    unit: l.unit,
    price: l.pricePerUnit,
    suggestedPrice: l.suggestedPrice,
    status: l.status,
    total: l.totalQty,
    available: l.availableQty,
    reserved: l.reservedQty,
    sold: soldQty(l),
    imageUrl: l.imageUrl,
    harvestDate: l.harvestDate.toISOString(),
    createdAt: l.createdAt.toISOString(),
    orders: l._count.orderItems,
    /** Live score (photos + customer reviews) and the photo score it started from. */
    quality: l.qualityScore !== null ? Math.round(l.qualityScore) : l.batch.aiQualityScore,
    photoScore: l.batch.aiQualityScore,
    grade: l.grade,
    reviews: l.reviewCount,
    complaints: l.complaintCount,
    gradeUpdatedAt: l.gradeUpdatedAt?.toISOString() ?? null,
  }));
});
