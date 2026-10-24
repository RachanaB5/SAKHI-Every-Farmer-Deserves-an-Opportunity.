// POST /api/ai/parse-grocery-list — reads a grocery list from a photo
// (multipart `image`) or text (JSON { text }) → { items: [{name, qty, unit}] }.
// Without a vision model, photos return a clearly-flagged sample list.
import { z } from "zod";
import { parseGrocery } from "@/lib/ai";
import { handler, HttpError } from "@/lib/api";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, normaliseForAI } from "@/lib/media";
import { rateLimit } from "@/lib/rate-limit";

const textInput = z.object({ text: z.string().trim().min(2, "Write or say a few items").max(2000) });

/** Parses the list (AI when configured, offline parser otherwise). */
export const POST = handler({ roles: ["CONSUMER", "BULK_BUYER"] }, async ({ req, user }) => {
  rateLimit(`ai:grocery:${user.id}`, 20, 60_000);
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const { text } = textInput.parse(await req.json());
    const r = await parseGrocery({ text });
    return { ...r.data, source: r.source, sample: r.sample ?? false, note: r.note };
  }
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Send JSON { text } or a multipart image");
  });
  const file = form.get("image");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a photo of your list");
  if (!IMAGE_TYPES.includes(file.type)) throw new HttpError(415, "Use a JPG, PNG or WebP photo");
  if (file.size > MAX_IMAGE_BYTES) throw new HttpError(413, "Photo must be under 12 MB");
  const bytes = await normaliseForAI(Buffer.from(await file.arrayBuffer()));
  const r = await parseGrocery({ image: { bytes, mimeType: "image/jpeg" } });
  return { ...r.data, source: r.source, sample: r.sample ?? false, note: r.note };
});
