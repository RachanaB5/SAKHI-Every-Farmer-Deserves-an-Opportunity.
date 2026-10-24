// GET /api/admin/deliveries — fulfilment operations: riders (availability,
// load), active runs, failed handovers and the OTP / QR attempt log.
import { db } from "@/lib/db";
import { handler } from "@/lib/api";

/** Delivery ops snapshot. */
export const GET = handler({ roles: ["ADMIN"] }, async () => {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const [riders, active, attempts, problems, areas] = await Promise.all([
    db.user.findMany({
      where: { role: "DELIVERY" },
      select: {
        id: true,
        name: true,
        area: true,
        phone: true,
        isAvailable: true,
        deliveries: {
          where: {
            OR: [
              { status: { in: ["ASSIGNED", "PICKED_UP"] } },
              { status: "DELIVERED", verifiedAt: { gte: startToday } },
            ],
          },
          select: { status: true },
        },
      },
    }),
    db.delivery.findMany({
      where: { status: { in: ["UNASSIGNED", "ASSIGNED", "PICKED_UP"] } },
      include: {
        order: {
          select: {
            id: true,
            code: true,
            area: true,
            status: true,
            fulfilment: true,
            farmer: { select: { name: true } },
            buyer: { select: { name: true, orgName: true } },
          },
        },
        worker: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.deliveryAttempt.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        delivery: { select: { mode: true, order: { select: { id: true, code: true } } } },
      },
    }),
    db.delivery.findMany({
      where: { failureReason: { not: null } },
      include: {
        order: { select: { id: true, code: true, area: true, status: true } },
        worker: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.serviceArea.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);
  const actorIds = [...new Set(attempts.map((a) => a.actorId).filter(Boolean) as string[])];
  const actors = new Map(
    (
      await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, role: true },
      })
    ).map((u) => [u.id, u]),
  );
  return {
    riders: riders.map((r) => ({
      id: r.id,
      name: r.name,
      area: r.area,
      phone: r.phone,
      isAvailable: r.isAvailable,
      activeRuns: r.deliveries.filter((d) => d.status !== "DELIVERED").length,
      deliveredToday: r.deliveries.filter((d) => d.status === "DELIVERED").length,
    })),
    areas: areas.map((area) => area.name),
    active: active.map((d) => ({
      orderId: d.order.id,
      code: d.order.code,
      area: d.order.area,
      orderStatus: d.order.status,
      mode: d.mode,
      status: d.status,
      farmer: d.order.farmer.name,
      buyer: d.order.buyer.orgName ?? d.order.buyer.name,
      worker: d.worker,
      otpAttempts: d.otpAttempts,
      otpActive: Boolean(d.otpHash && d.otpExpiresAt && d.otpExpiresAt > new Date()),
      assignedAt: d.assignedAt?.toISOString() ?? null,
      pickedUpAt: d.pickedUpAt?.toISOString() ?? null,
    })),
    problems: problems.map((p) => ({
      orderId: p.order.id,
      code: p.order.code,
      area: p.order.area,
      orderStatus: p.order.status,
      reason: p.failureReason,
      worker: p.worker?.name ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
    attempts: attempts.map((a) => ({
      id: a.id,
      code: a.delivery.order.code,
      orderId: a.delivery.order.id,
      mode: a.delivery.mode,
      method: a.method,
      success: a.success,
      reason: a.reason,
      actor: a.actorId ? (actors.get(a.actorId)?.name ?? "-") : "-",
      actorRole: a.actorId ? (actors.get(a.actorId)?.role ?? null) : null,
      createdAt: a.createdAt.toISOString(),
    })),
  };
});
