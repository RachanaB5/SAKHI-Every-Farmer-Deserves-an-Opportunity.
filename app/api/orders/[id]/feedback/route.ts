// POST /api/orders/[id]/feedback ? buyer rates a handed-over order and can
// attach images. A low rating with an issue opens a dispute for admin review.
import { z } from "zod";
import sharp from "sharp";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/media";
import { withTxRetry } from "@/lib/inventory";
import { notify } from "@/lib/orders/lifecycle";
import { moveOrder } from "@/lib/orders/state";
import { applyReview, checkReviewPhoto, type PhotoEvidence } from "@/lib/quality/listing";
import { recomputeReliability } from "@/lib/reliability";
import { saveFile } from "@/lib/storage";

type Params = { id: string };
const MAX_IMAGES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_STORED_BYTES = 550_000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const fields = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  issue: z.enum(["NONE", "DAMAGED", "NOT_FRESH", "WRONG_ITEM", "SHORT_QTY", "LATE"]).default("NONE"),
  comment: z.string().trim().max(500).optional(),
  /** The item the review is about, when the order has several. */
  listingId: z.string().min(1).optional(),
});

async function prepareReviewPhoto(file: File): Promise<{ bytes: Buffer; type: "image/webp" }> {
  if (!ALLOWED_TYPES.has(file.type)) throw new HttpError(415, "Only JPEG, PNG and WebP images are supported");
  if (file.size === 0 || file.size > MAX_FILE_BYTES) throw new HttpError(413, "Each image must be 5 MB or smaller");
  const input = Buffer.from(await file.arrayBuffer());
  try {
    const metadata = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
    const expectedFormat = file.type === "image/jpeg" ? "jpeg" : file.type === "image/png" ? "png" : "webp";
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height) throw new Error("Unsupported image content");
  } catch {
    throw new HttpError(415, "The uploaded file is not a valid JPEG, PNG or WebP image");
  }

  for (const width of [1600, 1200, 900, 700, 500]) {
    for (const quality of [78, 68, 58]) {
      const bytes = await sharp(input, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
      if (bytes.length <= MAX_STORED_BYTES) return { bytes, type: "image/webp" };
    }
  }
  throw new HttpError(413, "An image could not be compressed enough to store safely");
}

/** Saves feedback; may move the order to DISPUTED. */
export const POST = handler<undefined, undefined, Params>({ roles: ["CONSUMER", "BULK_BUYER"] }, async ({ req, user, params }) => {
  const order = await db.order.findUnique({ where: { id: params.id }, include: { feedback: true, items: { select: { listingId: true, listing: { select: { crop: true } } } } } });
  if (!order || order.buyerId !== user.id) throw new HttpError(404, "Order not found");
  if (!["DELIVERED", "COLLECTED"].includes(order.status)) throw new HttpError(409, "You can rate an order once you've received it");
  if (order.feedback) throw new HttpError(409, "You've already rated this order");
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_TOTAL_BYTES + 128 * 1024) throw new HttpError(413, "The selected images are too large to upload");

  let form: FormData;
  try { form = await req.formData(); } catch { throw new HttpError(400, "Expected form data"); }
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

  const uploaded = form.getAll("photos");
  const legacyPhoto = form.get("photo");
  if (legacyPhoto instanceof File && legacyPhoto.size > 0) uploaded.push(legacyPhoto);
  if (uploaded.length > MAX_IMAGES) throw new HttpError(413, "You can add up to 5 images per review");
  if (uploaded.some((value) => !(value instanceof File))) throw new HttpError(400, "Invalid image upload");
  const files = uploaded as File[];
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) throw new HttpError(413, "The selected images are too large to upload");

  const photoUrls: string[] = [];
  let evidence: PhotoEvidence | null = null;
  for (const [index, file] of files.entries()) {
    const { bytes, type } = await prepareReviewPhoto(file);
    const photoUrl = (await saveFile(bytes, sha256(bytes), type)).url;
    photoUrls.push(photoUrl);
    if (index === 0) evidence = await checkReviewPhoto(bytes, crops.length === 1 ? crops[0] : null, body.issue);
  }
  const photoUrl = photoUrls[0] ?? null;
  const dispute = body.rating <= 2 && body.issue !== "NONE";
  try {
    await withTxRetry(async (tx) => {
    await tx.feedback.create({
      data: { orderId: order.id, buyerId: user.id, listingId: item?.listingId ?? null, rating: body.rating, issue: body.issue, comment: body.comment, photoUrl, photoUrls, ...evidence },
    });
    if (dispute) await moveOrder(tx, order.id, "DISPUTED", { from: ["DELIVERED", "COLLECTED"], actorId: user.id, note: "Quality issue: " + body.issue.replace(/_/g, " ").toLowerCase() });
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new HttpError(409, "You've already rated this order");
    }
    throw error;
  }
  if (dispute) await audit({ actorId: user.id, action: "DISPUTE_OPENED", entity: "Order", entityId: order.id, meta: { issue: body.issue, rating: body.rating } });
  await recomputeReliability(order.farmerId);
  await applyReview({ listingIds, issue: body.issue, rating: body.rating, withPhoto: photoUrl !== null, photoVerdict: evidence?.photoVerdict ?? null, orderCode: order.code });
  await notify(order.id);
  return { saved: true, disputed: dispute, photoVerdict: evidence?.photoVerdict ?? null, photoUrls };
});
