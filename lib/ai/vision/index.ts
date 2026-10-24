// Harvest photo check with Gemini: what the photos show, whether that is the
// crop the farmer wrote, and how fresh it looks. Photo sharpness and light
// only affect confidence, never the produce score.
import "server-only";
import { CROPS, CROP_SLUGS, cropName, isCropSlug, matchCrop, type CropSlug } from "@/lib/crops";
import { gradeFor } from "@/lib/quality/score";
import type { AIImage, AIProvider } from "../provider";
import { photoCheckPrompt } from "../prompts";
import { photoCheckSchema, type PhotoContentCheck, type QualityCore, type QualityFlag } from "../schemas";
import { checkPhoto, type PhotoCheck, type PhotoIssue } from "./photo";

export type CropMatch = "match" | "mismatch" | "unsure";

export interface Detected {
  label: string;
  crop: CropSlug | null;
}

/** What Gemini read in the photos. */
export interface PhotoReading {
  detected: Detected | null;
  match: CropMatch | null;
  condition: number | null;
  notProduce: boolean;
  unclear: boolean;
  mixed: boolean;
  stock: boolean;
  defects: QualityFlag[];
  note: string;
}

/** Freshness can't be seen in a photo of these; customer reviews decide their grade. */
export const NOT_ASSESSABLE = new Set<string>(["milk", "eggs", "chicken"]);

const OTHER_PRODUCE = [
  "cauliflower",
  "capsicum",
  "cucumber",
  "chilli",
  "okra",
  "beetroot",
  "radish",
  "garlic",
  "ginger",
  "sweet_potato",
  "corn",
  "peas",
  "lettuce",
  "pineapple",
  "kiwi",
  "pear",
  "strawberry",
  "watermelon",
  "lemon",
  "jujube",
  "turnip",
];
export const PHOTO_LABELS: readonly string[] = [...CROP_SLUGS, ...OTHER_PRODUCE];

const PHOTO_FLAGS: QualityFlag[] = ["blurry_photo", "low_light", "overexposed"];
const VERDICT_FLAGS: QualityFlag[] = ["not_produce", "not_detectable", "crop_mismatch", "crop_unconfirmed", "multiple_items", "stock_photo"];

function labelName(label: string): string {
  return isCropSlug(label) ? CROPS[label].names.en : label.replace(/_/g, " ");
}

/** Photo sharpness / light for every frame. */
export function checkPhotos(frames: Buffer[]): Promise<PhotoCheck[]> {
  return Promise.all(frames.map(checkPhoto));
}

/** Combined photo confidence: the best photo matters most, the rest still count. */
export function overallPhotoConfidence(checks: PhotoCheck[]): number {
  if (!checks.length) return 0.3;
  const best = Math.max(...checks.map((c) => c.confidence));
  const mean = checks.reduce((sum, c) => sum + c.confidence, 0) / checks.length;
  return Math.round((0.6 * best + 0.4 * mean) * 100) / 100;
}

/** Issues present in every photo (one clear photo is enough). */
export function sharedIssues(checks: PhotoCheck[]): PhotoIssue[] {
  if (!checks.length) return [];
  return checks[0].issues.filter((issue) => checks.every((check) => check.issues.includes(issue)));
}

/** Asks Gemini what the photos show. */
export function askGemini(provider: AIProvider, images: AIImage[], declared: string | null | undefined): Promise<PhotoContentCheck> {
  return provider.generateJSON({
    task: "photo-check",
    system: photoCheckPrompt.system,
    prompt: photoCheckPrompt.user(declared ?? null, PHOTO_LABELS, images.length),
    images,
    schema: photoCheckSchema,
    temperature: 0,
  });
}

/** Converts Gemini's response into the normalized reading used by grading and reviews. */
export function readCheck(check: PhotoContentCheck, declared: string | null | undefined): PhotoReading {
  const raw = check.detected?.trim().toLowerCase().replace(/\s+/g, "_") ?? null;
  const label = raw && PHOTO_LABELS.includes(raw) ? raw : raw ? matchCrop(raw.replace(/_/g, " ")) : null;
  const match: CropMatch | null = !declared ? null : check.showsDeclared === true ? "match" : check.showsDeclared === false ? "mismatch" : "unsure";
  const subject = match === "match" ? declared : label;
  return {
    detected: label && check.scene !== "not_produce" ? { label, crop: isCropSlug(label) ? label : null } : null,
    match,
    condition: subject && NOT_ASSESSABLE.has(subject) ? null : check.condition,
    notProduce: check.scene === "not_produce",
    unclear: check.scene === "unclear",
    mixed: check.scene === "mixed_produce",
    stock: check.stockOrCollage,
    defects: check.flags.filter((flag) => !PHOTO_FLAGS.includes(flag) && !VERDICT_FLAGS.includes(flag)),
    note: check.summary,
  };
}

/** Scores only clear photos of the declared produce; camera quality never lowers the score. */
export function gradePhotos(reading: PhotoReading, declared: string | null | undefined, photoIssues: PhotoIssue[] = []): QualityCore {
  const flags: QualityFlag[] = [];
  const name = declared ? cropName(declared).toLowerCase() : "the harvest";
  const seen = reading.detected ? labelName(reading.detected.label).toLowerCase() : null;
  let reason: string | null = null;

  if (reading.notProduce) {
    flags.push("not_produce");
    reason = "These photos don't seem to show produce. Add clear photos of the harvest itself.";
  } else if (reading.unclear) {
    flags.push("not_detectable");
    reason = "We couldn't tell what's in these photos. Take a closer photo of the harvest in daylight.";
  } else if (reading.stock) {
    flags.push("stock_photo");
    reason = "These look like a stock photo or a collage, not photos of this harvest. Take your own photos to get a grade.";
  } else if (reading.match === "mismatch") {
    flags.push("crop_mismatch");
    reason = seen ? `These photos show ${seen}, not ${name}. Change the crop or add photos of the ${name}.` : `These photos don't show ${name}. Add photos of the ${name}.`;
  } else if (reading.match === "unsure" || (!declared && !reading.detected)) {
    flags.push("crop_unconfirmed");
    reason = `We couldn't confirm these photos show ${name}. A clear photo of just this harvest helps.`;
  } else if (reading.condition === null) {
    flags.push("not_detectable");
    reason = `${declared ? cropName(declared) : "This item"} freshness can't be seen in a photo, so the grade will come from customer reviews.`;
  }

  if (reading.mixed) flags.push("multiple_items");
  flags.push(...reading.defects, ...photoIssues);
  if (reason) return { score: null, grade: null, flags: [...new Set(flags)], summary: `Not detectable. ${reason}` };

  const score = Math.max(0, Math.min(100, Math.round(reading.condition!)));
  const summary = [reading.note.trim()];
  if (photoIssues.length) {
    const words = photoIssues.map((issue) => (issue === "blurry_photo" ? "blurry" : issue === "low_light" ? "dark" : "over-exposed"));
    summary.push(`The photos are ${words.join(" and ")}. That doesn't lower the score; it only means customer reviews will count for more.`);
  }
  return { score, grade: gradeFor(score), flags: [...new Set(flags)], summary: summary.join(" ").slice(0, 400) };
}

/** Result when Gemini is unavailable; an admin reviews the photos instead. */
export function unavailableGrade(photoIssues: PhotoIssue[] = []): QualityCore {
  return {
    score: null,
    grade: null,
    flags: ["not_detectable", ...photoIssues],
    summary: "Not detectable right now: the photo check isn't available. An admin will look at your photos.",
  };
}

/** Deterministic offline heuristic for use when Gemini is unavailable. */
export async function fallbackPhotoReading(frames: Buffer[], declared?: string | null): Promise<PhotoReading | null> {
  if (!frames.length) return null;
  const checks = await checkPhotos(frames);
  const issueSet = sharedIssues(checks);
  const confidence = Math.max(...checks.map((c) => c.confidence));
  const averageConfidence = checks.reduce((sum, c) => sum + c.confidence, 0) / checks.length;
  const base = 88;
  const penalty =
    (issueSet.includes("blurry_photo") ? 18 : 0) +
    (issueSet.includes("low_light") ? 10 : 0) +
    (issueSet.includes("overexposed") ? 8 : 0) +
    Math.round((1 - confidence) * 18) +
    Math.round((1 - averageConfidence) * 6);
  const condition = Math.round(Math.max(35, Math.min(96, base - penalty)));
  const rawLabel = declared?.trim() || "produce";
  const detectedLabel = isCropSlug(rawLabel.toLowerCase()) ? rawLabel.toLowerCase() : matchCrop(rawLabel) ?? rawLabel;

  return {
    detected: { label: detectedLabel, crop: isCropSlug(detectedLabel) ? detectedLabel : null },
    match: declared ? "match" : null,
    condition,
    notProduce: false,
    unclear: false,
    mixed: false,
    stock: false,
    defects: [],
    note: "Offline heuristic: the photos are clear enough to judge the produce.",
  };
}
