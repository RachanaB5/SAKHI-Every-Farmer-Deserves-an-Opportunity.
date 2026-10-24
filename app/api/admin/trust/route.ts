// GET /api/admin/trust — duplicate-photo flags, farmers with repeated
// complaints, price outliers and suspended accounts.
import { handler } from "@/lib/api";
import { trustReport } from "@/lib/trust";

/** Returns the trust & safety report. */
export const GET = handler({ roles: ["ADMIN"] }, async () => trustReport());
