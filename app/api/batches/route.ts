// /api/batches — farmer harvest batches.
//   GET  list my batches (newest first)
//   POST create a DRAFT batch from the wizard's details step
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { createDraftBatch, serializeBatch } from "@/lib/batches";
import { batchDetailsSchema } from "@/lib/validators/batch";

/** Lists the signed-in farmer's batches with media, minus ones whose listing they removed. */
export const GET = handler({ roles: ["FARMER"] }, async ({ user }) => {
  const batches = await db.batch.findMany({
    where: { farmerId: user.id, OR: [{ listing: { is: null } }, { listing: { status: { not: "REMOVED" } } }] },
    include: {
      media: { orderBy: { createdAt: "asc" } },
      listing: { select: { id: true, status: true, availableQty: true, pricePerUnit: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return batches.map((b) => ({ ...serializeBatch(b), listing: b.listing }));
});

/**
 * Creates a DRAFT batch. Drafts never appear to buyers; they become
 * PENDING_REVIEW only when the farmer submits (PATCH action=submit).
 */
export const POST = handler({ roles: ["FARMER"], body: batchDetailsSchema }, async ({ user, body }) => serializeBatch(await createDraftBatch(user, body)));
