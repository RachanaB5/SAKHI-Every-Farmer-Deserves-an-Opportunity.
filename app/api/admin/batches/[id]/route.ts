// GET  /api/admin/batches/[id]          — full review context for one batch
// POST /api/admin/batches/[id]          — decision: APPROVE | REJECT | RESUBMIT
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, must } from "@/lib/api";
import { decideBatch, farmerHistory } from "@/lib/admin/review";
import { serializeBatch } from "@/lib/batches";
import { isCropSlug } from "@/lib/crops";
import { computePriceAdvice } from "@/lib/pricing";

type Params = { id: string };

/**
 * Batch + farmer track record + where any duplicate photo came from +
 * price context + audit trail + category availability in the farmer's area.
 */
export const GET = handler<undefined, undefined, Params>({ roles: ["ADMIN"] }, async ({ params }) => {
  const batch = must(
    await db.batch.findUnique({
      where: { id: params.id },
      include: {
        media: { orderBy: { createdAt: "asc" } },
        listing: { select: { id: true, status: true } },
        farmer: { select: { id: true, name: true, phone: true, area: true, reliabilityScore: true, createdAt: true, farmerProfile: true } },
      },
    }),
    "Batch not found",
  );
  const dupSources = [...new Set(batch.media.map((m) => m.duplicateOfBatchId).filter(Boolean) as string[])];
  const [history, duplicates, price, trail, recent, category] = await Promise.all([
    farmerHistory(batch.farmerId),
    db.batch.findMany({
      where: { id: { in: dupSources } },
      select: { id: true, crop: true, status: true, createdAt: true, farmer: { select: { name: true } } },
    }),
    isCropSlug(batch.crop) ? computePriceAdvice(batch.crop, batch.farmer.area, batch.grade ?? "ANY") : null,
    db.auditLog.findMany({
      where: { entity: "Batch", entityId: batch.id },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { name: true, role: true } } },
      take: 20,
    }),
    db.batch.findMany({
      where: { farmerId: batch.farmerId, id: { not: batch.id }, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, crop: true, status: true, aiQualityScore: true, createdAt: true },
      take: 5,
    }),
    db.category.findUnique({ where: { slug: batch.category } }),
  ]);
  const enabledAreas = (category?.enabledAreas as string[] | null) ?? [];
  return {
    ...serializeBatch(batch),
    listing: batch.listing,
    farmer: {
      id: batch.farmer.id,
      name: batch.farmer.name,
      phone: batch.farmer.phone,
      area: batch.farmer.area,
      village: batch.farmer.farmerProfile?.village ?? null,
      farmName: batch.farmer.farmerProfile?.farmName ?? null,
      reliability: batch.farmer.reliabilityScore,
      memberSince: batch.farmer.createdAt.toISOString(),
      history,
      recent: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    },
    duplicates: duplicates.map((d) => ({ id: d.id, crop: d.crop, status: d.status, farmer: d.farmer.name, createdAt: d.createdAt.toISOString() })),
    price: price && { suggested: price.suggested, min: price.min, max: price.max, mandi: price.mandi, trend: price.trend, trendPct: price.trendPct },
    categoryEnabled: !category?.special || enabledAreas.includes(batch.farmer.area ?? ""),
    trail: trail.map((t) => ({ id: t.id, action: t.action, actor: t.actor?.name ?? "System", role: t.actor?.role ?? null, meta: t.meta, createdAt: t.createdAt.toISOString() })),
  };
});

const decisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "RESUBMIT"]),
  note: z.string().trim().max(400).optional(),
  price: z.coerce.number().positive().max(100_000).optional(),
  grade: z.enum(["A", "B", "C"]).optional(),
});

/** Records the admin decision (approve creates the Listing atomically). */
export const POST = handler<z.infer<typeof decisionSchema>, undefined, Params>(
  { roles: ["ADMIN"], body: decisionSchema },
  async ({ user, params, body }) => decideBatch({ batchId: params.id, adminId: user.id, ...body }),
);
