// GET /api/admin/batches?status=PENDING_REVIEW — the harvest review queue.
import { z } from "zod";
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { serializeBatch } from "@/lib/batches";

const query = z.object({
  status: z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED", "RESUBMIT", "ALL"]).default("PENDING_REVIEW"),
});

/** Oldest-first queue (fair FIFO), with farmer summary and duplicate counts. */
export const GET = handler<undefined, z.infer<typeof query>>({ roles: ["ADMIN"], query }, async ({ query }) => {
  const batches = await db.batch.findMany({
    where: query.status === "ALL" ? { status: { not: "DRAFT" } } : { status: query.status },
    include: {
      media: { orderBy: { createdAt: "asc" } },
      farmer: { select: { id: true, name: true, area: true, reliabilityScore: true, farmerProfile: { select: { village: true, farmName: true } } } },
    },
    orderBy: { createdAt: query.status === "PENDING_REVIEW" ? "asc" : "desc" },
    take: 60,
  });
  return batches.map((b) => ({
    ...serializeBatch(b),
    farmer: {
      id: b.farmer.id,
      name: b.farmer.name,
      area: b.farmer.area,
      village: b.farmer.farmerProfile?.village ?? null,
      farmName: b.farmer.farmerProfile?.farmName ?? null,
      reliability: b.farmer.reliabilityScore,
    },
    duplicateCount: b.media.filter((m) => m.isDuplicate).length,
  }));
});
