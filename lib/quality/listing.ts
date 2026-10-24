// Live listing quality. The grade a listing goes live with comes from its
// photos (or the admin); after that every customer review moves it
// (lib/quality/score.ts), and bad reviews pull it down. A buyer's photo is
// checked by Gemini so photo-backed complaints count more, and the farmer is
// notified of each complaint and grade change.
import "server-only";
import type { Prisma } from "@prisma/client";
import { readPhotos } from "@/lib/ai";
import type { PhotoReading } from "@/lib/ai/vision";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { publish } from "@/lib/events";
import { normaliseForAI } from "@/lib/media";
import { notifyUser } from "@/lib/notifications";
import { COMPLAINT_ISSUES, QUALITY_ISSUES, blendWithReviews, startingScore, type Blended, type PhotoVerdict } from "./score";

export interface PhotoEvidence {
  photoCrop: string | null;
  /** Visible condition read from the photo, 0–1. */
  photoFreshness: number | null;
  photoVerdict: PhotoVerdict;
}

/**
 * Does the buyer's photo back their complaint? Pure (unit-tested).
 * Photos that can't be read (unclear, not produce, a stock picture) are
 * "unclear" and count like a complaint without a photo; never against the buyer.
 */
export function verdictFor(issue: string | null, r: Pick<PhotoReading, "match" | "condition" | "notProduce" | "unclear" | "stock"> | null): PhotoVerdict {
  if (!issue || issue === "NONE" || !r || r.notProduce || r.unclear || r.stock) return "unclear";
  if (issue === "WRONG_ITEM") return r.match === "mismatch" ? "supports" : r.match === "match" ? "contradicts" : "unclear";
  if (!(QUALITY_ISSUES as readonly string[]).includes(issue)) return "unclear";
  if (r.match === "mismatch" || r.condition === null) return "unclear";
  if (r.condition <= 55) return "supports";
  if (r.condition >= 88) return "contradicts";
  return "unclear";
}

/**
 * Asks Gemini about a buyer's review photo.
 * @param crop - the reviewed item's crop, when known
 */
export async function checkReviewPhoto(bytes: Buffer, crop: string | null, issue: string | null): Promise<PhotoEvidence> {
  const reading = await readPhotos([{ bytes: await normaliseForAI(bytes), mimeType: "image/jpeg" }], crop).catch(() => null);
  return {
    photoCrop: reading?.detected?.label ?? null,
    photoFreshness: reading?.condition != null ? reading.condition / 100 : null,
    photoVerdict: verdictFor(issue, reading),
  };
}

/** Listing title tracks the live grade ("Tomato · Grade A"). */
function retitle(title: string, grade: string | null): string {
  const base = title.replace(/ · Grade [ABC]$/, "");
  return grade === "A" ? `${base} · Grade A` : base;
}

/**
 * Recomputes a listing's live score and grade from its photo score and every
 * review that covers it (reviews naming the item, and whole-order reviews of
 * orders that contained it).
 */
export async function recomputeListingQuality(listingId: string): Promise<{ before: { grade: string | null; score: number | null }; after: Blended; crop: string; farmerId: string } | null> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: { batch: { select: { aiQualityScore: true, aiConfidence: true, grade: true } } },
  });
  if (!listing) return null;
  const feedback = await db.feedback.findMany({
    where: { OR: [{ listingId }, { listingId: null, order: { items: { some: { listingId } } } }] },
    select: { buyerId: true, rating: true, issue: true, photoVerdict: true, createdAt: true },
  });
  const after = blendWithReviews(
    { score: startingScore(listing.batch.aiQualityScore, listing.batch.grade), confidence: listing.batch.aiConfidence },
    feedback.map((f) => ({ ...f, photoVerdict: f.photoVerdict as PhotoVerdict | null })),
  );
  const gradeChanged = after.grade !== listing.grade;
  await db.listing.update({
    where: { id: listing.id },
    data: {
      qualityScore: after.score,
      grade: after.grade,
      reviewCount: after.reviewCount,
      complaintCount: after.complaintCount,
      title: retitle(listing.title, after.grade),
      ...(gradeChanged && { gradeUpdatedAt: new Date() }),
    },
  });
  if (gradeChanged) {
    await audit({
      action: "LISTING_GRADE_CHANGED",
      entity: "Listing",
      entityId: listing.id,
      meta: { from: listing.grade, to: after.grade, score: after.score, reviews: after.reviewCount, complaints: after.complaintCount },
    });
  }
  publish({ type: "inventory.updated", id: listing.id, data: { listingId: listing.id } });
  return { before: { grade: listing.grade, score: listing.qualityScore }, after, crop: listing.crop, farmerId: listing.farmerId };
}

/**
 * Applies a new review: recomputes every listing it covers and notifies the
 * farmer of a complaint and of any grade change.
 */
export async function applyReview(review: { listingIds: string[]; issue: string | null; rating: number; withPhoto: boolean; photoVerdict: PhotoVerdict | null; orderCode: string }) {
  const complaint = review.issue !== null && (COMPLAINT_ISSUES as readonly string[]).includes(review.issue);
  for (const listingId of review.listingIds) {
    const r = await recomputeListingQuality(listingId);
    if (!r) continue;
    const base: Prisma.InputJsonObject = { listingId, crop: r.crop, reviews: r.after.reviewCount, complaints: r.after.complaintCount };
    if (complaint) {
      await notifyUser(
        r.farmerId,
        "QUALITY_COMPLAINT",
        { ...base, issue: review.issue, rating: review.rating, withPhoto: review.withPhoto, photoBacked: review.photoVerdict === "supports", orderCode: review.orderCode },
        "/farmer/listings",
      );
    }
    if (r.before.grade && r.after.grade && r.after.score !== null && r.before.grade !== r.after.grade) {
      const down = r.after.grade > r.before.grade; // "C" > "B" > "A"
      await notifyUser(r.farmerId, down ? "GRADE_DOWN" : "GRADE_UP", { ...base, from: r.before.grade, to: r.after.grade, score: Math.round(r.after.score) }, "/farmer/listings");
    }
  }
}
