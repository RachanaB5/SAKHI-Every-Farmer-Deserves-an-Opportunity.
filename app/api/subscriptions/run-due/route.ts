// /api/subscriptions/run-due — places every due subscription order.
// Called by a scheduler (Vercel Cron sends GET with
// `Authorization: Bearer $CRON_SECRET`) or by an admin from Controls.
import type { NextRequest } from "next/server";
import { handler, HttpError } from "@/lib/api";
import type { User } from "@prisma/client";
import { audit } from "@/lib/audit";
import { runDueSubscriptions } from "@/lib/subscriptions";

/** Admin session, or the cron bearer secret when one is configured. */
function authorise(req: NextRequest, user: User | null) {
  if (user?.role === "ADMIN") return;
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return;
  throw new HttpError(user ? 403 : 401, "Only admins or the scheduler can run subscriptions");
}

async function run({ req, user }: { req: NextRequest; user: User | null }) {
  authorise(req, user);
  const summary = await runDueSubscriptions();
  await audit({ actorId: user?.id ?? null, action: "SUBSCRIPTIONS_RUN", entity: "Subscription", entityId: new Date().toISOString(), meta: { due: summary.due, placed: summary.placed, skipped: summary.skipped } });
  return summary;
}

/** Scheduler entry point. */
export const GET = handler({}, run);
/** Manual entry point (admin). */
export const POST = handler({}, run);
