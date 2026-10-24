// PATCH /api/admin/users/[id] — platform controls on a user account:
// suspend / reinstate (any role except admins) and rider availability.
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";

type Params = { id: string };
const body = z.object({ suspended: z.boolean().optional(), isAvailable: z.boolean().optional() });

/** Applies the change and audit-logs it. Suspending also pauses a farmer's listings. */
export const PATCH = handler<z.infer<typeof body>, undefined, Params>({ roles: ["ADMIN"], body }, async ({ user, params, body }) => {
  const target = await db.user.findUnique({ where: { id: params.id } });
  if (!target) throw new HttpError(404, "User not found");
  if (target.role === "ADMIN" && body.suspended) throw new HttpError(400, "Admins can't be suspended here");
  await db.$transaction([
    db.user.update({ where: { id: target.id }, data: body }),
    ...(body.suspended && target.role === "FARMER" ? [db.listing.updateMany({ where: { farmerId: target.id, status: "ACTIVE" }, data: { status: "PAUSED" } })] : []),
  ]);
  await audit({ actorId: user.id, action: body.suspended !== undefined ? (body.suspended ? "USER_SUSPENDED" : "USER_REINSTATED") : "RIDER_AVAILABILITY", entity: "User", entityId: target.id, meta: body });
  return { id: target.id, ...body };
});
