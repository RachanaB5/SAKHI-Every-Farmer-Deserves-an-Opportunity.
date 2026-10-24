// Photo-quality check: is the picture sharp and well lit enough to judge the
// produce? The answer ONLY sets how confident the quality score is (how fast
// customer reviews can move it); it never changes the score itself, so a
// farmer with a budget phone or dusk light isn't graded down for the camera.
import "server-only";

export type PhotoIssue = "blurry_photo" | "low_light" | "overexposed";

export interface PhotoCheck {
  /** 99th percentile of the edge response at 256 px (higher = sharper). */
  sharpness: number;
  /** Mean luminance, 0–1. */
  brightness: number;
  /** Share of pixels crushed to black or blown to white. */
  clipped: number;
  issues: PhotoIssue[];
  /** 0.3–1: how much this photo can be trusted for a quality judgement. */
  confidence: number;
}

/**
 * Calibrated on the seed photos: originals measure 0.24–1.25, a 2 px blur at
 * a 256 px scale 0.05–0.13, a 3 px blur 0.03–0.08 (tests/photo-quality.test.ts).
 */
export const SHARP_EDGE = 0.3;
export const BLURRY_EDGE = 0.06;
const SIZE = 256;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Pure scoring of grey pixels (0–255, row-major); exported for tests. */
export function measureGrey(grey: Uint8Array | Buffer, width: number, height: number): PhotoCheck {
  const n = width * height;
  let sum = 0;
  let clipped = 0;
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < n; i++) {
    const v = grey[i];
    sum += v;
    hist[v]++;
    if (v <= 8 || v >= 247) clipped++;
  }
  const percentile = (q: number) => {
    let seen = 0;
    for (let v = 0; v < 256; v++) if ((seen += hist[v]) >= q * n) return v;
    return 255;
  };

  // Keep the heuristic forgiving for real farm photos: blur is a secondary
  // signal, and dim-but-clear produce should not be treated as blurry.
  const range = Math.max(24, percentile(0.98) - percentile(0.02));
  const edges: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      edges.push(Math.abs(4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - width] - grey[i + width]) / range);
    }
  }
  edges.sort((a, b) => a - b);
  const sharpness = edges.length ? edges[Math.floor(edges.length * 0.99)] : 0;
  const brightness = sum / n / 255;
  const clippedShare = clipped / n;

  const issues: PhotoIssue[] = [];
  const sharpScore = clamp01((Math.log(sharpness + 1e-6) - Math.log(BLURRY_EDGE)) / (Math.log(SHARP_EDGE) - Math.log(BLURRY_EDGE)));
  const isDark = brightness < 0.2;
  const isBright = brightness > 0.9;

  // Clear produce photos are still valid even when the phone is slightly dim.
  if (!isDark && sharpScore < 0.35) issues.push("blurry_photo");

  let light = 1;
  if (brightness < 0.3) light = 0.5 + 0.5 * clamp01((brightness - 0.1) / 0.2);
  else if (brightness > 0.82) light = 1 - 0.5 * clamp01((brightness - 0.82) / 0.12);

  if (brightness < 0.18) issues.push("low_light");
  if (isBright || clippedShare > 0.35) issues.push("overexposed");
  if (clippedShare > 0.28) light *= 0.8;

  const confidence = Math.min(1, Math.max(0.45, 0.35 + 0.65 * sharpScore * light));
  return {
    sharpness: Math.round(sharpness * 1000) / 1000,
    brightness: Math.round(brightness * 1000) / 1000,
    clipped: Math.round(clippedShare * 1000) / 1000,
    issues,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/** Checks one encoded photo at 256 px. */
export async function checkPhoto(bytes: Buffer): Promise<PhotoCheck> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(bytes).rotate().resize(SIZE, SIZE, { fit: "inside" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return measureGrey(data, info.width, info.height);
}
