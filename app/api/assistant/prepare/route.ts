// POST /api/assistant/prepare — re-issue a confirmation after the farmer
// edits a field on the card (e.g. a different price). The server resolves
// the record again and signs a fresh single-use token.
import { handler, HttpError } from "@/lib/api";
import { errorReply, handleIntent } from "@/lib/assistant/actions";
import { REQUIRED } from "@/lib/assistant/intents";
import { prepareSchema, type PrepareInput } from "@/lib/validators/assistant";

/** Returns a new confirmation reply for the edited values. */
export const POST = handler<PrepareInput>({ roles: ["FARMER"], body: prepareSchema }, async ({ user, body }) => {
  const missing = (REQUIRED[body.intent] ?? []).filter((f) => body.entities[f] == null);
  try {
    return await handleIntent(user, { intent: body.intent, entities: body.entities, confidence: 1, missing }, body.lang, body.context, "");
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) throw e;
    return errorReply(e, body.intent, body.lang);
  }
});
