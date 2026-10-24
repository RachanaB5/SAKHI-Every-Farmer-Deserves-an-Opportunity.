// Harvest batch services shared by the farmer wizard, the AI quality route
// and the admin review queue.
import "server-only";
import type { Batch, MediaAsset } from "@prisma/client";
import { assessQuality } from "@/lib/ai";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { CROPS, type CropSlug } from "@/lib/crops";
import { publish } from "@/lib/events";
import { removeOwnListing } from "@/lib/listings";
import { normaliseForAI } from "@/lib/media";
import { readFile } from "@/lib/storage";
import type { BatchDetails } from "@/lib/validators/batch";

/** At most this many images go to the visual check (cost + latency). */
export const MAX_AI_FRAMES = 4;
/** Per-batch upload cap (photos + video + extracted frames). */
export const MAX_MEDIA_PER_BATCH = 10;

/**
 * Picks up to four stills — in-app video frames first (they show the whole
 * lot), then photos — and runs the visual quality check on them.
 */
export async function assessBatchMedia(crop: string, media: MediaAsset[]) {
  const stills = media
    .filter((m) => m.type === "IMAGE")
    .sort((a, b) => Number(b.isFrame) - Number(a.isFrame))
    .slice(0, MAX_AI_FRAMES);
  if (!stills.length) throw new HttpError(400, "Add at least one photo or a short video first");
  const frames = await Promise.all(
    stills.map(async (m) => ({ bytes: await normaliseForAI(await readFile(m.url)), mimeType: "image/jpeg" })),
  );
  return assessQuality(frames, crop);
}

/**
 * Loads a batch the user may act on.
 * @param mode - "owner" (farmer must own it) or "admin"
 */
export async function loadBatch(id: string, user: { id: string; role: string }, mode: "owner" | "read" = "owner") {
  const batch = await db.batch.findUnique({ where: { id }, include: { media: { orderBy: { createdAt: "asc" } } } });
  if (!batch) throw new HttpError(404, "Harvest batch not found");
  const isOwner = batch.farmerId === user.id;
  if (mode === "owner" && !isOwner) throw new HttpError(403, "This harvest belongs to another farmer");
  if (mode === "read" && !isOwner && user.role !== "ADMIN") throw new HttpError(403, "Not allowed");
  return batch;
}

/** Shape sent to clients (dates as ISO, JSON flags as string[]). */
export function serializeBatch(b: Batch & { media?: MediaAsset[] }) {
  return {
    id: b.id,
    crop: b.crop,
    category: b.category,
    title: b.title,
    quantity: b.quantityKg,
    unit: b.unit,
    harvestDate: b.harvestDate.toISOString(),
    proposedPrice: b.proposedPrice,
    notes: b.declaredNotes,
    grade: b.grade,
    status: b.status,
    aiQualityScore: b.aiQualityScore,
    aiFlags: (b.aiFlags as string[] | null) ?? [],
    aiSummary: b.aiSummary,
    aiSource: b.aiSource,
    aiDetectedCrop: b.aiDetectedCrop,
    aiCropMatch: b.aiCropMatch as "match" | "mismatch" | "unsure" | null,
    aiConfidence: b.aiConfidence,
    transcript: b.voiceTranscript,
    inputLanguage: b.inputLanguage,
    adminNote: b.adminNote,
    reviewedAt: b.reviewedAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    media: (b.media ?? []).map(serializeMedia),
  };
}

/** Client shape for a media asset. */
export function serializeMedia(m: MediaAsset) {
  return {
    id: m.id,
    url: m.url,
    type: m.type,
    isFrame: m.isFrame,
    sha256: m.sha256,
    isDuplicate: m.isDuplicate,
    duplicateOfBatchId: m.duplicateOfBatchId,
    capturedAt: m.capturedAt?.toISOString() ?? null,
    provenanceNote: m.provenanceNote,
  };
}

export type SerializedBatch = ReturnType<typeof serializeBatch>;
export type SerializedMedia = ReturnType<typeof serializeMedia>;

type DraftFields = Partial<Omit<BatchDetails, "crop">> & { crop?: CropSlug };

/** Prisma data for the editable batch fields that are present. */
function draftData(d: DraftFields) {
  return {
    ...(d.crop && { crop: d.crop, category: CROPS[d.crop].category }),
    ...(d.quantity !== undefined && { quantityKg: d.quantity }),
    ...(d.unit && { unit: d.unit }),
    ...(d.harvestDate && { harvestDate: new Date(`${d.harvestDate}T06:00:00`) }),
    ...(d.price !== undefined && { proposedPrice: d.price }),
    ...(d.notes !== undefined && { declaredNotes: d.notes }),
    ...(d.transcript !== undefined && { voiceTranscript: d.transcript }),
    ...(d.inputLanguage !== undefined && { inputLanguage: d.inputLanguage }),
  };
}

/**
 * Creates a DRAFT batch (wizard details step, Sakhi). Drafts are
 * never shown to buyers; they reach the admin only via {@link submitBatch}.
 */
export async function createDraftBatch(farmer: { id: string; name: string }, d: BatchDetails) {
  const info = CROPS[d.crop];
  const farm = await db.farmerProfile.findUnique({ where: { userId: farmer.id }, select: { farmName: true } });
  return db.batch.create({
    data: { farmerId: farmer.id, title: `${info.names.en}, ${farm?.farmName ?? farmer.name}`, status: "DRAFT", ...draftData(d), crop: d.crop, category: info.category, quantityKg: d.quantity, unit: d.unit, harvestDate: new Date(`${d.harvestDate}T06:00:00`) },
    include: { media: true },
  });
}

/** Saves edits to the farmer's own DRAFT / RESUBMIT batch. */
export async function updateDraftBatch(farmer: { id: string; role: string }, batchId: string, d: DraftFields) {
  const batch = await loadBatch(batchId, farmer, "owner");
  if (batch.status !== "DRAFT" && batch.status !== "RESUBMIT") throw new HttpError(409, "This harvest is already with the admin team and can't be edited");
  return db.batch.update({ where: { id: batch.id }, data: draftData(d), include: { media: true } });
}

/**
 * Sends a DRAFT / RESUBMIT batch for admin review: needs a price and at
 * least one photo (the admin's evidence), re-runs the visual check on the
 * stored media and moves it to PENDING_REVIEW. Nothing goes live here —
 * listings are created only when an admin approves.
 */
export async function submitBatch(farmer: { id: string; role: string }, batchId: string, d: DraftFields = {}) {
  const batch = await loadBatch(batchId, farmer, "owner");
  if (batch.status === "PENDING_REVIEW") return { batch, alreadySubmitted: true };
  if (batch.status !== "DRAFT" && batch.status !== "RESUBMIT") throw new HttpError(409, "This harvest is already with the admin team and can't be edited");
  const data = draftData(d);
  const crop = data.crop ?? batch.crop;
  const price = data.proposedPrice ?? batch.proposedPrice;
  if (!price) throw new HttpError(400, "Set your price before sending for verification");
  if (!batch.media.some((m) => m.type === "IMAGE")) throw new HttpError(400, "Add at least one photo of the harvest so the admin can verify it");
  const quality = await assessBatchMedia(crop, batch.media);
  const updated = await db.batch.update({
    where: { id: batch.id },
    data: {
      ...data,
      status: "PENDING_REVIEW",
      aiQualityScore: quality.data.score,
      grade: quality.data.grade,
      aiFlags: quality.data.flags,
      aiSummary: quality.data.summary,
      aiSource: quality.source,
      aiDetectedCrop: quality.data.detected?.label ?? null,
      aiCropMatch: quality.data.match,
      aiConfidence: quality.data.confidence,
      adminNote: batch.status === "RESUBMIT" ? batch.adminNote : null,
    },
    include: { media: true },
  });
  await audit({
    actorId: farmer.id,
    action: batch.status === "RESUBMIT" ? "BATCH_RESUBMITTED" : "BATCH_SUBMITTED",
    entity: "Batch",
    entityId: batch.id,
    meta: {
      score: quality.data.score,
      source: quality.source,
      duplicates: batch.media.filter((m) => m.isDuplicate).length,
      detected: quality.data.detected?.label ?? null,
      match: quality.data.match,
    },
  });
  publish({ type: "batch.updated", id: batch.id, roles: ["ADMIN"], userIds: [farmer.id], data: { status: "PENDING_REVIEW" } });
  return { batch: updated, alreadySubmitted: false };
}

/**
 * Farmer removes a harvest. One that never went live (draft, in review,
 * sent back, rejected) is deleted with its media rows, which also withdraws
 * it from the admin queue. One that became a listing takes the listing down
 * instead (see removeOwnListing), so its orders and reviews stay intact.
 */
export async function removeOwnBatch(farmer: { id: string; role: string }, id: string) {
  const batch = await loadBatch(id, farmer, "owner");
  const listing = await db.listing.findUnique({ where: { batchId: batch.id }, select: { id: true } });
  if (listing) return { id: batch.id, deleted: false, listing: await removeOwnListing(farmer.id, listing.id) };
  // Conditional, so an approval landing in between can't cascade into its new listing.
  const gone = await db.batch.deleteMany({ where: { id: batch.id, listing: { is: null } } });
  if (gone.count === 0) throw new HttpError(409, "This harvest just went live, refresh and try again");
  await audit({ actorId: farmer.id, action: "BATCH_DELETED", entity: "Batch", entityId: batch.id, meta: { crop: batch.crop, status: batch.status, media: batch.media.length } });
  publish({ type: "batch.updated", id: batch.id, roles: ["ADMIN"], userIds: [farmer.id], data: { status: "DELETED" } });
  return { id: batch.id, deleted: true, listing: null };
}
