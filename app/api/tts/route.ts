// GET /api/tts?lang=kn&text=… — Sakhi's Kannada voice as a WAV (see
// lib/tts/kannada.ts). GET /api/tts?status=1 says whether it is installed;
// add &warm=1 to load it before the first reply. Public, because the voice
// guide runs before sign-in; rate-limited per address.
import type { NextRequest } from "next/server";
import { fail, HttpError, ok, toErrorResponse } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { kannadaVoiceAvailable, synthesizeKannada, warmKannadaVoice } from "@/lib/tts/kannada";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const available = kannadaVoiceAvailable();
    if (sp.has("status")) {
      if (available && sp.has("warm")) warmKannadaVoice();
      return ok({ kn: available });
    }
    if (sp.get("lang") !== "kn") return fail(400, "Only Kannada is spoken by the server voice");
    const text = (sp.get("text") ?? "").trim();
    if (!text) return fail(400, "Nothing to say");
    if (text.length > 400) return fail(400, "Send one sentence at a time (up to 400 characters)");
    if (!available) throw new HttpError(503, "The Kannada voice isn't installed on this server");
    rateLimit(`tts:${clientIp(req.headers)}`, 150, 60_000);
    const wav = await synthesizeKannada(text);
    return new Response(new Uint8Array(wav), {
      headers: { "Content-Type": "audio/wav", "Content-Length": String(wav.length), "Cache-Control": "public, max-age=604800" },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
