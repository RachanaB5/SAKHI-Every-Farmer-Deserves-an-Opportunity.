// Deterministic intent + entity parser for Sakhi. Runs on every
// utterance (English, Hindi, Kannada, code-mixed); the model is only asked
// when this parser isn't confident. Never touches the database.
import { CROPS, type CropSlug } from "@/lib/crops";
import { fuzzyFind } from "./fuzzy";
import { type AssistantContext, type Entities, type Intent, type ParseResult, REQUIRED } from "./intents";
import { CROP_TERMS, CURRENCY_TERMS, DATE_TERMS, PERIOD_TERMS, PER_UNIT_TERMS, PER_WORDS, UNIT_TERMS, type CanonicalUnit } from "./lexicon";
import { asciiDigits } from "@/lib/ai/fallback/numbers";
import { normaliseSpokenNumbers } from "./numbers";

// ── Keyword sets (Latin terms match whole words; Indic terms match as substrings) ──
const K = {
  help: ["help", "what can you do", "how do i", "how to use", "madad", "मदद", "क्या कर सकते", "ಸಹಾಯ", "sahaya", "ಏನು ಮಾಡಬಹುದು"],
  greet: ["hi", "hello", "hey", "namaste", "namaskar", "namaskara", "thank you", "thanks", "dhanyavaad", "dhanyavad", "shukriya", "good morning", "how are you", "kaise ho", "नमस्ते", "नमस्कार", "धन्यवाद", "शुक्रिया", "ನಮಸ್ಕಾರ", "ಧನ್ಯವಾದ", "ಹೇಗಿದ್ದೀರಿ"],
  publish: ["submit", "send for review", "send it", "send it for review", "publish", "go live", "bhej do", "bhejo", "submit karo", "भेज दो", "भेजो", "जमा करो", "ಕಳುಹಿಸಿ", "ಕಳಿಸಿ", "kaluhisi", "kalisi"],
  delivery: ["delivery", "deliver", "delivered", "rider", "courier", "डिलीवरी", "राइडर", "ಡೆಲಿವರಿ", "ರೈಡರ್"],
  book: ["book", "arrange", "call a rider", "send a rider", "bulao", "bula do", "book karo", "book kar do", "बुक", "बुलाओ", "ಬುಕ್", "ಕರೆಸಿ"],
  payment: ["payment", "payments", "paid", "payout", "settlement", "settled", "transfer", "paisa aaya", "paise aaye", "paisa mila", "payment aaya", "upi", "भुगतान", "पेमेंट", "पैसा आया", "पैसे आए", "पैसे मिले", "ಪಾವತಿ", "ಹಣ ಬಂತ", "ಹಣ ಬಂದಿದೆ", "pavati", "hana banta"],
  earnings: ["earn", "earned", "earning", "earnings", "income", "revenue", "how much money", "kamai", "kamaya", "kamaaya", "kamaai", "कमाई", "कमाया", "कमाए", "ಆದಾಯ", "ಗಳಿಕೆ", "ಗಳಿಸಿ", "ಸಂಪಾದನೆ", "ಸಂಪಾದಿಸ", "galike", "sampadane", "aadaaya"],
  bulk: ["restaurant", "restaurants", "hotel", "hotels", "canteen", "kitchen", "kitchens", "bulk", "demand", "demands", "requirement", "requirements", "big order", "big orders", "thok", "थोक", "होटल", "रेस्टोरेंट", "रेस्तरां", "कैंटीन", "मांग", "ಹೋಟೆಲ್", "ರೆಸ್ಟೋರೆಂಟ್", "ಸಗಟು", "ಬೇಡಿಕೆ", "ಕ್ಯಾಂಟೀನ್", "bedike", "sagatu"],
  offer: ["offer", "bid", "quote", "offer karo", "offer do", "ऑफर", "ಆಫರ್"],
  canFulfil: ["can i supply", "can i give", "can i send", "can i fulfil", "can i fulfill", "can i do", "de sakta", "de sakti", "de sakte", "दे सकता", "दे सकती", "दे सकते", "ಕೊಡಬಹುದಾ", "ಕೊಡಬಹುದೇ", "ಕೊಡಲು ಸಾಧ್ಯ", "kodabahuda", "kodabahude"],
  give: ["give", "supply", "de do", "दे दो", "ಕೊಡಿ", "ಕೊಡು", "kodi"],
  status: ["status", "approved", "approve", "approval", "rejected", "reject", "pending", "review", "verified", "verify", "manzoor", "manjoor", "मंज़ूर", "मंजूर", "स्वीकार", "अस्वीकार", "रिजेक्ट", "स्थिति", "जांच", "ಅನುಮೋದ", "ತಿರಸ್ಕರಿಸ", "ತಿರಸ್ಕೃತ", "ಸ್ಥಿತಿ", "ಪರಿಶೀಲನೆ", "anumodane"],
  price: ["price", "prices", "rate", "rates", "cost", "bhav", "bhaav", "daam", "dam", "keemat", "kimat", "भाव", "दाम", "कीमत", "रेट", "ಬೆಲೆ", "ದರ", "bele", "dara"],
  set: ["change", "set", "update", "make", "increase", "decrease", "raise", "lower", "reduce", "kar do", "karo", "kardo", "badlo", "badal do", "badhao", "ghatao", "kam karo", "कर दो", "करो", "बदलो", "बदल दो", "बढ़ाओ", "घटाओ", "कम करो", "ಮಾಡಿ", "ಬದಲಿಸಿ", "ಬದಲಾಯಿಸಿ", "ಹೆಚ್ಚಿಸಿ", "ಕಡಿಮೆ", "maadi", "badalisi"],
  only: ["only", "just", "sirf", "bas", "सिर्फ", "बस", "ಮಾತ್ರ", "matra"],
  stock: ["stock", "stocks", "inventory", "left", "remaining", "kitna bacha", "bacha", "bache", "baaki", "baki", "maal", "स्टॉक", "बचा", "बचे", "बाकी", "माल", "ಸ್ಟಾಕ್", "ಉಳಿದ", "ulidide", "ಲಭ್ಯ"],
  sell: ["sell", "selling", "list", "listing", "add", "harvested", "harvest", "picked", "plucked", "upload", "bechna", "bechni", "bechenge", "bechunga", "becho", "bech", "beche", "tode", "toda", "todi", "list karo", "daal do", "lagao", "तोड़े", "तोड़ा", "तोड़ी", "बेचना", "बेचनी", "बेचूंगा", "बेचूँगा", "बेचो", "ಮಾರಾಟ", "ಮಾರಬೇಕು", "ಮಾರುತ್ತೇನೆ", "ಮಾರಲು", "ಕಿತ್ತ", "ಕೊಯ್ದ", "maarabeku", "maratakke"],
  question: ["how much", "how many", "what", "which", "is my", "kitna", "kitni", "kitne", "kya", "kab", "कितना", "कितनी", "कितने", "क्या", "ಎಷ್ಟು", "eshtu", "ಏನು", "ಯಾವ", "ಇದೆಯಾ", "?"],
};

const isLatin = (s: string) => /^[a-z0-9₹ .'-]+$/.test(s);

/** Does `text` (normalised, space-padded) contain the term? */
function hasTerm(padded: string, term: string): boolean {
  if (term === "?") return padded.includes("?");
  return isLatin(term) ? padded.includes(` ${term} `) : padded.includes(term);
}
const hasAny = (padded: string, terms: string[]) => terms.some((t) => hasTerm(padded, t));

export interface Normalised {
  text: string;
  tokens: string[];
  orderCode: string | null;
}

/**
 * Normalises an utterance for parsing: order codes pulled out first, then
 * punctuation, native digits and spoken numbers → plain tokens.
 */
export function normaliseUtterance(raw: string): Normalised {
  let t = asciiDigits(raw.normalize("NFC").toLowerCase());
  let orderCode: string | null = null;
  t = t.replace(/\b(?:ff[\s-]?|order\s+(?:no\.?\s*|number\s*)?)([a-z0-9]{5})\b/i, (m, code: string) => {
    if (!/\d/.test(code) && !/^ff/i.test(m)) return m;
    orderCode = `FF-${code.toUpperCase()}`;
    return " ";
  });
  t = t.replace(/(\d)[.](\d)/g, "$1DOT$2");
  t = t.replace(/[,!;:"'()।|‌‍]/g, " ").replace(/[.]/g, " ").replace(/DOT/g, ".");
  t = t.replace(/[?]/g, " ? ");
  t = t.replace(/₹\s*/g, " ₹ ").replace(/\brs\.?\s*(?=\d)/g, " rs ");
  t = t.replace(/(\d)([^\d\s.?])/g, "$1 $2").replace(/([^\d\s.])(\d)/g, "$1 $2");
  t = normaliseSpokenNumbers(t.replace(/\s+/g, " ").trim());
  const text = t.replace(/\s+/g, " ").trim();
  return { text, tokens: text.split(" ").filter(Boolean), orderCode };
}

/** First crop mentioned: exact term, then Indic prefix (handles suffixes like ಟೊಮೇಟೊಗೆ), then fuzzy. */
export function findCrop(n: Normalised): { crop: CropSlug; fuzzy: boolean } | null {
  const padded = ` ${n.text} `;
  for (const [term, slug] of CROP_TERMS) {
    if (isLatin(term) ? padded.includes(` ${term} `) : padded.includes(term)) return { crop: slug, fuzzy: false };
  }
  for (const tok of n.tokens) {
    if (isLatin(tok)) continue;
    const hit = CROP_TERMS.find(([term]) => !isLatin(term) && term.length >= 3 && tok.startsWith(term.slice(0, Math.max(3, term.length - 1))));
    if (hit) return { crop: hit[1], fuzzy: true };
  }
  for (const tok of n.tokens) {
    const f = fuzzyFind(tok, CROP_TERMS);
    if (f) return { crop: f.value, fuzzy: true };
  }
  return null;
}

const unitOf = (tok: string | undefined): CanonicalUnit | null => (tok ? (UNIT_TERMS.find(([w]) => w === tok)?.[1] ?? null) : null);
const isCurrency = (tok: string | undefined) => !!tok && CURRENCY_TERMS.includes(tok);
const isPerUnit = (tok: string | undefined) => !!tok && PER_UNIT_TERMS.includes(tok);
const isNum = (tok: string | undefined) => !!tok && /^\d+(\.\d+)?$/.test(tok);

interface Quantities {
  qty: number | null;
  unit: "kg" | "litre" | "dozen" | null;
  unitSaid: boolean;
  price: number | null;
  loose: number[];
}

/** Pulls quantity (number + unit) and price (number + currency / "per kilo") out of the tokens. */
export function extractQuantities(tokens: string[]): Quantities {
  const out: Quantities = { qty: null, unit: null, unitSaid: false, price: null, loose: [] };
  const priceWordAt = (i: number) => K.price.some((p) => isLatin(p) ? tokens[i] === p : (tokens[i] ?? "").includes(p));
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!isNum(tok)) continue;
    const n = Number(tok);
    const next = tokens[i + 1];
    const prev = tokens[i - 1];
    const prev2 = tokens[i - 2];
    const currencyNear = isCurrency(next) || isCurrency(prev);
    const perNear =
      isPerUnit(prev) ||
      isPerUnit(prev2) ||
      (PER_WORDS.includes(next ?? "") && unitOf(tokens[i + 2]) !== null) ||
      (PER_WORDS.includes(prev ?? "") && unitOf(prev2) !== null) ||
      prev === "per" ||
      prev === "@" ||
      prev === "at";
    const priceWordBefore = priceWordAt(i - 1) || priceWordAt(i - 2);
    const unit = unitOf(next);
    if (currencyNear || perNear || (priceWordBefore && !unit)) {
      if (out.price === null) out.price = n;
      continue;
    }
    if (unit && !isPerUnit(next)) {
      if (out.qty === null) {
        if (unit === "quintal") {
          out.qty = n * 100;
          out.unit = "kg";
        } else if (unit === "gram") {
          out.qty = Math.round((n / 1000) * 1000) / 1000;
          out.unit = "kg";
        } else {
          out.qty = n;
          out.unit = unit;
        }
        out.unitSaid = true;
        continue;
      }
    }
    out.loose.push(n);
  }
  return out;
}

function isoDaysAgo(days: number, now: Date): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** All entities the utterance states. */
export function extractEntities(n: Normalised, now: Date = new Date()): { entities: Entities; fuzzyCrop: boolean; unitSaid: boolean; loose: number[] } {
  const padded = ` ${n.text} `;
  const crop = findCrop(n);
  const q = extractQuantities(n.tokens);
  const entities: Entities = {};
  if (crop) entities.crop = crop.crop;
  if (q.qty !== null) entities.qty = q.qty;
  if (q.unit) entities.unit = q.unit;
  else if (crop && q.qty !== null) entities.unit = CROPS[crop.crop].unit;
  if (q.price !== null) entities.price = q.price;
  const date = DATE_TERMS.find(([w]) => hasTerm(padded, w));
  if (date) entities.harvestDate = isoDaysAgo(date[1], now);
  const period = PERIOD_TERMS.find(([w]) => hasTerm(padded, w));
  if (period) entities.period = period[1];
  if (n.orderCode) entities.orderCode = n.orderCode;
  return { entities, fuzzyCrop: crop?.fuzzy ?? false, unitSaid: q.unitSaid, loose: q.loose };
}

/** Chooses the intent from keywords and structure. */
function classify(padded: string, e: Entities, loose: number[], ctx?: AssistantContext): { intent: Intent; strength: number } {
  const has = (k: keyof typeof K) => hasAny(padded, K[k]);
  const anyNumber = e.qty != null || e.price != null || loose.length > 0;
  if (has("help")) return { intent: "HELP", strength: 0.95 };
  if (has("delivery")) return has("book") ? { intent: "BOOK_DELIVERY", strength: 0.9 } : { intent: "DELIVERY_STATUS", strength: 0.85 };
  if (has("publish") && (ctx?.lastDraftId || /listing|draft|harvest|लिस्टिंग|ಪಟ್ಟಿ/.test(padded))) return { intent: "PUBLISH_LISTING", strength: 0.9 };
  if (has("payment") && !has("earnings")) return { intent: "CHECK_PAYMENT_STATUS", strength: 0.85 };
  if (has("earnings")) return { intent: "CHECK_EARNINGS", strength: 0.9 };
  if (has("canFulfil")) return { intent: "CAN_FULFIL_DEMAND", strength: 0.85 };
  if (has("bulk") || has("offer")) {
    if (has("offer") && e.qty != null && (e.price != null || loose.length)) return { intent: "RESPOND_TO_OFFER", strength: 0.85 };
    if (has("give") && e.qty != null && (e.price != null || loose.length)) return { intent: "RESPOND_TO_OFFER", strength: 0.8 };
    if (has("offer")) return { intent: "RESPOND_TO_OFFER", strength: 0.6 };
    return { intent: "LIST_BULK_DEMANDS", strength: 0.9 };
  }
  if (has("status")) return e.orderCode ? { intent: "DELIVERY_STATUS", strength: 0.8 } : { intent: "CHECK_LISTING_STATUS", strength: 0.85 };
  if (has("sell")) return { intent: "CREATE_LISTING_DRAFT", strength: 0.9 };
  // "tamatar 50 kilo, bhav 25" is a new listing with its price, not a price change.
  if (has("price") && e.crop && e.qty != null && !has("set") && !has("question")) return { intent: "CREATE_LISTING_DRAFT", strength: 0.8 };
  if (has("price")) {
    const hasValue = e.price != null || loose.length > 0;
    if (hasValue && (has("set") || !has("question"))) return { intent: "UPDATE_PRICE", strength: 0.85 };
    return { intent: "CHECK_LISTING_PRICE", strength: 0.85 };
  }
  if (has("stock")) {
    if (e.qty != null && (has("set") || has("only"))) return { intent: "UPDATE_STOCK", strength: 0.85 };
    return { intent: "CHECK_STOCK", strength: 0.85 };
  }
  if (e.crop && e.qty != null) return { intent: "CREATE_LISTING_DRAFT", strength: 0.8 };
  if (has("greet")) return { intent: "SMALLTALK", strength: 0.9 };
  if (e.crop && !anyNumber) return { intent: "CHECK_STOCK", strength: 0.5 };
  return { intent: "UNSUPPORTED", strength: 0.3 };
}

/** True when the utterance carries no intent words of its own (e.g. "30", "ಟೊಮೇಟೊ"). */
function isBareAnswer(padded: string): boolean {
  return !(["help", "publish", "delivery", "payment", "earnings", "bulk", "offer", "status", "price", "stock", "sell", "greet", "canFulfil"] as const).some((k) => hasAny(padded, K[k]));
}

/**
 * Parses one utterance.
 * @param ctx - pending follow-up and recent ids, so "30" can answer "what price?"
 */
export function parseUtterance(raw: string, ctx?: AssistantContext, now: Date = new Date()): ParseResult & { normalised: string } {
  const n = normaliseUtterance(raw);
  const padded = ` ${n.text} `;
  if (!n.text) return { intent: "UNSUPPORTED", entities: {}, confidence: 0, missing: [], normalised: "" };
  const { entities, fuzzyCrop, unitSaid, loose } = extractEntities(n, now);

  // A short answer to the previous question continues that intent.
  if (ctx?.pending && isBareAnswer(padded)) {
    const merged: Entities = { ...ctx.pending.entities };
    for (const [k, v] of Object.entries(entities)) if (v != null) (merged as Record<string, unknown>)[k] = v;
    const need = REQUIRED[ctx.pending.intent] ?? [];
    const gap = need.find((f) => merged[f] == null);
    if (loose.length && gap === "price") merged.price = loose[0];
    else if (loose.length && gap === "qty") merged.qty = loose[0];
    else if (loose.length && merged.price == null && ctx.pending.intent === "CREATE_LISTING_DRAFT") merged.price = loose[0];
    if (merged.crop && merged.qty != null && !merged.unit) merged.unit = CROPS[merged.crop].unit;
    const missing = (REQUIRED[ctx.pending.intent] ?? []).filter((f) => merged[f] == null);
    return { intent: ctx.pending.intent, entities: merged, confidence: missing.length ? 0.6 : 0.85, missing, normalised: n.text };
  }

  const { intent, strength } = classify(padded, entities, loose, ctx);

  // Intent-specific filling from loose numbers ("tomato price 30 kar do", "only 30 tomato left").
  if (intent === "UPDATE_PRICE" && entities.price == null && loose.length) entities.price = loose[loose.length - 1];
  if ((intent === "UPDATE_STOCK" || intent === "CAN_FULFIL_DEMAND") && entities.qty == null && loose.length) entities.qty = loose[0];
  if (intent === "RESPOND_TO_OFFER") {
    if (entities.qty == null && loose.length) entities.qty = loose.shift();
    if (entities.price == null && loose.length) entities.price = loose.shift();
  }
  if (intent === "UPDATE_PRICE" && entities.qty != null && entities.price == null) {
    entities.price = entities.qty; // "tomato 30 per kilo" read as a price when changing price
    delete entities.qty;
  }
  if (entities.crop && entities.qty != null && !entities.unit) entities.unit = CROPS[entities.crop].unit;
  if (intent === "PUBLISH_LISTING" && ctx?.lastDraftId) entities.draftId = ctx.lastDraftId;
  if (intent === "CHECK_EARNINGS" && !entities.period) entities.period = "all";

  const missing = (REQUIRED[intent] ?? []).filter((f) => entities[f] == null);
  let confidence = strength;
  if (fuzzyCrop) confidence -= 0.1;
  if (intent === "CREATE_LISTING_DRAFT" && !unitSaid) confidence -= 0.05;
  if (missing.length) confidence = Math.min(confidence, 0.6);
  return { intent, entities, confidence: Math.max(0, Math.round(confidence * 100) / 100), missing, normalised: n.text };
}
