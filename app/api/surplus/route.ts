// GET /api/surplus — the farmer's live listings with at-risk flags,
// reasons and rescue suggestions (open demands, price drop, mandi).
import { handler } from "@/lib/api";
import { detectSurplus } from "@/lib/surplus";

/** At-risk listings first, most urgent first. */
export const GET = handler({ roles: ["FARMER"] }, async ({ user }) => detectSurplus(user.id));
