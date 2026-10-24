// POST /api/ai/parse-listing — turns a spoken/typed harvest description
// into draft listing fields { crop, qty, unit, harvestDate, price, missing }.
// The result is never published directly; the farmer reviews every field.
import { parseListing } from "@/lib/ai";
import { handler } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { parseListingInput, type ParseListingInput } from "@/lib/validators/batch";

/** Parses the transcript (AI when configured, offline parser otherwise). */
export const POST = handler<ParseListingInput>({ roles: ["FARMER"], body: parseListingInput }, async ({ user, body }) => {
  rateLimit(`ai:parse-listing:${user.id}`, 30, 60_000);
  const result = await parseListing(body.transcript, body.lang);
  return { ...result.data, source: result.source, note: result.note };
});
