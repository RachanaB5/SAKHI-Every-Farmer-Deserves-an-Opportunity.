// CREATE_LISTING_DRAFT and PUBLISH_LISTING. A draft is a DRAFT batch (never
// visible to buyers); publishing only submits it for admin review through
// the same service the wizard uses — it can never go live from here.
import "server-only";
import type { Batch, MediaAsset, User } from "@prisma/client";
import { createDraftBatch, loadBatch, submitBatch, updateDraftBatch } from "@/lib/batches";
import { CROPS } from "@/lib/crops";
import { signConfirm } from "../confirm";
import type { AssistantLang, Entities } from "../intents";
import { amount, crop, qty, reply, say, unitWord, withCard } from "../reply";
import type { AssistantReply, DraftCard } from "../types";

/** Card view of a batch. */
export function draftCard(b: Batch & { media: MediaAsset[] }): DraftCard {
  return {
    id: b.id,
    crop: b.crop,
    qty: b.quantityKg,
    unit: (b.unit as DraftCard["unit"]) ?? "kg",
    price: b.proposedPrice,
    harvestDate: b.harvestDate.toISOString().slice(0, 10),
    photos: b.media.filter((m) => m.type === "IMAGE").length,
    status: b.status,
  };
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Creates (or, with a draftId, updates) the farmer's draft from spoken fields. */
export async function createOrUpdateDraft(user: User, e: Entities, lang: AssistantLang, transcript: string): Promise<AssistantReply> {
  const slug = e.crop!;
  const unit = e.unit ?? CROPS[slug].unit;
  const batch = e.draftId
    ? await updateDraftBatch(user, e.draftId, { crop: slug, quantity: e.qty ?? undefined, unit, price: e.price ?? undefined, ...(e.harvestDate && { harvestDate: e.harvestDate }) })
    : await createDraftBatch(user, { crop: slug, quantity: e.qty!, unit, harvestDate: e.harvestDate ?? todayIso(), price: e.price ?? undefined, transcript, inputLanguage: lang });
  const card = draftCard(batch);
  const vars = { qty: qty(card.qty), unit: unitWord(lang, card.unit), crop: crop(lang, card.crop), price: card.price ? amount(card.price) : "" };
  const context = { lastDraftId: batch.id };
  if (!card.price) {
    return withCard(
      reply("CREATE_LISTING_DRAFT", lang, "ff.say.draft.createdNoPrice", vars, {
        context,
        followUp: { intent: "CREATE_LISTING_DRAFT", entities: { ...e, crop: slug, unit, draftId: batch.id }, missing: ["price"] },
      }),
      { type: "draft", draft: card },
    );
  }
  const key = !e.draftId ? "ff.say.draft.created" : card.photos ? "ff.say.draft.updated" : "ff.say.draft.updatedNeedPhoto";
  return withCard(reply("CREATE_LISTING_DRAFT", lang, key, vars, { context }), { type: "draft", draft: card });
}

/** Asks for confirmation before sending a draft to the admin. */
export async function preparePublish(user: User, draftId: string | null | undefined, lang: AssistantLang): Promise<AssistantReply> {
  if (!draftId) return reply("PUBLISH_LISTING", lang, "ff.say.publish.noDraft");
  const batch = await loadBatch(draftId, user, "owner");
  const card = draftCard(batch);
  if (batch.status === "PENDING_REVIEW") return withCard(reply("PUBLISH_LISTING", lang, "ff.say.publish.already"), { type: "draft", draft: card });
  if (batch.status !== "DRAFT" && batch.status !== "RESUBMIT") return withCard(reply("PUBLISH_LISTING", lang, "ff.say.publish.already"), { type: "draft", draft: card });
  if (!card.price) {
    return withCard(
      reply("PUBLISH_LISTING", lang, "ff.say.ask.price", { unit: unitWord(lang, card.unit) }, { followUp: { intent: "CREATE_LISTING_DRAFT", entities: { crop: card.crop as Entities["crop"], qty: card.qty, unit: card.unit, draftId }, missing: ["price"] } }),
      { type: "draft", draft: card },
    );
  }
  if (card.photos === 0) return withCard(reply("PUBLISH_LISTING", lang, "ff.card.needPhoto"), { type: "draft", draft: card });
  const vars = { qty: qty(card.qty), unit: unitWord(lang, card.unit), crop: crop(lang, card.crop), price: amount(card.price) };
  return {
    ...reply("PUBLISH_LISTING", lang, "ff.say.publish.confirm", vars),
    needsConfirmation: true,
    confirmToken: await signConfirm(user.id, { intent: "PUBLISH_LISTING", lang, draftId }),
    card: {
      type: "confirm",
      intent: "PUBLISH_LISTING",
      entities: { draftId },
      title: say(lang, "ff.card.sendReview"),
      rows: [
        { label: say(lang, "ff.card.crop"), value: vars.crop },
        { label: say(lang, "ff.card.qty"), value: `${vars.qty} ${vars.unit}` },
        { label: say(lang, "ff.card.price"), value: `₹${vars.price}/${vars.unit}` },
        { label: say(lang, "ff.card.photos"), value: String(card.photos) },
      ],
    },
  };
}

/** Confirmed: submits for admin review. */
export async function executePublish(user: User, draftId: string, lang: AssistantLang): Promise<AssistantReply> {
  const { batch, alreadySubmitted } = await submitBatch(user, draftId);
  return withCard(reply("PUBLISH_LISTING", lang, alreadySubmitted ? "ff.say.publish.already" : "ff.say.publish.done"), { type: "draft", draft: draftCard(batch) });
}
