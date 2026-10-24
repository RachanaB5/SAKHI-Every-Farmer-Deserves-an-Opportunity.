// Sakhi dispatcher: one handler per intent, follow-up questions
// for missing fields, and execution of confirmed actions. Handlers only
// call existing services and only ever report success they observed.
import "server-only";
import type { User } from "@prisma/client";
import { HttpError } from "@/lib/api";
import { CROPS } from "@/lib/crops";
import type { ConfirmPayload } from "../confirm";
import type { AssistantContext, AssistantLang, Entities, ParseResult } from "../intents";
import { crop, reply, say, unitWord } from "../reply";
import type { AssistantReply } from "../types";
import { executeBook, executePrice, executeStock, prepareBook, preparePrice, prepareStock } from "./changes";
import { createOrUpdateDraft, executePublish, preparePublish } from "./listing";
import { canFulfil, executeOffer, listDemands, prepareOffer } from "./market";
import { checkDelivery, checkEarnings, checkPayment, checkPrice, checkStatus, checkStock } from "./read";

/** Asks for the first missing field and remembers what we have so far. */
function askFor(parsed: ParseResult, lang: AssistantLang): AssistantReply {
  const e = parsed.entities;
  const field = parsed.missing[0];
  const followUp = { intent: parsed.intent, entities: e, missing: parsed.missing };
  if (field === "crop") return reply(parsed.intent, lang, "ff.say.ask.crop", {}, { followUp });
  if (field === "qty") {
    if (!e.crop) return reply(parsed.intent, lang, "ff.say.ask.qtyAny", {}, { followUp });
    return reply(parsed.intent, lang, "ff.say.ask.qty", { crop: crop(lang, e.crop), unit: unitWord(lang, e.unit ?? CROPS[e.crop].unit) }, { followUp });
  }
  if (field === "price") return reply(parsed.intent, lang, "ff.say.ask.price", { unit: unitWord(lang, e.unit ?? (e.crop ? CROPS[e.crop].unit : "kg")) }, { followUp });
  if (field === "draftId") return reply(parsed.intent, lang, "ff.say.publish.noDraft");
  return reply(parsed.intent, lang, "ff.say.unsupported");
}

/**
 * Answers one understood utterance for the signed-in farmer.
 * @param transcript - what the farmer said, kept on new drafts as evidence
 */
export async function handleIntent(user: User, parsed: ParseResult, lang: AssistantLang, ctx: AssistantContext | undefined, transcript: string): Promise<AssistantReply> {
  const e: Entities = { ...parsed.entities };
  if (!e.draftId && parsed.intent === "PUBLISH_LISTING") e.draftId = ctx?.lastDraftId ?? null;
  if (!e.demandId && ["RESPOND_TO_OFFER", "CAN_FULFIL_DEMAND"].includes(parsed.intent)) e.demandId = ctx?.lastDemandId ?? null;
  const missing = parsed.missing.filter((f) => e[f as keyof Entities] == null);
  if (missing.length && parsed.intent !== "PUBLISH_LISTING") return askFor({ ...parsed, entities: e, missing }, lang);

  switch (parsed.intent) {
    case "CREATE_LISTING_DRAFT":
      return createOrUpdateDraft(user, e, lang, transcript);
    case "PUBLISH_LISTING":
      return preparePublish(user, e.draftId, lang);
    case "CHECK_EARNINGS":
      return checkEarnings(user, e, lang);
    case "CHECK_PAYMENT_STATUS":
      return checkPayment(user, e, lang);
    case "CHECK_STOCK":
      return checkStock(user, e, lang);
    case "CHECK_LISTING_PRICE":
      return checkPrice(user, e, lang);
    case "CHECK_LISTING_STATUS":
      return checkStatus(user, e, lang);
    case "DELIVERY_STATUS":
      return checkDelivery(user, e, lang);
    case "LIST_BULK_DEMANDS":
      return listDemands(user, lang);
    case "CAN_FULFIL_DEMAND":
      return canFulfil(user, e, lang);
    case "RESPOND_TO_OFFER":
      return prepareOffer(user, e, lang);
    case "UPDATE_PRICE":
      return preparePrice(user, e, lang);
    case "UPDATE_STOCK":
      return prepareStock(user, e, lang);
    case "BOOK_DELIVERY":
      return prepareBook(user, e, lang);
    case "HELP":
      return reply("HELP", lang, "ff.say.help");
    case "SMALLTALK":
      return reply("SMALLTALK", lang, "ff.say.smalltalk");
    default:
      return reply("UNSUPPORTED", lang, "ff.say.unsupported");
  }
}

/** Runs a confirmed action from its verified token payload. */
export async function executeConfirmed(user: User, p: ConfirmPayload): Promise<AssistantReply> {
  const lang = p.lang;
  switch (p.intent) {
    case "PUBLISH_LISTING":
      return executePublish(user, p.draftId!, lang);
    case "UPDATE_PRICE":
      return executePrice(user, { listingId: p.listingId!, price: p.price! }, lang);
    case "UPDATE_STOCK":
      return executeStock(user, { listingId: p.listingId!, qty: p.qty! }, lang);
    case "RESPOND_TO_OFFER":
      return executeOffer(user, { demandId: p.demandId!, listingId: p.listingId!, qty: p.qty!, price: p.price!, etaHours: p.etaHours ?? 24 }, lang);
    case "BOOK_DELIVERY":
      return executeBook(user, { orderId: p.orderId! }, lang);
  }
}

/**
 * Turns a service error into an honest reply in the farmer's language
 * (nothing was changed), keeping the service's own explanation.
 */
export function errorReply(e: unknown, intent: ParseResult["intent"], lang: AssistantLang): AssistantReply {
  const detail = e instanceof HttpError ? e.message : null;
  const base = say(lang, "ff.say.error");
  return { ok: false, intent, lang, speech: base, display: detail ? `${base} (${detail})` : base };
}
