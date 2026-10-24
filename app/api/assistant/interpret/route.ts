// POST /api/assistant/interpret — Sakhi: understand one utterance
// (rules first, model only when unsure) and answer it. Reads run now;
// anything that changes data comes back as a confirmation card + token.
import { handler, HttpError } from "@/lib/api";
import { errorReply, handleIntent } from "@/lib/assistant/actions";
import { understand } from "@/lib/assistant/understand";
import { rateLimit } from "@/lib/rate-limit";
import { interpretSchema, type InterpretInput } from "@/lib/validators/assistant";

/** Returns an AssistantReply (ok:false replies explain that nothing changed). */
export const POST = handler<InterpretInput>({ roles: ["FARMER"], body: interpretSchema }, async ({ user, body }) => {
  rateLimit(`assistant:${user.id}`, 40, 60_000);
  const lang = body.replyLang ?? body.lang;
  const parsed = await understand(body.text, body.lang, body.context);
  try {
    const reply = await handleIntent(user, parsed, lang, body.context, body.text);
    return { ...reply, source: parsed.source };
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) throw e;
    if (!(e instanceof HttpError)) console.error("[assistant:interpret]", e);
    return errorReply(e, parsed.intent, lang);
  }
});
