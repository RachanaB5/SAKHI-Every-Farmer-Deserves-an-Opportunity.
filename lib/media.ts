// Harvest media pipeline: SHA-256 hashing, EXIF capture time, duplicate
// detection across batches and normalisation for AI checks.
// A duplicate is a FLAG for admins ("same bytes seen on another batch"),
// never proof of fraud — farmers legitimately re-use photos sometimes.
import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

/** Hex SHA-256 of raw bytes. */
export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Reads EXIF DateTimeOriginal when present (JPEG/HEIC from phone cameras).
 * @returns capture time, or null for screenshots, re-encoded or stripped files
 */
export async function exifCapturedAt(bytes: Buffer): Promise<Date | null> {
  try {
    const exifr = (await import("exifr")).default;
    const tags = (await exifr.parse(bytes, ["DateTimeOriginal", "CreateDate"])) as
      | { DateTimeOriginal?: Date; CreateDate?: Date }
      | undefined;
    const d = tags?.DateTimeOriginal ?? tags?.CreateDate;
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

/**
 * Looks for the same file hash on a different batch.
 * @param hash - SHA-256 of the new file
 * @param batchId - the batch being uploaded to (excluded from the search)
 * @returns the earlier asset's batch id, or null
 */
export async function findDuplicate(hash: string, batchId: string): Promise<string | null> {
  const hit = await db.mediaAsset.findFirst({
    where: { sha256: hash, batchId: { not: batchId } },
    orderBy: { createdAt: "asc" },
    select: { batchId: true },
  });
  return hit?.batchId ?? null;
}

/**
 * Provenance note shown to admins next to each file.
 * @param capturedAt - EXIF time (if any)
 * @param harvestDate - farmer's declared harvest date
 */
export function provenanceNote(capturedAt: Date | null, harvestDate: Date, isFrame: boolean): string {
  if (isFrame) return "Frame extracted in-app from the farmer's video";
  if (!capturedAt) return "No camera timestamp (EXIF), common for screenshots or edited files";
  const days = Math.round((harvestDate.getTime() - capturedAt.getTime()) / 86_400_000);
  if (Math.abs(days) <= 2) return `Camera timestamp ${capturedAt.toISOString().slice(0, 16).replace("T", " ")} matches the harvest date`;
  return `Camera timestamp is ${Math.abs(days)} day(s) ${days > 0 ? "before" : "after"} the declared harvest date`;
}

/**
 * Downscales an image to a stable JPEG for AI checks so the same photo
 * always produces the same bytes (and hits the quality cache).
 */
export async function normaliseForAI(bytes: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(bytes).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
}
