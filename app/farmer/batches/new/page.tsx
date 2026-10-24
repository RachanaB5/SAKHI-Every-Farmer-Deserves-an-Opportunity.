// /farmer/batches/new — the AI-assisted harvest listing wizard.
// `?batch=<id>` resumes a draft or a batch the admin sent back for changes.
import type { Metadata } from "next";
import { ClientOnly } from "@/components/common/client-only";
import { RouteLoading } from "@/components/common/route-loading";
import { NewBatchWizard } from "@/components/farmer/new-batch/wizard";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { serializeBatch } from "@/lib/batches";
import { isCropSlug, type CropSlug } from "@/lib/crops";

export const metadata: Metadata = { title: "New harvest" };

/** Loads the farmer's usual crops (shown first) and an optional batch to resume. */
export default async function NewBatchPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const [{ batch: batchId }, session] = await Promise.all([searchParams, getSession()]);
  if (!session) return null;
  const [profile, batch] = await Promise.all([
    db.farmerProfile.findUnique({ where: { userId: session.sub }, select: { crops: true } }),
    batchId
      ? db.batch.findFirst({
          where: { id: batchId, farmerId: session.sub, status: { in: ["DRAFT", "RESUBMIT"] } },
          include: { media: { orderBy: { createdAt: "asc" } } },
        })
      : null,
  ]);
  const crops = ((profile?.crops as string[] | null) ?? []).filter(isCropSlug) as CropSlug[];
  // Client-only: the form defaults to the farmer's local "today".
  return (
    <ClientOnly fallback={<RouteLoading />}>
      <NewBatchWizard
        key={batch?.id ?? "new"}
        farmerCrops={crops}
        initial={batch ? serializeBatch(batch) : null}
      />
    </ClientOnly>
  );
}
