// GET /api/auth/me — the signed-in user's public profile (or null).
// PATCH /api/auth/me — update preferences such as UI language.
import { z } from "zod";
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { langSchema } from "@/lib/validators/common";
import { publicUser } from "@/lib/auth/public-user";

/** Returns the current user, or `null` when signed out. */
export const GET = handler({}, async ({ user }) => (user ? publicUser(user) : null));

const patchSchema = z.object({
  language: langSchema.optional(),
  address: z.string().trim().max(200).optional(),
  area: z.string().trim().max(60).optional(),
});

/** Updates language/address preferences for the signed-in user. */
export const PATCH = handler({ roles: [], body: patchSchema }, async ({ user, body }) => {
  const updated = await db.user.update({ where: { id: user.id }, data: body });
  return publicUser(updated);
});
