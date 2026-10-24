// POST /api/assistant/confirm — run a confirmed Sakhi action.
// The token is verified (signature, expiry, same farmer), the action runs
// once through the normal services, and a replay returns the first result.
import { handler, HttpError } from "@/lib/api";
import { errorReply, executeConfirmed } from "@/lib/assistant/actions";
import { runOnce, verifyConfirm } from "@/lib/assistant/confirm";
import { confirmSchema, type ConfirmInput } from "@/lib/validators/assistant";

/** Returns the action's reply; ok:false when the service refused (nothing changed). */
export const POST = handler<ConfirmInput>({ roles: ["FARMER"], body: confirmSchema }, async ({ user, body }) => {
  const { jti, payload } = await verifyConfirm(body.token, user.id);
  try {
    return await runOnce(jti, user.id, payload.intent, () => executeConfirmed(user, payload));
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) throw e;
    if (!(e instanceof HttpError)) console.error("[assistant:confirm]", e);
    return errorReply(e, payload.intent, payload.lang);
  }
});
