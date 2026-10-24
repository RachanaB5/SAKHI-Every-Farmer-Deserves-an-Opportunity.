// Quality scoring rules for the review loop. Pure functions only
// (unit-tested in tests/quality-score.test.ts).
//
//   1. Starting point. The photo check's score (lib/ai/vision), when Gemini
//      could grade the photos; otherwise the admin's grade, or nothing at all.
//      How good the PHOTO is only sets the confidence, i.e. how quickly
//      customer reviews can move the grade, never the score itself.
//   2. After listing. The starting score is a prior worth a few reviews
//      (more when the photos were clear). Each buyer's latest review of the
//      item is added as evidence, so bad reviews pull the score down;
//      complaints backed by a photo count more, ones the photo contradicts
//      count less. One buyer can't move the grade on their own: it changes
//      only once two different buyers agree.

export type Grade = "A" | "B" | "C";

export const MIN_SCORE = 35;
export const MAX_SCORE = 96;

/** Grade bands: A ≥ 85, B 70–84, C below 70. */
export function gradeFor(score: number): Grade {
  return score >= 85 ? "A" : score >= 70 ? "B" : "C";
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));


// ─── Reviews ──────────────────────────────────────────────────────────────

/** Issues that are about the produce itself (lateness / short weight are fulfilment problems). */
export const QUALITY_ISSUES = ["NOT_FRESH", "DAMAGED"] as const;
/** Issues the farmer is told about. */
export const COMPLAINT_ISSUES = ["NOT_FRESH", "DAMAGED", "WRONG_ITEM", "SHORT_QTY"] as const;

export type PhotoVerdict = "supports" | "unclear" | "contradicts";

export interface ReviewSignal {
  buyerId: string;
  /** 1–5 stars */
  rating: number;
  issue: string | null;
  photoVerdict: PhotoVerdict | null;
  createdAt: Date;
}

export interface Prior {
  /** Photo score at approval (0–100); null when the photos couldn't be graded and no admin grade was set. */
  score: number | null;
  /** Photo confidence (0–1); null for listings checked before confidence existed. */
  confidence: number | null;
}

export interface Blended {
  /** null until there is a photo score, an admin grade or a customer review. */
  score: number | null;
  /** null while only one buyer has reviewed an ungraded listing. */
  grade: Grade | null;
  /** Distinct buyers whose review counted. */
  reviewCount: number;
  /** Distinct buyers who reported a produce-quality problem. */
  complaintCount: number;
}

/** What one review says about the produce, on the 0–100 scale. */
export function reviewValue(r: Pick<ReviewSignal, "rating" | "issue">): number {
  const stars = clamp(Math.round(r.rating), 1, 5);
  if (r.issue && (QUALITY_ISSUES as readonly string[]).includes(r.issue)) return Math.min(45, 25 + 5 * stars);
  return [0, 40, 52, 70, 85, 95][stars];
}

/** How much one review counts: photo evidence for a complaint counts 1.5×, a contradicting photo 0.5×. */
export function reviewWeight(r: Pick<ReviewSignal, "issue" | "photoVerdict">): number {
  const complaint = r.issue && (QUALITY_ISSUES as readonly string[]).includes(r.issue);
  if (!complaint) return 1;
  return r.photoVerdict === "supports" ? 1.5 : r.photoVerdict === "contradicts" ? 0.5 : 1;
}

/** Reviews that speak to produce quality: no issue, or a freshness / damage issue. */
export function isQualityReview(r: Pick<ReviewSignal, "issue">): boolean {
  return !r.issue || r.issue === "NONE" || (QUALITY_ISSUES as readonly string[]).includes(r.issue);
}

/** The prior is worth 2–8 reviews: clear photos of assessable produce hold more weight. */
export function priorWeight(confidence: number | null): number {
  return 2 + 6 * clamp(confidence ?? 0.6, 0, 1);
}

const BAND_LOW: Record<Grade, number> = { A: 85, B: 70, C: MIN_SCORE };
const BAND_HIGH: Record<Grade, number> = { A: MAX_SCORE, B: 84, C: 69 };
const RANK: Record<Grade, number> = { C: 0, B: 1, A: 2 };

const BAND_MIDDLE: Record<Grade, number> = { A: 90, B: 77, C: 60 };

/**
 * Score a listing starts from: the photo score, moved into the admin's grade
 * band when the admin changed the grade at approval (a person checked it).
 * Photos that couldn't be graded start from the admin's grade, or from
 * nothing: then customer reviews alone set the score.
 */
export function startingScore(photoScore: number | null, approvedGrade: string | null): number | null {
  const grade = approvedGrade === "A" || approvedGrade === "B" || approvedGrade === "C" ? approvedGrade : null;
  if (photoScore === null) return grade ? BAND_MIDDLE[grade] : null;
  return grade ? clamp(photoScore, BAND_LOW[grade], BAND_HIGH[grade]) : photoScore;
}

/**
 * Blends the photo score with customer reviews.
 * @param reviews - every review of the item; only each buyer's latest quality review counts
 */
export function blendWithReviews(prior: Prior, reviews: ReviewSignal[]): Blended {
  const latest = new Map<string, ReviewSignal>();
  for (const r of reviews) {
    if (!isQualityReview(r)) continue;
    const seen = latest.get(r.buyerId);
    if (!seen || seen.createdAt < r.createdAt) latest.set(r.buyerId, r);
  }
  const counted = [...latest.values()];
  const complaintCount = counted.filter((r) => r.issue && (QUALITY_ISSUES as readonly string[]).includes(r.issue)).length;
  // No photo score and no admin grade: the reviews alone are the score.
  const k = prior.score === null ? 0 : priorWeight(prior.confidence);
  if (k === 0 && !counted.length) return { score: null, grade: null, reviewCount: 0, complaintCount: 0 };
  let num = k * (prior.score ?? 0);
  let den = k;
  let unhappy = 0;
  let happy = 0;
  for (const r of counted) {
    const v = reviewValue(r);
    const w = reviewWeight(r);
    num += w * v;
    den += w;
    if (v <= 52) unhappy++;
    if (v >= 85) happy++;
  }
  let score = num / den;
  const round = (x: number) => Math.round(clamp(x, MIN_SCORE, MAX_SCORE) * 10) / 10;
  // A single buyer, happy or not, can't set or change the grade by themselves.
  if (prior.score === null) return { score: round(score), grade: counted.length >= 2 ? gradeFor(score) : null, reviewCount: counted.length, complaintCount };
  const start = gradeFor(prior.score);
  let grade = gradeFor(score);
  if (RANK[grade] < RANK[start] && unhappy < 2) {
    grade = start;
    score = Math.max(score, BAND_LOW[start]);
  } else if (RANK[grade] > RANK[start] && happy < 2) {
    grade = start;
    score = Math.min(score, BAND_HIGH[start]);
  }
  return { score: round(score), grade, reviewCount: counted.length, complaintCount };
}
