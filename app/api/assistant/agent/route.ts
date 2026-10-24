// GET /api/assistant/agent — Sakhi's order autopilot feed for the farmer:
// unread order news to read aloud, and who is waiting at the farm. Each
// call also catches up (books riders that weren't free before, takes over
// orders from before the autopilot was on). Polled by the Sakhi panel.
import { handler } from "@/lib/api";
import { agentFeed } from "@/lib/assistant/autopilot";

/** { autopilot, messages, tasks }; empty when the autopilot is off. */
export const GET = handler({ roles: ["FARMER"] }, async ({ user }) => agentFeed(user.id));
