// Offline visual heuristic for harvest photos. Decodes each frame with
// sharp, downsamples to 64×64 and measures colour saturation, exposure,
// brown/dark blotch coverage and detail (a blur proxy). It is deliberately
// labelled a heuristic — it flags things for a human, it proves nothing.
import "server-only";
import { createHash } from "node:crypto";
import type { QualityCore, QualityFlag } from "../schemas";

interface FrameStats {
  brightness: number; // 0–1
  saturation: number; // 0–1
  darkSpots: number; // share of very dark, low-saturation pixels
  brownSpots: number; // share of brownish pixels (bruise/rot proxy)
  detail: number; // mean absolute neighbour difference, 0–1
}

/** RGB → HSV (h in degrees, s/v in 0–1). */
function hsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

async function frameStats(buf: Buffer): Promise<FrameStats> {
  const sharp = (await import("sharp")).default;
  const size = 64;
  const { data } = await sharp(buf).rotate().resize(size, size, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let bright = 0;
  let sat = 0;
  let dark = 0;
  let brown = 0;
  let detail = 0;
  const px = size * size;
  for (let i = 0; i < px; i++) {
    const r = data[i * 3] / 255;
    const g = data[i * 3 + 1] / 255;
    const b = data[i * 3 + 2] / 255;
    const { h, s, v } = hsv(r, g, b);
    bright += v;
    sat += s;
    if (v < 0.18 && s < 0.5) dark++;
    // Muddy browns: orange-ish hue, mid-low value, muted saturation.
    if (h >= 15 && h <= 45 && v > 0.18 && v < 0.55 && s > 0.25 && s < 0.75) brown++;
    if (i % size !== 0) {
      const p = (i - 1) * 3;
      detail += (Math.abs(data[i * 3] - data[p]) + Math.abs(data[i * 3 + 1] - data[p + 1]) + Math.abs(data[i * 3 + 2] - data[p + 2])) / (3 * 255);
    }
  }
  return { brightness: bright / px, saturation: sat / px, darkSpots: dark / px, brownSpots: brown / px, detail: detail / px };
}

/**
 * Scores 1–4 frames without a model.
 * @param frames - raw image bytes
 * @param crop - optional crop slug; brown is normal for onions/potatoes so it's not penalised there
 */
export async function qualityHeuristic(frames: Buffer[], crop?: string | null): Promise<QualityCore> {
  let stats: FrameStats[];
  try {
    stats = await Promise.all(frames.map(frameStats));
  } catch {
    // Undecodable input: deterministic, conservative score from the bytes' hash.
    const h = createHash("sha256");
    frames.forEach((f) => h.update(f));
    const n = parseInt(h.digest("hex").slice(0, 4), 16);
    const score = 62 + (n % 15);
    return { score, grade: score >= 70 ? "B" : "C", flags: ["low_light"], summary: "Photos could not be analysed in detail; an admin will review them manually." };
  }
  const avg = (k: keyof FrameStats) => stats.reduce((s, f) => s + f[k], 0) / stats.length;
  const brightness = avg("brightness");
  const saturation = avg("saturation");
  const darkSpots = avg("darkSpots");
  const brownSpots = avg("brownSpots");
  const detail = avg("detail");
  const earthy = crop === "onion" || crop === "potato";

  const flags: QualityFlag[] = [];
  let score = 78;
  score += Math.min(14, saturation * 30); // vivid produce reads as fresh
  score -= Math.abs(brightness - 0.55) * 30; // poor exposure hides defects
  if (brightness < 0.28) flags.push("low_light");
  if (detail < 0.025) {
    flags.push("blurry_photo");
    score -= 6;
  }
  if (!earthy && brownSpots > 0.12) {
    flags.push(brownSpots > 0.25 ? "rot_spots" : "bruising");
    score -= brownSpots * 60;
  }
  if (darkSpots > 0.15 && brightness > 0.3) {
    flags.push("minor_blemishes");
    score -= darkSpots * 25;
  }
  if (crop === "spinach" && saturation < 0.25) {
    flags.push("wilting");
    score -= 8;
  }
  score = Math.round(Math.max(35, Math.min(96, score)));
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : "C";

  const tone = saturation > 0.45 ? "Rich, even colour" : saturation > 0.28 ? "Moderate colour" : "Muted colour";
  const issues = flags.length
    ? `Worth a closer look: ${flags.map((f) => f.replace(/_/g, " ")).join(", ")}.`
    : "No obvious blemishes in the sampled frames.";
  return { score, grade, flags, summary: `${tone} across ${frames.length} frame${frames.length > 1 ? "s" : ""}. ${issues}` };
}
