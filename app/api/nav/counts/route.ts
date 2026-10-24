// GET /api/nav/counts — small live counters for nav badges.
import { db } from "@/lib/db";
import { handler } from "@/lib/api";

/** Admin: batches awaiting review. Delivery: active assigned runs. */
export const GET = handler({ roles: ["ADMIN", "DELIVERY"] }, async ({ user }) => {
  if (user.role === "ADMIN") {
    return { review: await db.batch.count({ where: { status: "PENDING_REVIEW" } }) };
  }
  return {
    runs: await db.delivery.count({
      where: { workerId: user.id, status: { in: ["ASSIGNED", "PICKED_UP"] } },
    }),
  };
});
