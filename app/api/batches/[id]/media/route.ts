// POST /api/batches/[id]/media — upload ONE photo, video or extracted
// frame to a draft batch. Each file is SHA-256 hashed, checked against
// every other batch for duplicates, stored, and stamped with EXIF time.
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { MAX_MEDIA_PER_BATCH, loadBatch, serializeMedia } from "@/lib/batches";
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_TYPES,
  exifCapturedAt,
  findDuplicate,
  provenanceNote,
  sha256,
} from "@/lib/media";
import { rateLimit } from "@/lib/rate-limit";
import { saveFile } from "@/lib/storage";

type Params = { id: string };

/**
 * Multipart fields: `file` (required), `kind` = "media" | "frame".
 * Re-uploading the exact same file to the same batch is a no-op.
 * @returns the stored asset including `isDuplicate`
 */
export const POST = handler<undefined, undefined, Params>({ roles: ["FARMER"] }, async ({ req, user, params }) => {
  rateLimit(`upload:${user.id}`, 40, 60_000);
  const batch = await loadBatch(params.id, user, "owner");
  if (batch.status !== "DRAFT" && batch.status !== "RESUBMIT") {
    throw new HttpError(409, "Media can only be added before the harvest is submitted");
  }
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected a multipart upload");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a file");
  const isFrame = form.get("kind") === "frame";
  const mime = file.type;
  const isImage = IMAGE_TYPES.includes(mime);
  const isVideo = VIDEO_TYPES.includes(mime);
  if (!isImage && !isVideo) throw new HttpError(415, "Use a JPG/PNG/WebP photo or an MP4/WebM/MOV video");
  if (isImage && file.size > MAX_IMAGE_BYTES) throw new HttpError(413, "Photos must be under 12 MB");
  if (isVideo && file.size > MAX_VIDEO_BYTES) throw new HttpError(413, "Keep videos under 40 MB (about 20 seconds)");

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = sha256(bytes);
  const existing = batch.media.find((m) => m.sha256 === hash);
  if (existing) return serializeMedia(existing);
  if (batch.media.length >= MAX_MEDIA_PER_BATCH) throw new HttpError(400, `Up to ${MAX_MEDIA_PER_BATCH} files per harvest`);

  // Same bytes on another farmer's (or an older) batch → flag for admin review.
  const duplicateOf = await findDuplicate(hash, batch.id);
  const stored = await saveFile(bytes, hash, mime);
  const capturedAt = isImage && !isFrame ? await exifCapturedAt(bytes) : null;
  const note = duplicateOf
    ? "Same file hash as media on another batch, flag for review"
    : provenanceNote(capturedAt, batch.harvestDate, isFrame);

  const asset = await db.mediaAsset.create({
    data: {
      batchId: batch.id,
      url: stored.url,
      type: isImage ? "IMAGE" : "VIDEO",
      mimeType: mime,
      sizeBytes: file.size,
      sha256: hash,
      isDuplicate: Boolean(duplicateOf),
      duplicateOfBatchId: duplicateOf,
      isFrame,
      capturedAt,
      provenanceNote: note,
    },
  });
  if (duplicateOf) {
    await audit({ actorId: user.id, action: "MEDIA_DUPLICATE_FLAGGED", entity: "Batch", entityId: batch.id, meta: { mediaId: asset.id, duplicateOf } });
  }
  return serializeMedia(asset);
});
