// AI capabilities used across FoodFlow. Each function tries the configured
// model (Gemini), validates its JSON, and on ANY problem — no key, timeout,
// HTTP error, invalid JSON — returns the deterministic fallback instead.
// Results always say which path produced them so the UI can label it.
import "server-only";
import { createHash } from "node:crypto";
import { isCropSlug } from "@/lib/crops";
import type { Lang } from "@/lib/i18n";
import { GeminiHttpError, geminiFromEnv, isOutage } from "./gemini";
import { AIUnavailableError, type AIImage, type AIProvider } from "./provider";
import {
  groceryPrompt,
  parseDemandPrompt,
  parseListingPrompt,
  priceExplainPrompt,
} from "./prompts";
import {
  QUALITY_DISCLAIMER,
  groceryListSchema,
  parsedDemandSchema,
  parsedListingSchema,
  priceExplanationSchema,
  type AIResult,
  type GroceryList,
  type ParsedDemand,
  type ParsedListing,
  type QualityCore,
} from "./schemas";
import { parseDemandFallback } from "./fallback/demand-parser";
import { SAMPLE_GROCERY_LIST, parseGroceryFallback } from "./fallback/grocery-parser";
import { isoDay, parseListingFallback } from "./fallback/listing-parser";
import {
  askGemini,
  checkPhotos,
  gradePhotos,
  overallPhotoConfidence,
  readCheck,
  sharedIssues,
  unavailableGrade,
  type CropMatch,
  type Detected,
  type PhotoReading,
} from "./vision";

// Circuit breaker: after a few outages in a row (timeouts, HTTP errors, no
// network) skip the model for a minute, so users get the instant offline
// answer instead of waiting out a timeout on every request.
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;
const breaker = { failures: 0, openUntil: 0 };

/** Clears the breaker (tests). */
export function resetAIBreaker() {
  breaker.failures = 0;
  breaker.openUntil = 0;
}

/**
 * Runs `ai` with the configured provider, falling back on any failure.
 * @param task - label for logs
 */
export async function withFallback<T>(
  task: string,
  ai: (provider: AIProvider) => Promise<T>,
  fallback: () => Promise<T> | T,
): Promise<AIResult<T>> {
  let provider: AIProvider;
  try {
    provider = geminiFromEnv();
  } catch (e) {
    return { data: await fallback(), source: "fallback", note: (e as Error).message };
  }
  if (Date.now() < breaker.openUntil) {
    return { data: await fallback(), source: "fallback", note: "AI paused briefly after repeated errors" };
  }
  try {
    const data = await ai(provider);
    breaker.failures = 0;
    return { data, source: "ai" };
  } catch (e) {
    const err = e as Error;
    // Unusable output is a problem with one answer, not an outage, so it doesn't count.
    if (isOutage(err) && ++breaker.failures >= BREAKER_THRESHOLD) {
      breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
      breaker.failures = 0;
    }
    const note =
      err.name === "TimeoutError" || err.name === "AbortError"
        ? "AI timed out"
        : err instanceof AIUnavailableError
          ? err.message
          : err instanceof GeminiHttpError
            ? err.status === 429
              ? "AI is busy (request limit reached)"
              : `AI service error (${err.status})`
            : "AI response unusable";
    console.warn(`[ai:${task}] using fallback, ${err.message}`);
    return { data: await fallback(), source: "fallback", note };
  }
}

// Repeat questions (same facts, same language) are answered from memory for
// ten minutes. Only real model answers are kept, so a recovered API is used at once.
const ANSWER_TTL_MS = 10 * 60_000;
const answers = new Map<string, { at: number; value: AIResult<unknown> }>();

/**
 * `withFallback` plus a short-lived cache of model answers.
 * @param cacheKey - anything that fully determines the answer (facts, language…)
 */
export async function withFallbackCached<T>(
  task: string,
  cacheKey: string,
  ai: (provider: AIProvider) => Promise<T>,
  fallback: () => Promise<T> | T,
): Promise<AIResult<T>> {
  const key = createHash("sha256").update(task).update("\0").update(cacheKey).digest("hex");
  const hit = answers.get(key);
  if (hit && Date.now() - hit.at < ANSWER_TTL_MS) return hit.value as AIResult<T>;
  const result = await withFallback(task, ai, fallback);
  if (result.source === "ai") {
    answers.set(key, { at: Date.now(), value: result });
    if (answers.size > 300) answers.delete(answers.keys().next().value!);
  }
  return result;
}

/** Clears cached answers (tests). */
export function clearAIAnswers() {
  answers.clear();
}

// Small LRU so preview + submit of the same frames give the same answer and cost one call.
const qualityCache = new Map<string, AIResult<QualityResult>>();

export interface QualityResult extends QualityCore {
  disclaimer: string;
  /** 0–1: how far the score can be trusted (photo sharpness / light). Sets how fast reviews move it. */
  confidence: number;
  /** What the photos show; null when that couldn't be told. */
  detected: Detected | null;
  /** Declared crop vs photos (null when unknown). */
  match: CropMatch | null;
}

/**
 * Visual quality check of 1–4 harvest photos/frames by Gemini. A score is
 * given only when the photos clearly show the declared produce; otherwise,
 * and whenever Gemini isn't available, the result is "not detectable" (score
 * and grade null) with the reason. Photo quality never changes a score.
 * @param frames - image bytes with their MIME types
 * @param crop - declared crop slug, if known
 */
export async function assessQuality(
  frames: { bytes: Buffer; mimeType: string }[],
  crop?: string | null,
): Promise<AIResult<QualityResult>> {
  const key = createHash("sha256");
  frames.forEach((f) => key.update(f.bytes));
  key.update(crop ?? "");
  const cacheKey = key.digest("hex");
  const cached = qualityCache.get(cacheKey);
  if (cached) return cached;

  const checks = await checkPhotos(frames.map((f) => f.bytes)).catch(() => []);
  const issues = sharedIssues(checks);
  const images: AIImage[] = frames.map((f) => ({ mimeType: f.mimeType, base64: f.bytes.toString("base64") }));
  const result = await withFallback<PhotoReading | null>("photo-check", async (p) => readCheck(await askGemini(p, images, crop), crop), () => null);
  const reading = result.data;
  const core = reading ? gradePhotos(reading, crop, issues) : unavailableGrade(issues);
  const final: AIResult<QualityResult> = {
    ...result,
    data: {
      ...core,
      disclaimer: QUALITY_DISCLAIMER,
      // An ungraded check gives the review loop nothing to hold on to.
      confidence: core.score === null ? 0 : overallPhotoConfidence(checks),
      detected: reading?.detected ?? null,
      match: reading?.match ?? null,
    },
  };
  // Only real answers are remembered, so a recovered Gemini is used at once.
  if (reading) {
    qualityCache.set(cacheKey, final);
    if (qualityCache.size > 200) qualityCache.delete(qualityCache.keys().next().value!);
  }
  return final;
}

/**
 * What Gemini sees in photos (e.g. a buyer's review photo), or null when
 * Gemini isn't available or the answer was unusable.
 */
export async function readPhotos(frames: { bytes: Buffer; mimeType: string }[], crop?: string | null): Promise<PhotoReading | null> {
  const images: AIImage[] = frames.map((f) => ({ mimeType: f.mimeType, base64: f.bytes.toString("base64") }));
  return (await withFallback<PhotoReading | null>("photo-check", async (p) => readCheck(await askGemini(p, images, crop), crop), () => null)).data;
}

/** Recomputes `missing` and drops crops outside the catalogue. */
function tidyListing(p: ParsedListing): ParsedListing {
  const crop = p.crop && isCropSlug(p.crop.toLowerCase()) ? p.crop.toLowerCase() : null;
  const fields = { crop, qty: p.qty, unit: p.unit, harvestDate: p.harvestDate, price: p.price };
  const missing = (Object.keys(fields) as (keyof typeof fields)[]).filter((k) => fields[k] === null);
  return { ...fields, missing };
}

/**
 * Structures a spoken listing ("50 kilo tamatar, aaj tode, 25 rupaye kilo").
 * Output is a DRAFT — the farmer always reviews and confirms it.
 * @param lang - BCP-47 speech language, e.g. hi-IN
 */
export async function parseListing(transcript: string, lang: string): Promise<AIResult<ParsedListing>> {
  const today = isoDay(new Date());
  return withFallback(
    "parse-listing",
    async (p) =>
      tidyListing(
        await p.generateJSON({
          task: "parse-listing",
          system: parseListingPrompt.system,
          prompt: parseListingPrompt.user(transcript, lang, today),
          schema: parsedListingSchema,
          temperature: 0,
        }),
      ),
    () => parseListingFallback(transcript),
  );
}

/**
 * Structures a spoken bulk requirement into demand fields (a draft the
 * buyer reviews before posting).
 */
export async function parseDemand(transcript: string, lang: string): Promise<AIResult<ParsedDemand>> {
  return withFallback(
    "parse-demand",
    async (p) => {
      const out = await p.generateJSON({
        task: "parse-demand",
        system: parseDemandPrompt.system,
        prompt: parseDemandPrompt.user(transcript, lang, new Date().toISOString()),
        schema: parsedDemandSchema,
        temperature: 0,
      });
      const crop = out.crop && isCropSlug(out.crop.toLowerCase()) ? out.crop.toLowerCase() : null;
      const deadline = out.deadline && !Number.isNaN(Date.parse(out.deadline)) ? new Date(out.deadline).toISOString() : null;
      const fixed = { ...out, crop, deadline };
      const missing = (["crop", "qtyKg", "targetPrice", "deadline"] as const).filter((k) => fixed[k] === null);
      return { ...fixed, missing: [...missing] };
    },
    () => parseDemandFallback(transcript),
  );
}

/**
 * Reads a grocery list from text or a photo.
 * Without a vision model a photo can't be read, so the fallback returns a
 * clearly-labelled sample basket for the shopper to edit.
 */
export async function parseGrocery(input: {
  text?: string;
  image?: { bytes: Buffer; mimeType: string };
}): Promise<AIResult<GroceryList> & { sample?: boolean }> {
  let usedSample = false;
  const result = await withFallback(
    "parse-grocery-list",
    (p) =>
      p.generateJSON({
        task: "parse-grocery-list",
        system: groceryPrompt.system,
        prompt: groceryPrompt.user(input.text),
        images: input.image ? [{ mimeType: input.image.mimeType, base64: input.image.bytes.toString("base64") }] : undefined,
        schema: groceryListSchema,
      }),
    () => {
      if (input.text?.trim()) {
        const parsed = parseGroceryFallback(input.text);
        if (parsed.items.length) return parsed;
      }
      usedSample = true;
      return SAMPLE_GROCERY_LIST;
    },
  );
  return { ...result, sample: usedSample };
}

/**
 * Turns computed price facts into farmer-friendly sentences.
 * @param facts - newline-separated numeric facts
 * @param fallbackBasis - deterministic sentences used when AI is unavailable
 * @param lang - language the farmer reads (the model writes in it)
 */
export async function explainPrice(facts: string, fallbackBasis: string[], lang: Lang = "en"): Promise<AIResult<string[]>> {
  return withFallbackCached(
    "price-advice",
    `${lang}\n${facts}`,
    async (p) =>
      (
        await p.generateJSON({
          task: "price-advice",
          system: priceExplainPrompt.system,
          prompt: priceExplainPrompt.user(facts, lang),
          schema: priceExplanationSchema,
        })
      ).basis,
    () => fallbackBasis,
  );
}
