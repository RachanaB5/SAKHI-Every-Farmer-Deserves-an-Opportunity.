// /api/demands
//   GET  bulk buyer: their requirements · farmer: open requirements nearby · admin: all
//   POST bulk buyer: post one or more requirements (form, voice or list)
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { createDemands, demandInclude, farmerDemandFeed, serializeDemand } from "@/lib/bulk";
import { createDemandsInput } from "@/lib/validators/bulk";
import type { z } from "zod";

/** Role-aware list. */
export const GET = handler({ roles: ["BULK_BUYER", "FARMER", "ADMIN"] }, async ({ user }) => {
  if (user.role === "FARMER") return farmerDemandFeed(user);
  const rows = await db.demandRequest.findMany({
    where: user.role === "ADMIN" ? {} : { buyerId: user.id },
    include: demandInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  return rows.map((d) => serializeDemand(d, user));
});

/** Creates requirements; returns their ids. */
export const POST = handler<z.infer<typeof createDemandsInput>>({ roles: ["BULK_BUYER"], body: createDemandsInput }, async ({ user, body }) => {
  const created = await createDemands(user, body.demands);
  return { ids: created.map((d) => d.id) };
});
