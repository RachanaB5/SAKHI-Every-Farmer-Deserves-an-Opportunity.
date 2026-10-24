// POST /api/orders/[id]/arrival { stage } — a self-pickup buyer is on the
// way ("coming": the farmer hears how many minutes away) or at the farm
// ("here": the farmer is asked for their code).
import { z } from "zod";
import { handler } from "@/lib/api";
import { buyerArrival } from "@/lib/delivery/arrival";
import { rateLimit } from "@/lib/rate-limit";

type Params = { id: string };
const body = z.object({ stage: z.enum(["coming", "here"]) });

/** The order's buyer only, while it is ready for pickup. */
export const POST = handler<z.infer<typeof body>, undefined, Params>({ roles: ["CONSUMER", "BULK_BUYER"], body }, async ({ user, params, body }) => {
  rateLimit(`arrival:${user.id}`, 10, 10 * 60_000);
  return buyerArrival(params.id, user, body.stage);
});
