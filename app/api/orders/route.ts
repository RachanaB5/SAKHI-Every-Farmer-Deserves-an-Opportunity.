// GET /api/orders — the signed-in user's orders: buyers see what they
// bought, farmers what they sold, admins everything (filterable).
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { caseVariants } from "@/lib/search";
import { orderInclude, serializeOrder } from "@/lib/orders/queries";
import { IN_FLIGHT } from "@/lib/orders/state";

const query = z.object({
  scope: z.enum(["active", "past", "all"]).default("all"),
  status: z.string().max(30).optional(),
  type: z.enum(["RETAIL", "BULK"]).optional(),
  q: z.string().trim().max(30).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

/** Newest first. */
export const GET = handler<undefined, z.infer<typeof query>>({ roles: ["CONSUMER", "BULK_BUYER", "FARMER", "ADMIN"], query }, async ({ user, query }) => {
  const where: Prisma.OrderWhereInput = {
    ...(user.role === "FARMER" ? { farmerId: user.id } : user.role === "ADMIN" ? {} : { buyerId: user.id }),
    ...(query.scope === "active" && { status: { in: IN_FLIGHT } }),
    ...(query.scope === "past" && { status: { notIn: IN_FLIGHT } }),
    ...(query.status && { status: query.status as Prisma.EnumOrderStatusFilter["equals"] }),
    ...(query.type && { type: query.type }),
    ...(query.q && { OR: [{ code: { contains: query.q.toUpperCase() } }, ...caseVariants(query.q).flatMap((v) => [{ buyer: { name: { contains: v } } }, { farmer: { name: { contains: v } } }])] }),
  };
  const orders = await db.order.findMany({ where, include: orderInclude, orderBy: { createdAt: "desc" }, take: query.limit });
  return orders.map((o) => serializeOrder(o, user));
});
