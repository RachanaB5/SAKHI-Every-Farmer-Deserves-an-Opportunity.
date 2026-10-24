// /api/batches/[id]
//   GET   one batch (owner or admin)
//   PATCH  update details while editable, or submit for admin review
//   DELETE remove the harvest (or take its listing down once it went live)
import { handler } from "@/lib/api";
import { loadBatch, removeOwnBatch, serializeBatch, submitBatch, updateDraftBatch } from "@/lib/batches";
import { batchUpdateSchema, type BatchUpdate } from "@/lib/validators/batch";

type Params = { id: string };

/** Returns a batch with its media. */
export const GET = handler<undefined, undefined, Params>({ roles: ["FARMER", "ADMIN"] }, async ({ user, params }) => {
  return serializeBatch(await loadBatch(params.id, user, "read"));
});

/**
 * Saves edits (DRAFT/RESUBMIT only) and optionally submits.
 * Submitting re-runs the visual quality check server-side on the stored
 * media — the client's preview result is never trusted — then moves the
 * batch to PENDING_REVIEW. Listings only go live after an admin approves.
 */
export const PATCH = handler<BatchUpdate, undefined, Params>({ roles: ["FARMER"], body: batchUpdateSchema }, async ({ user, params, body }) => {
  const { action, ...fields } = body;
  if (action === "save") return serializeBatch(await updateDraftBatch(user, params.id, fields));
  return serializeBatch((await submitBatch(user, params.id, fields)).batch);
});

/** Deletes a harvest that never went live; a live one has its listing removed instead. */
export const DELETE = handler<undefined, undefined, Params>({ roles: ["FARMER"] }, async ({ user, params }) => removeOwnBatch(user, params.id));
