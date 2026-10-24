// /api/demands/[id]
//   GET   requirement with offers (buyer sees all, farmers only their own)
//   PATCH buyer: close the requirement or stop it repeating
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { loadDemand, serializeDemand } from "@/lib/bulk";
import { publish } from "@/lib/events";

type Params = { id: string };

/** Detail view. */
export const GET = handler<undefined, undefined, Params>({ roles: ["BULK_BUYER", "FARMER", "ADMIN"] }, async ({ user, params }) => {
  const d = await loadDemand(params.id);
  if (user.role === "BULK_BUYER" && d.buyerId !== user.id) throw new HttpError(403, "Not your requirement");
  return serializeDemand(d, user);
});

const patch = z.object({ close: z.boolean().optional(), recurring: z.boolean().optional() });

/** Closes / pauses repetition. Closing declines open offers. */
export const PATCH = handler<z.infer<typeof patch>, undefined, Params>({ roles: ["BULK_BUYER"], body: patch }, async ({ user, params, body }) => {
  const d = await loadDemand(params.id);
  if (d.buyerId !== user.id) throw new HttpError(403, "Not your requirement");
  await db.$transaction([
    db.demandRequest.update({
      where: { id: d.id },
      data: { ...(body.close && d.status === "OPEN" ? { status: "CLOSED" } : {}), ...(body.recurring !== undefined ? { recurring: body.recurring } : {}) },
    }),
    ...(body.close ? [db.offer.updateMany({ where: { demandId: d.id, status: { in: ["PENDING", "COUNTERED"] } }, data: { status: "REJECTED" } })] : []),
  ]);
  publish({ type: "demand.updated", id: d.id, roles: ["FARMER", "ADMIN"], userIds: [user.id] });
  return { ok: true };
});
