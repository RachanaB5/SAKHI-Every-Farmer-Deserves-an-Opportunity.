// POST /api/notifications/read — marks notifications read.
//   { ids: string[] } → those; {} → all of the user's notifications
import { z } from "zod";
import { handler } from "@/lib/api";
import { markNotificationsRead } from "@/lib/notifications";

const body = z.object({ ids: z.array(z.string().min(1)).max(100).optional() });

/** Returns how many were newly marked read. */
export const POST = handler<z.infer<typeof body>>({ roles: [], body }, async ({ user, body }) => ({ marked: await markNotificationsRead(user.id, body.ids) }));
