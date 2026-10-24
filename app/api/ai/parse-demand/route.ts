// POST /api/ai/parse-demand { transcript, lang } — structures a spoken bulk
// requirement (crop, kg, target price, deadline, urgent, recurring). The
// buyer reviews and edits before posting.
import { parseDemand } from "@/lib/ai";
import { handler } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { parseListingInput, type ParseListingInput } from "@/lib/validators/batch";

/** Draft demand fields + what's missing. */
export const POST = handler<ParseListingInput>({ roles: ["BULK_BUYER"], body: parseListingInput }, async ({ user, body }) => {
  rateLimit(`ai:parse-demand:${user.id}`, 30, 60_000);
  const r = await parseDemand(body.transcript, body.lang);
  return { ...r.data, source: r.source };
});
