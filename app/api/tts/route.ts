// GET /api/tts?lang=kn|hi&text=… — Sakhi's Kannada or Hindi voice as a WAV
// (lib/tts/kannada.ts, lib/tts/hindi.ts). GET /api/tts?status=1 says which
// voices are installed; add &warm=kn (or hi) to load that voice before the
// first reply (&warm=1 loads both).
// Public, because the voice guide runs before sign-in; rate-limited per address.
import type { NextRequest } from "next/server";
import { fail, HttpError, ok, toErrorResponse } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { hindiVoiceAvailable, synthesizeHindi, warmHindiVoice } from "@/lib/tts/hindi";
import { kannadaVoiceAvailable, synthesizeKannada, warmKannadaVoice } from "@/lib/tts/kannada";

const VOICES = {
  kn: { available: kannadaVoiceAvailable, synthesize: synthesizeKannada, warm: warmKannadaVoice, name: "Kannada" },
  hi: { available: hindiVoiceAvailable, synthesize: synthesizeHindi, warm: warmHindiVoice, name: "Hindi" },
} as const;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    if (sp.has("status")) {
      const status = { kn: VOICES.kn.available(), hi: VOICES.hi.available() };
      const warm = sp.get("warm");
      for (const [code, v] of Object.entries(VOICES)) if (v.available() && (warm === "1" || warm === code)) v.warm();
      return ok(status);
    }
    const lang = sp.get("lang");
    if (lang !== "kn" && lang !== "hi") return fail(400, "The server voice speaks Kannada and Hindi");
    const voice = VOICES[lang];
    const text = (sp.get("text") ?? "").trim();
    if (!text) return fail(400, "Nothing to say");
    if (text.length > 400) return fail(400, "Send one sentence at a time (up to 400 characters)");
    if (!voice.available()) throw new HttpError(503, `The ${voice.name} voice isn't installed on this server`);
    rateLimit(`tts:${clientIp(req.headers)}`, 150, 60_000);
    const wav = await voice.synthesize(text);
    return new Response(new Uint8Array(wav), {
      headers: { "Content-Type": "audio/wav", "Content-Length": String(wav.length), "Cache-Control": "public, max-age=604800" },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
