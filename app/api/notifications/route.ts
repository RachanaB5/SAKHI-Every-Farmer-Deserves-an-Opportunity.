// GET /api/notifications — the signed-in user's latest notifications and
// unread count (the farmer's bell: complaints and grade changes).
import { handler } from "@/lib/api";
import { listNotifications } from "@/lib/notifications";

/** Latest 30 notifications, newest first. */
export const GET = handler({ roles: [] }, async ({ user }) => listNotifications(user.id));
