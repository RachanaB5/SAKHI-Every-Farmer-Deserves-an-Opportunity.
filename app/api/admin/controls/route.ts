// /api/admin/controls — platform controls.
// GET   → settings (with ranges), service areas, cold-chain categories,
//         pending payouts, the last payout run and the subscription queue.
// PATCH → one change: a setting value, a service area (active / base fee),
//         or a special category's availability in one area. Audit-logged.
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { round2 } from "@/lib/fees";
import { allSettings, SETTING_DEFS, SETTING_KEYS } from "@/lib/settings";

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("setting"), key: z.enum(SETTING_KEYS), value: z.number().finite() }),
  z.object({ kind: z.literal("area"), id: z.string().min(1), active: z.boolean().optional(), baseDeliveryFee: z.number().min(0).max(200).optional() }),
  z.object({ kind: z.literal("category"), slug: z.string().min(1), area: z.string().min(1), enabled: z.boolean() }),
]);

/** Everything the controls page shows. */
export const GET = handler({ roles: ["ADMIN"] }, async () => {
  const now = new Date();
  const [values, areas, categories, pending, lastRun, subsActive, subsDue, nextSub] = await Promise.all([
    allSettings(),
    db.serviceArea.findMany({ orderBy: [{ isPilot: "desc" }, { name: "asc" }] }),
    db.category.findMany({ where: { special: true }, orderBy: { sortOrder: "asc" } }),
    db.settlement.aggregate({ where: { status: "PENDING" }, _count: true, _sum: { net: true } }),
    db.auditLog.findFirst({ where: { action: "PAYOUT_BATCH" }, orderBy: { createdAt: "desc" } }),
    db.subscription.count({ where: { active: true } }),
    db.subscription.count({ where: { active: true, nextRunAt: { lte: now } } }),
    db.subscription.findFirst({ where: { active: true, nextRunAt: { gt: now } }, orderBy: { nextRunAt: "asc" }, select: { nextRunAt: true } }),
  ]);
  return {
    settings: SETTING_KEYS.map((key) => ({ key, value: values[key], ...SETTING_DEFS[key] })),
    areas: areas.map((a) => ({ id: a.id, name: a.name, active: a.active, isPilot: a.isPilot, baseDeliveryFee: a.baseDeliveryFee, radiusKm: a.radiusKm })),
    categories: categories.map((c) => ({ slug: c.slug, name: c.name, enabledAreas: (c.enabledAreas as string[] | null) ?? [] })),
    payouts: {
      pendingCount: pending._count,
      pendingAmount: round2(pending._sum.net ?? 0),
      lastRun: lastRun ? { at: lastRun.createdAt.toISOString(), meta: lastRun.meta as { count?: number; amount?: number } | null } : null,
    },
    subscriptions: { active: subsActive, due: subsDue, nextRunAt: nextSub?.nextRunAt.toISOString() ?? null },
  };
});

/** Applies one control change. */
export const PATCH = handler({ roles: ["ADMIN"], body }, async ({ user, body }) => {
  if (body.kind === "setting") {
    const def = SETTING_DEFS[body.key];
    if (body.value < def.min || body.value > def.max) throw new HttpError(400, `${def.label} must be between ${def.min} and ${def.max}`);
    const value = String(body.value);
    await db.platformSetting.upsert({ where: { key: body.key }, create: { key: body.key, value }, update: { value } });
    await audit({ actorId: user.id, action: "SETTING_CHANGED", entity: "PlatformSetting", entityId: body.key, meta: { value: body.value } });
    return { key: body.key, value: body.value };
  }

  if (body.kind === "area") {
    const area = await db.serviceArea.findUnique({ where: { id: body.id } });
    if (!area) throw new HttpError(404, "Service area not found");
    if (body.active === false) {
      const others = await db.serviceArea.count({ where: { active: true, id: { not: area.id } } });
      if (!others) throw new HttpError(400, "Keep at least one service area active");
    }
    const data = { ...(body.active !== undefined && { active: body.active }), ...(body.baseDeliveryFee !== undefined && { baseDeliveryFee: round2(body.baseDeliveryFee) }) };
    const updated = await db.serviceArea.update({ where: { id: area.id }, data });
    await audit({ actorId: user.id, action: "SERVICE_AREA_CHANGED", entity: "ServiceArea", entityId: area.id, meta: data });
    return { id: updated.id, active: updated.active, baseDeliveryFee: updated.baseDeliveryFee };
  }

  const [category, area] = await Promise.all([db.category.findUnique({ where: { slug: body.slug } }), db.serviceArea.findUnique({ where: { name: body.area } })]);
  if (!category) throw new HttpError(404, "Category not found");
  if (!category.special) throw new HttpError(400, "Only cold-chain categories are area-gated");
  if (!area) throw new HttpError(400, "Unknown service area");
  const current = new Set((category.enabledAreas as string[] | null) ?? []);
  if (body.enabled) current.add(area.name);
  else current.delete(area.name);
  const enabledAreas = [...current].sort();
  await db.category.update({ where: { id: category.id }, data: { enabledAreas } });
  await audit({ actorId: user.id, action: body.enabled ? "CATEGORY_ENABLED" : "CATEGORY_DISABLED", entity: "Category", entityId: category.slug, meta: { area: area.name } });
  return { slug: category.slug, enabledAreas };
});
