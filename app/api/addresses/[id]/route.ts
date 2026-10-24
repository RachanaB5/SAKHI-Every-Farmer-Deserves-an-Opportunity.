// /api/addresses/:id — switch to a saved address (PATCH) or remove it (DELETE).
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, must } from "@/lib/api";
import { activateAddress } from "@/lib/addresses";

const ROLES = ["FARMER", "CONSUMER", "BULK_BUYER"] as const;
const body = z.object({ action: z.literal("activate") });

/** Makes the address the active location. */
export const PATCH = handler<z.infer<typeof body>, undefined, { id: string }>({ roles: [...ROLES], body }, async ({ user, params }) => {
  const address = must(await db.address.findFirst({ where: { id: params.id, userId: user.id } }), "Address not found");
  await activateAddress(user.id, address);
  return { activeId: address.id };
});
/** Deletes a saved address (the active location on the profile is left as it is). */
export const DELETE = handler<undefined, undefined, { id: string }>({ roles: [...ROLES] }, async ({ user, params }) => {
  const res = await db.address.deleteMany({ where: { id: params.id, userId: user.id } });
  must(res.count ? true : null, "Address not found");
  return { deleted: true };
});
