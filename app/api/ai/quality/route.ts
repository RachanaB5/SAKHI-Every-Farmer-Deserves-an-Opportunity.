// POST /api/ai/quality — visual quality check of 1–4 harvest images.
//   JSON      { batchId }              → checks that batch's stored media
//   multipart images[] (+ crop field)  → checks the uploaded images
// Returns { score, grade, flags, summary, disclaimer, source }. This is a
// preview; the authoritative score is recomputed when a batch is submitted.
import { z } from "zod";
import { assessQuality } from "@/lib/ai";
import { handler, HttpError } from "@/lib/api";
import { assessBatchMedia, loadBatch, MAX_AI_FRAMES } from "@/lib/batches";
import { CROP_SLUGS } from "@/lib/crops";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, normaliseForAI } from "@/lib/media";
import { rateLimit } from "@/lib/rate-limit";

const jsonInput = z.object({ batchId: z.string().min(1) });
const cropInput = z.enum(CROP_SLUGS).nullable();

/** Runs the check (AI when configured, offline heuristic otherwise). */
export const POST = handler({ roles: ["FARMER", "ADMIN"] }, async ({ req, user }) => {
  rateLimit(`ai:quality:${user.id}`, 20, 60_000);
  const type = req.headers.get("content-type") ?? "";

  if (type.includes("application/json")) {
    const { batchId } = jsonInput.parse(await req.json());
    const batch = await loadBatch(batchId, user, user.role === "ADMIN" ? "read" : "owner");
    const result = await assessBatchMedia(batch.crop, batch.media);
    return { ...result.data, source: result.source, note: result.note };
  }

  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Send JSON { batchId } or multipart images");
  });
  const files = form.getAll("images").filter((f): f is File => f instanceof File);
  if (files.length < 1 || files.length > MAX_AI_FRAMES) throw new HttpError(400, `Send 1–${MAX_AI_FRAMES} images`);
  for (const f of files) {
    if (!IMAGE_TYPES.includes(f.type)) throw new HttpError(415, "Images only (JPG, PNG, WebP)");
    if (f.size > MAX_IMAGE_BYTES) throw new HttpError(413, "Each image must be under 12 MB");
  }
  const crop = cropInput.parse((form.get("crop") as string | null) || null);
  const frames = await Promise.all(
    files.map(async (f) => ({ bytes: await normaliseForAI(Buffer.from(await f.arrayBuffer())), mimeType: "image/jpeg" })),
  );
  const result = await assessQuality(frames, crop);
  return { ...result.data, source: result.source, note: result.note };
});
