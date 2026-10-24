// GET /api/deliveries — the signed-in rider's runs: active first, then
// today's completed handovers.
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { orderInclude, serializeOrder } from "@/lib/orders/queries";

/** Active (assigned / picked up) runs plus today's deliveries. */
export const GET = handler({ roles: ["DELIVERY"] }, async ({ user }) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const orders = await db.order.findMany({
    where: {
      delivery: {
        workerId: user.id,
        OR: [{ status: { in: ["ASSIGNED", "PICKED_UP"] } }, { status: "DELIVERED", verifiedAt: { gte: startOfDay } }],
      },
    },
    include: orderInclude,
    orderBy: { updatedAt: "desc" },
  });
  const rows = orders.map((o) => serializeOrder(o, user));
  return {
    active: rows.filter((o) => o.delivery && ["ASSIGNED", "PICKED_UP"].includes(o.delivery.status)),
    done: rows.filter((o) => o.delivery?.status === "DELIVERED"),
  };
});
