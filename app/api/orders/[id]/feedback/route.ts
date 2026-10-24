// POST /api/orders/[id]/feedback — buyer rates a handed-over order and can
// report a quality issue with a photo (multipart: rating, issue, comment,
// photo?, listingId?). A rating ≤ 2 with an issue opens a dispute for admin
// review. One feedback per order. The review then moves the live grade of
// the item(s) it covers; a photo is checked by the vision model so photo-backed
// complaints count more, and the farmer is notified (lib/quality/listing.ts).
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, sha256 } from "@/lib/media";
import { withTxRetry } from "@/lib/inventory";
import { notify } from "@/lib/orders/lifecycle";
import { moveOrder } from "@/lib/orders/state";
import { applyReview, checkReviewPhoto, type PhotoEvidence } from "@/lib/quality/listing";
import { recomputeReliability } from "@/lib/reliability";
import { saveFile } from "@/lib/storage";

type Params = { id: string };
const fields = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  issue: z.enum(["NONE", "DAMAGED", "NOT_FRESH", "WRONG_ITEM", "SHORT_QTY", "LATE"]).default("NONE"),
  comment: z.string().trim().max(500).optional(),
  /** The item the review is about, when the order has several. */
  listingId: z.string().min(1).optional(),
});

/** Saves feedback; may move the order to DISPUTED. */
export const POST = handler<undefined, undefined, Params>({ roles: ["CONSUMER", "BULK_BUYER"] }, async ({ req, user, params }) => {
  const order = await db.order.findUnique({ where: { id: params.id }, include: { feedback: true, items: { select: { listingId: true, listing: { select: { crop: true } } } } } });
  if (!order || order.buyerId !== user.id) throw new HttpError(404, "Order not found");
  if (!["DELIVERED", "COLLECTED"].includes(order.status)) throw new HttpError(409, "You can rate an order once you've received it");
  if (order.feedback) throw new HttpError(409, "You've already rated this order");

  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected form data");
  });
  const body = fields.parse({
    rating: form.get("rating"),
    issue: form.get("issue") || undefined,
    comment: (form.get("comment") as string | null) || undefined,
    listingId: (form.get("listingId") as string | null) || undefined,
  });
  const item = body.listingId ? order.items.find((i) => i.listingId === body.listingId) : undefined;
  if (body.listingId && !item) throw new HttpError(400, "That item isn't part of this order");
  const listingIds = item ? [item.listingId] : [...new Set(order.items.map((i) => i.listingId))];
  const crops = [...new Set((item ? [item] : order.items).map((i) => i.listing.crop))];

  let photoUrl: string | null = null;
  let evidence: PhotoEvidence | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (!IMAGE_TYPES.includes(photo.type)) throw new HttpError(415, "Photo must be JPG, PNG or WebP");
    if (photo.size > MAX_IMAGE_BYTES) throw new HttpError(413, "Photo must be under 12 MB");
    const bytes = Buffer.from(await photo.arrayBuffer());
    photoUrl = (await saveFile(bytes, sha256(bytes), photo.type)).url;
    evidence = await checkReviewPhoto(bytes, crops.length === 1 ? crops[0] : null, body.issue);
  }

  const dispute = body.rating <= 2 && body.issue !== "NONE";
  await withTxRetry(async (tx) => {
    await tx.feedback.create({
      data: { orderId: order.id, buyerId: user.id, listingId: item?.listingId ?? null, rating: body.rating, issue: body.issue, comment: body.comment, photoUrl, ...evidence },
    });
    if (dispute) await moveOrder(tx, order.id, "DISPUTED", { from: ["DELIVERED", "COLLECTED"], actorId: user.id, note: `Quality issue: ${body.issue.replace(/_/g, " ").toLowerCase()}` });
  });
  if (dispute) await audit({ actorId: user.id, action: "DISPUTE_OPENED", entity: "Order", entityId: order.id, meta: { issue: body.issue, rating: body.rating } });
  await recomputeReliability(order.farmerId);
  await applyReview({ listingIds, issue: body.issue, rating: body.rating, withPhoto: photoUrl !== null, photoVerdict: evidence?.photoVerdict ?? null, orderCode: order.code });
  await notify(order.id);
  return { saved: true, disputed: dispute, photoVerdict: evidence?.photoVerdict ?? null };
});
