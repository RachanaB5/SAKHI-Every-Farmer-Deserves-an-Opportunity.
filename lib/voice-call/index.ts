// The order phone call: when an order is confirmed, Sakhi rings the farmer
// (Twilio Programmable Voice), asks for a language on the keypad, reads the
// order out and then just talks. "Yes" books the rider through the same
// service as the orders board's button; questions are answered by Gemini
// from this order's facts only (Sakhi's FAQ when Gemini is unavailable).
// Farmers without a smartphone hear every order this way.
//
// Off unless VOICE_CALLS=on with Twilio keys and a public https URL that
// Twilio can reach (VOICE_CALL_BASE_URL, else NEXT_PUBLIC_APP_URL).
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { withFallback } from "@/lib/ai";
import { itemsText, slotText } from "@/lib/assistant/agent-text";
import { matchFaq } from "@/lib/assistant/faq";
import { yesNo } from "@/lib/assistant/lexicon";
import { db } from "@/lib/db";
import { bookDelivery, markReadyForPickup } from "@/lib/delivery/assign";
import { FALLBACK_MINUTES, farmCoords, homeCoords, itemsOf } from "@/lib/delivery/arrival";
import { minutesBetween } from "@/lib/delivery/eta";
import { HttpError } from "@/lib/api";
import { translateText } from "@/lib/i18n";
import { DIGIT_LANG, LANG_NAME, LINES, factSheet, followUp, hangUp, languageMenu, listen, orderSummary, type CallFacts, type CallLang } from "./script";

/** Questions answered before the call wraps up on its own. */
const MAX_TURNS = 5;

const env = (k: string) => process.env[k]?.trim() || undefined;

function config() {
  if (env("VOICE_CALLS")?.toLowerCase() !== "on") return null;
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_VOICE_FROM") ?? env("TWILIO_FROM");
  const base = (env("VOICE_CALL_BASE_URL") ?? env("NEXT_PUBLIC_APP_URL"))?.replace(/\/+$/, "");
  if (!sid || !token || !from || !base || !/^https:\/\//.test(base)) return null;
  return { sid, token, from, base };
}

/** Whether order calls are switched on and fully configured. */
export const callsEnabled = () => config() !== null;

/** Per-order secret in the webhook URL, so only Twilio (which we gave it to) can drive the call. */
function callKey(orderId: string, secret: string) {
  return createHmac("sha256", secret).update(`order-call:${orderId}`).digest("base64url").slice(0, 32);
}

export function validCallKey(orderId: string, key: string | null): boolean {
  const c = config();
  if (!c || !key) return false;
  const want = Buffer.from(callKey(orderId, c.token));
  const got = Buffer.from(key);
  return want.length === got.length && timingSafeEqual(want, got);
}

function stepUrl(orderId: string, step: string, extra: Record<string, string | number> = {}) {
  const c = config()!;
  const q = new URLSearchParams({ k: callKey(orderId, c.token), step, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) });
  return `${c.base}/api/voice/order/${orderId}?${q}`;
}

/** 10-digit Indian mobile (or any +E.164) → +E.164. */
export function toE164(phone: string): string {
  const d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  return `+91${d.slice(-10)}`;
}

/** A Twilio number as +E.164 (spaces and dashes removed; "+" added when missing). */
const toE164Any = (n: string) => {
  const d = n.replace(/[^d+]/g, "");
  return d.startsWith("+") ? d : `+${d}`;
};

/** Twilio's refusal in words that say what to fix. */
function twilioReason(code: number | undefined, message: string): string {
  const fix: Record<number, string> = {
    21219: "Verify this phone number in Twilio first (trial accounts can only call verified numbers).",
    21215: "Allow India in Twilio → Voice → Geo permissions.",
    21408: "Allow India in Twilio → Voice → Geo permissions.",
    21210: "TWILIO_FROM must be your Twilio phone number, like +14155550123.",
    21212: "TWILIO_FROM must be your Twilio phone number, like +14155550123.",
    21211: "The farmer's phone number is not valid. Check VOICE_CALL_TEST_NUMBER (like +919876543210).",
    21205: "NEXT_PUBLIC_APP_URL must be your public https site address.",
  };
  return `${(code && fix[code]) || "The phone service refused the call."} (Twilio ${code ?? ""}: ${message})`;
}

/**
 * Rings the farmer about an order.
 * VOICE_CALL_TEST_NUMBER sends every call to one phone instead (a Twilio
 * trial account can only call numbers verified on it).
 */
export async function placeOrderCall(orderId: string): Promise<{ placed: boolean; reason?: string }> {
  const c = config();
  if (!c) return { placed: false, reason: "Order calls aren't switched on for this server." };
  const order = await db.order.findUnique({ where: { id: orderId }, select: { farmerId: true, farmer: { select: { phone: true } } } });
  if (!order) return { placed: false, reason: "Order not found" };
  const to = toE164(env("VOICE_CALL_TEST_NUMBER") ?? order.farmer.phone);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.sid}/Calls.json`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${c.sid}:${c.token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: toE164Any(c.from), Url: stepUrl(orderId, "start"), Method: "POST", Timeout: "30" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { code?: number; message?: string } | null;
    console.error(`[voice-call] Twilio refused the call (${res.status}):`, err);
    return { placed: false, reason: twilioReason(err?.code, err?.message ?? `HTTP ${res.status}`) };
  }
  await db.auditLog.create({ data: { action: "ORDER_CALL_PLACED", entity: "Order", entityId: orderId, meta: { to: `${to.slice(0, 5)}xxxxx${to.slice(-2)}` } } });
  return { placed: true };
}

/** Rings the farmer once the response has gone out, so checkout never waits on (or fails because of) the call. */
export function scheduleOrderCall(orderId: string) {
  if (!callsEnabled()) return;
  const run = () =>
    placeOrderCall(orderId).catch((e) => {
      console.error("[voice-call] could not place the call:", e);
    });
  try {
    after(run);
  } catch {
    void run(); // outside a request (scripts, tests)
  }
}

// ── The conversation ────────────────────────────────────────────────────

const orderInclude = {
  items: { select: { title: true, unit: true, qty: true, unitPrice: true, listing: { select: { crop: true } } } },
  buyer: { select: { name: true, orgName: true } },
  farmer: { select: { name: true, language: true, lat: true, lng: true, area: true, farmerProfile: { select: { village: true } } } },
  delivery: { select: { status: true, farmEta: true, worker: { select: { name: true } } } },
} as const;

async function loadOrder(orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!o) throw new HttpError(404, "Order not found");
  return o;
}
type CallOrder = Awaited<ReturnType<typeof loadOrder>>;

const asLang = (l: string | null | undefined): CallLang | null => (l === "kn" || l === "hi" || l === "en" ? l : null);

/** The order in the call's language. */
function factsFor(o: CallOrder, lang: CallLang): CallFacts {
  const minutes = o.delivery?.farmEta ? Math.max(5, Math.ceil((o.delivery.farmEta.getTime() - Date.now()) / 300_000) * 5) : FALLBACK_MINUTES;
  const rider = o.delivery?.worker && o.delivery.status !== "FAILED" ? o.delivery.worker.name.split(" ")[0] : null;
  const area = translateText(lang, o.area);
  return {
    farmer: o.farmer.name.split(" ")[0],
    items: itemsText(lang, itemsOf(o.items)),
    buyer: o.buyer.orgName ?? o.buyer.name.split(" ")[0],
    drop: lang === "en" && o.addressLine ? `${o.addressLine}, ${area}` : area,
    pickup: o.fulfilment === "PICKUP",
    rider,
    etaMin: rider ? minutes : null,
    slot: o.slot ? (lang === "en" ? o.slot.charAt(0).toLowerCase() + o.slot.slice(1) : slotText(lang, o.slot)) : null,
  };
}

const replySchema = z.object({
  intent: z.enum(["accept", "decline", "bye", "question"]),
  reply: z.string().max(600),
});

const SCRIPT: Record<CallLang, string> = { kn: "Kannada", hi: "Devanagari", en: "Latin" };

/** What the farmer meant, plus Sakhi's spoken answer for questions. */
async function understand(lang: CallLang, said: string, o: CallOrder, f: CallFacts) {
  const quick = yesNo(said);
  if (quick) return { intent: quick === "yes" ? "accept" : "decline", reply: "" } as const;
  const goods = Math.round(o.items.reduce((s, i) => s + i.qty * i.unitPrice, 0)).toLocaleString("en-IN");
  const { data } = await withFallback(
    "order-call",
    (p) =>
      p.generateJSON({
        task: "order-call",
        system: [
          `You are Sakhi, FoodFlow's warm, respectful female voice assistant, on a phone call with a farmer who may not read or use a touch screen.`,
          `Speak only ${LANG_NAME[lang]}, written in ${SCRIPT[lang]} script, the way people talk on the phone: simple everyday words, one or two short sentences, no lists, emojis or symbols.`,
          `Answer only from the order facts. If the answer isn't there, say the FoodFlow team will help. Never invent prices, times or names.`,
          `Classify what the farmer meant: "accept" (agrees, okay, will keep it ready, book the rider), "decline" (can't supply, refuses, wants to cancel), "bye" (wants to end the call), otherwise "question".`,
        ].join("\n"),
        prompt: `Order facts:\n${factSheet({ ...f, code: o.code, goods, status: o.status })}\n\nThe farmer said: "${said.slice(0, 300)}"`,
        schema: replySchema,
        temperature: 0.3,
      }),
    () => {
      const hit = matchFaq(said);
      return { intent: "question" as const, reply: hit ? hit.answer[lang] : LINES[lang].unknown };
    },
  );
  return data;
}

/** Books the rider (or readies a self-pickup) after the farmer says yes; returns what to say. */
async function accept(o: CallOrder, lang: CallLang, f: CallFacts): Promise<string> {
  const L = LINES[lang];
  if (f.pickup) {
    if (o.status === "CONFIRMED" || o.status === "PACKED") await markReadyForPickup(o.id, o.farmerId).catch(() => undefined);
    return L.ready(f);
  }
  if (f.rider) return L.ready(f);
  try {
    const { worker, alreadyBooked } = await bookDelivery(o.id, o.farmerId);
    if (!worker) return L.noRider;
    const home = await db.user.findUnique({ where: { id: worker.id }, select: { lat: true, lng: true, area: true } });
    const etaMin = minutesBetween(home && homeCoords(home), farmCoords(o.farmer)) ?? FALLBACK_MINUTES;
    if (!alreadyBooked) await db.delivery.update({ where: { orderId: o.id }, data: { farmEta: new Date(Date.now() + etaMin * 60_000) } });
    return L.booked({ ...f, rider: worker.name.split(" ")[0], etaMin });
  } catch (e) {
    if (e instanceof HttpError) return L.noRider; // nobody free, or the order moved on
    throw e;
  }
}

/**
 * One step of the call, as TwiML.
 * Steps: start (language menu) → lang (order summary) → talk (each reply) / silent (no answer).
 */
export async function callStep(orderId: string, step: string, query: URLSearchParams, form: FormData): Promise<string> {
  const o = await loadOrder(orderId);
  const lang = asLang(query.get("lang")) ?? DIGIT_LANG[String(form.get("Digits") ?? "")] ?? asLang(o.farmer.language) ?? "kn";
  const turn = Number(query.get("turn") ?? 0) || 0;
  const L = LINES[lang];

  if (step === "start") return languageMenu(stepUrl(orderId, "lang"), stepUrl(orderId, "lang"));

  const f = factsFor(o, lang);
  const next = (said: string) => listen(lang, said, stepUrl(orderId, "talk", { lang, turn: turn + 1 }), stepUrl(orderId, "silent", { lang, turn: turn + 1 }));

  if (step === "lang") return next(`${orderSummary(lang, f)} ${followUp(lang, f)}`);
  if (step === "silent") return turn >= 3 ? hangUp(lang, `${L.ready(f)} ${L.bye}`) : next(`${L.notHeard} ${followUp(lang, f)}`);

  // step === "talk"
  const digit = String(form.get("Digits") ?? "");
  const said = String(form.get("SpeechResult") ?? "").trim();
  const meant = digit === "1" ? { intent: "accept" as const, reply: "" } : digit === "2" ? { intent: "decline" as const, reply: "" } : said ? await understand(lang, said, o, f) : null;
  if (!meant) return next(`${L.notHeard} ${followUp(lang, f)}`);

  if (meant.intent === "accept") return hangUp(lang, `${await accept(o, lang, f)} ${L.bye}`);
  if (meant.intent === "decline") {
    await db.auditLog.create({ data: { actorId: o.farmerId, action: "ORDER_CALL_DECLINED", entity: "Order", entityId: o.id, meta: { said: said.slice(0, 200) } } });
    return hangUp(lang, `${L.declined} ${L.bye}`);
  }
  if (meant.intent === "bye" || turn >= MAX_TURNS) return hangUp(lang, `${f.pickup || f.rider ? L.ready(f) : ""} ${L.bye}`.trim());
  return next(`${meant.reply} ${followUp(lang, f)}`);
}
