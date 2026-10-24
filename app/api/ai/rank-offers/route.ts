// POST /api/ai/rank-offers { demandId } — scores every live offer on
// delivered cost, coverage, ETA vs deadline, quality, distance and farmer
// reliability, with a one-line reason each (AI or deterministic fallback).
import { z } from "zod";
import { handler, HttpError } from "@/lib/api";
import { loadDemand, rankDemandOffers } from "@/lib/bulk";
import { rateLimit } from "@/lib/rate-limit";

const body = z.object({ demandId: z.string().min(1) });

/** Returns [{ offerId, score, reason, factors }] best first, plus the source. */
export const POST = handler<z.infer<typeof body>>({ roles: ["BULK_BUYER", "ADMIN"], body }, async ({ user, body }) => {
  rateLimit(`ai:rank:${user.id}`, 30, 60_000);
  const d = await loadDemand(body.demandId);
  if (user.role === "BULK_BUYER" && d.buyerId !== user.id) throw new HttpError(403, "Not your requirement");
  return rankDemandOffers(d.id);
});
