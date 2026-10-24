// DELETE /api/batches/[id]/media/[mediaId] — remove a file from a draft.
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { loadBatch } from "@/lib/batches";

type Params = { id: string; mediaId: string };

/** Deletes the asset row (content-addressed files may be shared, so bytes stay). */
export const DELETE = handler<undefined, undefined, Params>({ roles: ["FARMER"] }, async ({ user, params }) => {
  const batch = await loadBatch(params.id, user, "owner");
  if (batch.status !== "DRAFT" && batch.status !== "RESUBMIT") {
    throw new HttpError(409, "Media is locked once the harvest is submitted");
  }
  const asset = batch.media.find((m) => m.id === params.mediaId);
  if (!asset) throw new HttpError(404, "File not found on this harvest");
  await db.mediaAsset.delete({ where: { id: asset.id } });
  return { deleted: asset.id };
});
