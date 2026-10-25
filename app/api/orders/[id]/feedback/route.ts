// POST /api/orders/[id]/feedback — buyer rates a handed-over order and can
// report a quality issue with images (multipart: rating, issue, comment,
// photos[]). A rating ≤ 2 with an issue opens a dispute for admin review.
// One feedback per order.
import { z } from "zod";
import { Prisma } from "@prisma/client";
import sharp from "sharp";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/media";
import { MAX_REVIEW_IMAGES, MAX_REVIEW_IMAGE_BYTES, MAX_REVIEW_UPLOAD_BYTES, REVIEW_IMAGE_TYPES } from "@/lib/review-media";
import { withTxRetry } from "@/lib/inventory";
import { notify } from "@/lib/orders/lifecycle";
import { moveOrder } from "@/lib/orders/state";
import { recomputeReliability } from "@/lib/reliability";
import { saveFile } from "@/lib/storage";

type Params = { id: string };
const fields = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  issue: z.enum(["NONE", "DAMAGED", "NOT_FRESH", "WRONG_ITEM", "SHORT_QTY", "LATE"]).default("NONE"),
  comment: z.string().trim().max(500).optional(),
});

const FORMAT_BY_TYPE: Record<(typeof REVIEW_IMAGE_TYPES)[number], string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_STORED_IMAGE_BYTES = 600_000;

async function storeReviewImage(file: File): Promise<string> {
  if (!REVIEW_IMAGE_TYPES.includes(file.type as (typeof REVIEW_IMAGE_TYPES)[number])) {
    throw new HttpError(415, "Images must be JPEG, PNG or WebP");
  }
  if (file.size > MAX_REVIEW_IMAGE_BYTES) {
    throw new HttpError(413, "Each image must be 5 MB or smaller");
  }

  const input = Buffer.from(await file.arrayBuffer());
  const image = sharp(input, { limitInputPixels: 40_000_000 });
  let metadata: Awaited<ReturnType<typeof image.metadata>>;
  try {
    metadata = await image.metadata();
  } catch {
    throw new HttpError(415, "One of the selected files is not a valid image");
  }
  const expectedFormat = FORMAT_BY_TYPE[file.type as (typeof REVIEW_IMAGE_TYPES)[number]];
  if (!metadata.format || metadata.format !== expectedFormat) {
    throw new HttpError(415, "One of the selected files does not match its image type");
  }
  if (metadata.width && metadata.height && metadata.width * metadata.height > 40_000_000) {
    throw new HttpError(413, "Image dimensions are too large");
  }

  const optimized = async (width: number, quality: number) =>
    sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(width, width, { fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

  let bytes = await optimized(1600, 78);
  if (bytes.length > MAX_STORED_IMAGE_BYTES) bytes = await optimized(1000, 65);
  if (bytes.length > MAX_STORED_IMAGE_BYTES) bytes = await optimized(700, 50);
  if (bytes.length > MAX_STORED_IMAGE_BYTES) {
    throw new HttpError(413, "This image could not be compressed enough; choose a smaller image");
  }
  return (await saveFile(bytes, sha256(bytes), "image/webp")).url;
}

/** Saves feedback; may move the order to DISPUTED. */
export const POST = handler<undefined, undefined, Params>({ roles: ["CONSUMER", "BULK_BUYER"] }, async ({ req, user, params }) => {
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REVIEW_UPLOAD_BYTES + 128 * 1024) {
    throw new HttpError(413, "Review images must total 4 MB or less after compression");
  }
  const order = await db.order.findUnique({ where: { id: params.id }, include: { feedback: true } });
  if (!order || order.buyerId !== user.id) throw new HttpError(404, "Order not found");
  if (!["DELIVERED", "COLLECTED"].includes(order.status)) throw new HttpError(409, "You can rate an order once you've received it");
  if (order.feedback) throw new HttpError(409, "You've already rated this order");

  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected form data");
  });
  const body = fields.parse({ rating: form.get("rating"), issue: form.get("issue") || undefined, comment: (form.get("comment") as string | null) || undefined });
  const photoFields = [...form.getAll("photos"), ...form.getAll("photo")];
  if (photoFields.some((entry) => !(entry instanceof File))) {
    throw new HttpError(400, "Images must be uploaded as files");
  }
  const photos = photoFields.filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (photos.length > MAX_REVIEW_IMAGES) throw new HttpError(400, `You can attach up to ${MAX_REVIEW_IMAGES} images`);
  if (photos.reduce((total, photo) => total + photo.size, 0) > MAX_REVIEW_UPLOAD_BYTES) {
    throw new HttpError(413, "Review images must total 4 MB or less after compression");
  }
  if (photos.some((photo) => !REVIEW_IMAGE_TYPES.includes(photo.type as (typeof REVIEW_IMAGE_TYPES)[number]))) {
    throw new HttpError(415, "Images must be JPEG, PNG or WebP");
  }
  if (photos.some((photo) => photo.size > MAX_REVIEW_IMAGE_BYTES)) {
    throw new HttpError(413, "Each image must be 5 MB or smaller");
  }
  const photoUrls: string[] = [];
  for (const photo of photos) photoUrls.push(await storeReviewImage(photo));

  const dispute = body.rating <= 2 && body.issue !== "NONE";
  try {
    await withTxRetry(async (tx) => {
      await tx.feedback.create({
        data: {
          orderId: order.id,
          buyerId: user.id,
          rating: body.rating,
          issue: body.issue,
          comment: body.comment,
          photoUrl: photoUrls[0] ?? null,
          photoUrls,
        },
      });
      if (dispute) await moveOrder(tx, order.id, "DISPUTED", { from: ["DELIVERED", "COLLECTED"], actorId: user.id, note: `Quality issue: ${body.issue.replace(/_/g, " ").toLowerCase()}` });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "You've already rated this order");
    }
    throw error;
  }
  if (dispute) await audit({ actorId: user.id, action: "DISPUTE_OPENED", entity: "Order", entityId: order.id, meta: { issue: body.issue, rating: body.rating } });
  await recomputeReliability(order.farmerId);
  await notify(order.id);
  return { saved: true, disputed: dispute };
});
