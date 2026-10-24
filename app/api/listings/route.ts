// GET /api/listings — marketplace browse for buyers (search, filters, sort).
import { z } from "zod";
import { handler } from "@/lib/api";
import { browseListings } from "@/lib/listings";

const query = z.object({
  q: z.string().trim().max(60).optional(),
  crop: z.string().max(20).optional(),
  category: z.string().max(20).optional(),
  maxPrice: z.coerce.number().positive().max(100_000).optional(),
  freshDays: z.coerce.number().int().min(1).max(30).optional(),
  gradeA: z
    .enum(["1", "0", "true", "false"])
    .transform((v) => v === "1" || v === "true")
    .optional(),
  sort: z.enum(["nearest", "price", "fresh", "quality"]).optional(),
  farmerId: z.string().max(40).optional(),
});

/** Lists live listings visible to the signed-in buyer. */
export const GET = handler<undefined, z.infer<typeof query>>(
  { roles: ["CONSUMER", "BULK_BUYER", "ADMIN"], query },
  async ({ user, query }) => browseListings(user, query),
);
