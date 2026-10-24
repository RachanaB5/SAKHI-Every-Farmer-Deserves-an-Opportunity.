// Admin harvest review: queue queries and the approve / reject / resubmit
// decision. Approval is the ONLY path that creates a Listing — listings
// never go live without an admin decision (AI flags assist, admin decides).
import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { CROPS, isCropSlug } from "@/lib/crops";
import { publish } from "@/lib/events";
import { computePriceAdvice } from "@/lib/pricing";

export type Decision = "APPROVE" | "REJECT" | "RESUBMIT";

/** Farmer track record shown next to each batch. */
export async function farmerHistory(farmerId: string) {
  const batchIds = (await db.batch.findMany({ where: { farmerId }, select: { id: true } })).map((b) => b.id);
  const [approved, rejected, resubmits, complaints, delivered] = await Promise.all([
    db.batch.count({ where: { farmerId, status: "APPROVED" } }),
    db.batch.count({ where: { farmerId, status: "REJECTED" } }),
    db.auditLog.count({ where: { action: "BATCH_RESUBMIT_REQUESTED", entity: "Batch", entityId: { in: batchIds } } }),
    db.feedback.count({ where: { order: { farmerId }, rating: { lte: 2 } } }),
    db.order.count({ where: { farmerId, status: { in: ["DELIVERED", "COLLECTED"] } } }),
  ]);
  return { approved, rejected, resubmits, complaints, delivered };
}

/**
 * Applies an admin decision to a PENDING_REVIEW batch.
 * Approve: in one transaction, mark the batch APPROVED and create its
 * Listing (batchId is unique, so a double-click can't create two).
 * @param price - optional price override at approval
 * @param grade - optional grade override at approval
 */
export async function decideBatch(args: {
  batchId: string;
  adminId: string;
  decision: Decision;
  note?: string;
  price?: number;
  grade?: "A" | "B" | "C";
}) {
  const batch = await db.batch.findUnique({
    where: { id: args.batchId },
    include: { media: { orderBy: { createdAt: "asc" } }, farmer: { select: { id: true, area: true, name: true } } },
  });
  if (!batch) throw new HttpError(404, "Batch not found");
  if (batch.status !== "PENDING_REVIEW") {
    throw new HttpError(409, `This batch was already ${batch.status === "APPROVED" ? "approved" : "reviewed"}`);
  }
  if (args.decision !== "APPROVE" && !args.note?.trim()) {
    throw new HttpError(400, "Add a note so the farmer knows what to fix");
  }

  const now = new Date();
  if (args.decision === "APPROVE") {
    const price = args.price ?? batch.proposedPrice;
    if (!price) throw new HttpError(400, "Set a price before approving");
    const area = batch.farmer.area ?? "Hebbal";
    const advice = isCropSlug(batch.crop) ? await computePriceAdvice(batch.crop, area, args.grade ?? batch.grade ?? "ANY") : null;
    // Prefer a clean (non-duplicate) farmer photo as the listing image.
    const cover = batch.media.find((m) => m.type === "IMAGE" && !m.isDuplicate && !m.isFrame) ?? batch.media.find((m) => m.type === "IMAGE" && !m.isDuplicate);
    const name = isCropSlug(batch.crop) ? CROPS[batch.crop].names.en : batch.crop;
    const grade = args.grade ?? batch.grade ?? null;

    const listing = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      // Conditional update guards against two admins approving concurrently.
      const moved = await tx.batch.updateMany({
        where: { id: batch.id, status: "PENDING_REVIEW" },
        data: { status: "APPROVED", reviewedById: args.adminId, reviewedAt: now, adminNote: args.note?.trim() || null, grade, proposedPrice: price },
      });
      if (moved.count !== 1) throw new HttpError(409, "Someone else just reviewed this batch");
      const created = await tx.listing.create({
        data: {
          batchId: batch.id,
          farmerId: batch.farmerId,
          title: `${name}${grade === "A" ? " · Grade A" : ""}`,
          crop: batch.crop,
          category: batch.category,
          unit: batch.unit,
          pricePerUnit: price,
          suggestedPrice: advice?.suggested ?? null,
          totalQty: batch.quantityKg,
          availableQty: batch.quantityKg,
          area,
          grade,
          harvestDate: batch.harvestDate,
          imageUrl: cover?.url ?? (isCropSlug(batch.crop) ? CROPS[batch.crop].image : null),
          minOrderQty: batch.unit === "kg" ? 0.5 : 1,
        },
      });
      await audit(
        { actorId: args.adminId, action: "BATCH_APPROVED", entity: "Batch", entityId: batch.id, meta: { listingId: created.id, price, grade, farmerId: batch.farmerId } },
        tx,
      );
      return created;
    });
    publish({ type: "batch.updated", id: batch.id, userIds: [batch.farmerId], roles: ["ADMIN"], data: { status: "APPROVED" } });
    publish({ type: "inventory.updated", id: listing.id, data: { listingId: listing.id } });
    return { status: "APPROVED" as const, listingId: listing.id };
  }

  const status = args.decision === "REJECT" ? "REJECTED" : "RESUBMIT";
  const moved = await db.batch.updateMany({
    where: { id: batch.id, status: "PENDING_REVIEW" },
    data: { status, reviewedById: args.adminId, reviewedAt: now, adminNote: args.note!.trim() },
  });
  if (moved.count !== 1) throw new HttpError(409, "Someone else just reviewed this batch");
  await audit({
    actorId: args.adminId,
    action: args.decision === "REJECT" ? "BATCH_REJECTED" : "BATCH_RESUBMIT_REQUESTED",
    entity: "Batch",
    entityId: batch.id,
    meta: { note: args.note, farmerId: batch.farmerId },
  });
  publish({ type: "batch.updated", id: batch.id, userIds: [batch.farmerId], roles: ["ADMIN"], data: { status } });
  return { status };
}
