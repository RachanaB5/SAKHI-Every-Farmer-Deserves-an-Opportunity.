// Farmer reliability score (0–1), used in bulk offer ranking and shown to
// buyers and admins: 60% fulfilment rate (handed over vs. cancelled /
// disputed) + 40% average buyer rating. Recomputed after handovers,
// cancellations and feedback.
import "server-only";
import { db } from "@/lib/db";
import { round2 } from "@/lib/fees";

/** Recomputes and stores a farmer's reliability; returns the new value. */
export async function recomputeReliability(farmerId: string): Promise<number> {
  const [done, failed, rating] = await Promise.all([
    db.order.count({ where: { farmerId, status: { in: ["DELIVERED", "COLLECTED"] } } }),
    db.order.count({ where: { farmerId, OR: [{ status: "DISPUTED" }, { status: "CANCELLED", events: { some: { actorId: farmerId, status: "CANCELLED" } } }] } }),
    db.feedback.aggregate({ where: { order: { farmerId } }, _avg: { rating: true }, _count: true }),
  ]);
  const total = done + failed;
  // New farmers start from a neutral prior instead of 0 or 1.
  const fulfilment = total ? done / total : 0.9;
  const ratingScore = rating._count ? (rating._avg.rating ?? 4) / 5 : 0.85;
  const score = round2(Math.max(0.3, Math.min(1, 0.6 * fulfilment + 0.4 * ratingScore)));
  await db.user.update({ where: { id: farmerId }, data: { reliabilityScore: score } });
  return score;
}
