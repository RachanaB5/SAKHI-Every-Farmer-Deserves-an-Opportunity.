// Restaurant / community-kitchen demand intents: list open requirements,
// check whether the farmer can supply one, and respond with an offer
// (confirmed first, then made through the normal offer service).
import "server-only";
import type { User } from "@prisma/client";
import { farmerDemandFeed, makeOffer } from "@/lib/bulk";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { round2 } from "@/lib/fees";
import { signConfirm } from "../confirm";
import type { AssistantLang, Entities } from "../intents";
import { amount, crop, qty, reply, say, withCard } from "../reply";
import type { AssistantReply, Card } from "../types";

type Feed = Awaited<ReturnType<typeof farmerDemandFeed>>;

const remainingKg = (d: Feed[number]) => round2(Math.max(0, d.qtyKg - d.acceptedKg));
const myAvailable = (d: Feed[number]) => round2(d.myListings.reduce((a, l) => a + l.availableQty, 0));

function demandsCard(feed: Feed): Card {
  return {
    type: "demands",
    rows: feed.slice(0, 6).map((d) => ({ demandId: d.id, crop: d.crop, buyer: d.buyer.name, needKg: remainingKg(d), targetPrice: d.targetPrice, deadline: d.deadline, urgent: d.urgent, myAvailable: myAvailable(d) })),
  };
}

export async function listDemands(user: User, lang: AssistantLang): Promise<AssistantReply> {
  const feed = await farmerDemandFeed(user);
  if (!feed.length) return reply("LIST_BULK_DEMANDS", lang, "ff.say.bulk.none");
  const match = feed.filter((d) => d.myListings.length > 0).length;
  return withCard(reply("LIST_BULK_DEMANDS", lang, "ff.say.bulk.list", { n: feed.length, match }, { context: { lastDemandId: feed[0].id } }), demandsCard(feed));
}

/** Best open demand for a crop: the one this farmer is already shown first. */
async function bestDemand(user: User, cropSlug: string, demandId?: string | null) {
  const feed = await farmerDemandFeed(user);
  const forCrop = feed.filter((d) => d.crop === cropSlug && remainingKg(d) > 0);
  return { demand: (demandId && forCrop.find((d) => d.id === demandId)) || forCrop[0] || null, forCrop };
}

export async function canFulfil(user: User, e: Entities, lang: AssistantLang): Promise<AssistantReply> {
  const { demand, forCrop } = await bestDemand(user, e.crop!, e.demandId);
  const name = crop(lang, e.crop!);
  if (!demand) return reply("CAN_FULFIL_DEMAND", lang, "ff.say.fulfil.noDemand", { crop: name });
  const available = myAvailable(demand);
  const card = demandsCard(forCrop);
  if (available <= 0) return withCard(reply("CAN_FULFIL_DEMAND", lang, "ff.say.fulfil.noStock", { crop: name }, { context: { lastDemandId: demand.id } }), card);
  const need = remainingKg(demand);
  const enough = available >= Math.min(e.qty ?? need, need);
  return withCard(
    reply("CAN_FULFIL_DEMAND", lang, enough ? "ff.say.fulfil.yes" : "ff.say.fulfil.partial", { buyer: demand.buyer.name, need: qty(need), crop: name, available: qty(available) }, { context: { lastDemandId: demand.id } }),
    card,
  );
}

export async function prepareOffer(user: User, e: Entities, lang: AssistantLang): Promise<AssistantReply> {
  const { demand } = await bestDemand(user, e.crop!, e.demandId);
  const name = crop(lang, e.crop!);
  if (!demand) return reply("RESPOND_TO_OFFER", lang, "ff.say.fulfil.noDemand", { crop: name });
  const listing = [...demand.myListings].sort((a, b) => b.availableQty - a.availableQty)[0];
  if (!listing) return reply("RESPOND_TO_OFFER", lang, "ff.say.fulfil.noStock", { crop: name });
  const offerQty = Math.min(e.qty!, listing.availableQty, remainingKg(demand));
  const vars = { qty: qty(offerQty), crop: name, price: amount(e.price!), buyer: demand.buyer.name };
  return {
    ...reply("RESPOND_TO_OFFER", lang, "ff.say.offer.confirm", vars, { context: { lastDemandId: demand.id } }),
    needsConfirmation: true,
    confirmToken: await signConfirm(user.id, { intent: "RESPOND_TO_OFFER", lang, demandId: demand.id, listingId: listing.id, qty: offerQty, price: e.price!, etaHours: 24 }),
    card: {
      type: "confirm",
      intent: "RESPOND_TO_OFFER",
      entities: { crop: e.crop, qty: offerQty, price: e.price, demandId: demand.id },
      title: say(lang, "ff.card.confirmTitle"),
      rows: [
        { label: say(lang, "ff.card.buyer"), value: demand.buyer.name },
        { label: say(lang, "ff.card.crop"), value: name },
        { label: say(lang, "ff.card.needs", { qty: qty(remainingKg(demand)), price: amount(demand.targetPrice) }), value: "" },
      ],
      editable: [
        { field: "qty", label: say(lang, "ff.card.qty"), value: offerQty, unit: "kg" },
        { field: "price", label: say(lang, "ff.card.price"), value: e.price!, unit: "₹/kg" },
      ],
    },
  };
}

export async function executeOffer(user: User, p: { demandId: string; listingId: string; qty: number; price: number; etaHours: number }, lang: AssistantLang): Promise<AssistantReply> {
  const offer = await makeOffer(user, p.demandId, { listingId: p.listingId, qtyKg: p.qty, pricePerKg: p.price, etaHours: p.etaHours });
  const d = await db.demandRequest.findUnique({ where: { id: offer.demandId }, include: { buyer: { select: { name: true, orgName: true } } } });
  if (!d) throw new HttpError(404, "Requirement not found");
  return reply("RESPOND_TO_OFFER", lang, "ff.say.offer.done", { buyer: d.buyer.orgName ?? d.buyer.name });
}
