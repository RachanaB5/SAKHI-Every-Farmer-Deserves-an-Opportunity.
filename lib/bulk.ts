// Bulk procurement services: restaurants / hostels / community kitchens
// post demands, nearby farmers make offers backed by live listings, the
// buyer compares AI-ranked offers, negotiates (max 2 counter rounds) and
// accepts — which creates a BULK order through the same atomic stock
// reservation as retail. Offers themselves never touch inventory.
import "server-only";
import type { Prisma, User } from "@prisma/client";
import { coordsFor, haversineKm } from "@/lib/areas";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { withFallback } from "@/lib/ai";
import { rankOffersPrompt } from "@/lib/ai/prompts";
import { rankedOffersSchema } from "@/lib/ai/schemas";
import { onOrderConfirmed } from "@/lib/assistant/autopilot";
import { CROPS, isCropSlug } from "@/lib/crops";
import { publish } from "@/lib/events";
import { orderTotals, round2 } from "@/lib/fees";
import { confirmOrder, createPlacedOrder } from "@/lib/orders/lifecycle";
import { rankOffersDeterministic, type RankInputOffer } from "@/lib/ranking";
import { commissionPct, serviceArea } from "@/lib/settings";
import type { DemandInput, NegotiateInput, OfferInput } from "@/lib/validators/bulk";

export const MAX_COUNTER_ROUNDS = 2;

export const demandInclude = {
  buyer: { select: { id: true, name: true, orgName: true, orgType: true, area: true, lat: true, lng: true } },
  offers: {
    include: {
      farmer: { select: { id: true, name: true, reliabilityScore: true, lat: true, lng: true, area: true, farmerProfile: { select: { village: true, farmName: true } } } },
      listing: { select: { id: true, title: true, availableQty: true, grade: true, imageUrl: true, pricePerUnit: true, batch: { select: { aiQualityScore: true } } } },
      order: { select: { id: true, code: true, status: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.DemandRequestInclude;

type DemandRow = Prisma.DemandRequestGetPayload<{ include: typeof demandInclude }>;
type OfferRow = DemandRow["offers"][number];

function buyerPoint(d: DemandRow) {
  return d.buyer.lat && d.buyer.lng ? { lat: d.buyer.lat, lng: d.buyer.lng } : coordsFor(d.area);
}

function farmerPoint(f: { lat: number | null; lng: number | null; area: string | null }) {
  return f.lat && f.lng ? { lat: f.lat, lng: f.lng } : coordsFor(f.area);
}

/** Distance between the offer's farm and the buyer, in km. */
function offerDistance(d: DemandRow, o: OfferRow): number {
  const a = farmerPoint(o.farmer);
  const b = buyerPoint(d);
  return a && b ? round2(haversineKm(a, b)) : 15;
}

/** Price currently on the table for an offer (agreed counter or original). */
export function currentPrice(o: { pricePerKg: number; counterPrice: number | null; status: string; lastActor: string | null }) {
  return o.status === "COUNTERED" && o.counterPrice ? o.counterPrice : o.pricePerKg;
}

/** Client shape for one offer. */
export function serializeOffer(d: DemandRow, o: OfferRow) {
  return {
    id: o.id,
    demandId: o.demandId,
    status: o.status,
    qtyKg: o.qtyKg,
    pricePerKg: o.pricePerKg,
    counterPrice: o.counterPrice,
    rounds: o.rounds,
    lastActor: o.lastActor,
    etaHours: o.etaHours,
    note: o.note,
    fromSurplus: o.fromSurplus,
    aiScore: o.aiScore,
    aiRank: o.aiRank,
    aiReason: o.aiReason,
    distanceKm: offerDistance(d, o),
    createdAt: o.createdAt.toISOString(),
    farmer: {
      id: o.farmer.id,
      name: o.farmer.name,
      farmName: o.farmer.farmerProfile?.farmName ?? null,
      village: o.farmer.farmerProfile?.village ?? null,
      reliability: o.farmer.reliabilityScore,
    },
    listing: o.listing && {
      id: o.listing.id,
      title: o.listing.title,
      availableQty: o.listing.availableQty,
      grade: o.listing.grade,
      imageUrl: o.listing.imageUrl,
      qualityScore: o.listing.batch.aiQualityScore,
    },
    order: o.order,
  };
}

/**
 * Client shape for a demand. Farmers only see their own offer, never
 * competitors' prices.
 */
export function serializeDemand(d: DemandRow, viewer: Pick<User, "id" | "role">) {
  const isOwner = viewer.id === d.buyerId || viewer.role === "ADMIN";
  const offers = isOwner ? d.offers : d.offers.filter((o) => o.farmerId === viewer.id);
  const accepted = d.offers.filter((o) => o.status === "ACCEPTED").reduce((s, o) => s + o.qtyKg, 0);
  return {
    id: d.id,
    crop: d.crop,
    cropName: isCropSlug(d.crop) ? CROPS[d.crop].names.en : d.crop,
    qtyKg: d.qtyKg,
    acceptedKg: round2(accepted),
    grade: d.grade,
    targetPrice: d.targetPrice,
    deadline: d.deadline.toISOString(),
    urgent: d.urgent,
    recurring: d.recurring,
    frequency: d.frequency,
    notes: d.notes,
    area: d.area,
    source: d.source,
    status: d.status,
    createdAt: d.createdAt.toISOString(),
    buyer: { id: d.buyer.id, name: d.buyer.orgName ?? d.buyer.name, orgType: d.buyer.orgType, area: d.buyer.area },
    offerCount: d.offers.filter((o) => !["WITHDRAWN", "REJECTED"].includes(o.status)).length,
    offers: offers.map((o) => serializeOffer(d, o)),
  };
}

export type SerializedDemand = ReturnType<typeof serializeDemand>;
export type SerializedOffer = ReturnType<typeof serializeOffer>;

/** Loads a demand with offers or 404s. */
export async function loadDemand(id: string) {
  const d = await db.demandRequest.findUnique({ where: { id }, include: demandInclude });
  if (!d) throw new HttpError(404, "Requirement not found");
  return d;
}

/** Creates one or more demands for a bulk buyer. */
export async function createDemands(buyer: User, inputs: DemandInput[]) {
  const area = (await serviceArea(buyer.area))?.name ?? buyer.area ?? "Hebbal";
  const created = [];
  for (const d of inputs) {
    created.push(
      await db.demandRequest.create({
        data: {
          buyerId: buyer.id,
          crop: d.crop,
          qtyKg: d.qtyKg,
          grade: d.grade,
          targetPrice: d.targetPrice,
          deadline: new Date(d.deadline),
          urgent: d.urgent,
          recurring: d.recurring,
          frequency: d.recurring ? d.frequency ?? "WEEKLY" : null,
          notes: d.notes,
          area,
          source: d.source,
        },
      }),
    );
  }
  for (const c of created) publish({ type: "demand.updated", id: c.id, roles: ["FARMER", "ADMIN"] });
  await audit({ actorId: buyer.id, action: "DEMAND_POSTED", entity: "DemandRequest", entityId: created[0].id, meta: { count: created.length } });
  return created;
}

/**
 * Open demands for a farmer: crop match first (they hold a live listing of
 * it), then urgency, then distance.
 */
export async function farmerDemandFeed(farmer: User) {
  const [demands, listings] = await Promise.all([
    db.demandRequest.findMany({ where: { status: "OPEN", deadline: { gt: new Date() } }, include: demandInclude, orderBy: { createdAt: "desc" } }),
    db.listing.findMany({ where: { farmerId: farmer.id, status: "ACTIVE", availableQty: { gt: 0 } }, select: { id: true, crop: true, title: true, availableQty: true, unit: true, pricePerUnit: true } }),
  ]);
  const me = farmerPoint(farmer);
  return demands
    .map((d) => {
      const there = buyerPoint(d);
      const matching = listings.filter((l) => l.crop === d.crop);
      return {
        ...serializeDemand(d, farmer),
        distanceKm: me && there ? round2(haversineKm(me, there)) : null,
        myListings: matching,
      };
    })
    .sort((a, b) => Number(b.myListings.length > 0) - Number(a.myListings.length > 0) || Number(b.urgent) - Number(a.urgent) || (a.distanceKm ?? 99) - (b.distanceKm ?? 99));
}

/**
 * Farmer submits (or revises) an offer for an open demand. The offer must
 * be backed by one of their live listings of the same crop. No stock is
 * reserved until the buyer accepts.
 */
export async function makeOffer(farmer: User, demandId: string, input: OfferInput, opts: { fromSurplus?: boolean } = {}) {
  const d = await loadDemand(demandId);
  if (d.status !== "OPEN" || d.deadline < new Date()) throw new HttpError(409, "This requirement is no longer open");
  const listing = await db.listing.findUnique({ where: { id: input.listingId } });
  if (!listing || listing.farmerId !== farmer.id) throw new HttpError(403, "Offer from one of your own listings");
  if (listing.status !== "ACTIVE" || listing.crop !== d.crop) throw new HttpError(400, `Pick a live ${d.crop} listing`);
  if (input.qtyKg > listing.availableQty) throw new HttpError(400, `You only have ${listing.availableQty} ${listing.unit} available`);
  const existing = d.offers.find((o) => o.farmerId === farmer.id && ["PENDING", "COUNTERED"].includes(o.status));
  if (existing?.status === "COUNTERED") throw new HttpError(409, "Respond to the buyer's counter instead");
  const data = { listingId: listing.id, qtyKg: input.qtyKg, pricePerKg: input.pricePerKg, etaHours: input.etaHours, note: input.note, status: "PENDING" as const, lastActor: "FARMER", fromSurplus: opts.fromSurplus ?? false, aiScore: null, aiRank: null, aiReason: null };
  const offer = existing
    ? await db.offer.update({ where: { id: existing.id }, data })
    : await db.offer.create({ data: { demandId, farmerId: farmer.id, ...data } });
  publish({ type: "offer.updated", id: offer.id, userIds: [d.buyerId, farmer.id], roles: ["ADMIN"], data: { demandId } });
  await audit({ actorId: farmer.id, action: existing ? "OFFER_REVISED" : "OFFER_MADE", entity: "Offer", entityId: offer.id, meta: { demandId, price: input.pricePerKg, qty: input.qtyKg, fromSurplus: opts.fromSurplus ?? false } });
  return offer;
}

/**
 * Ranks a demand's live offers. Deterministic scores always computed; when
 * a model is configured it may re-weigh and explain (validated: every
 * offer must be present). Results are stored on the offers.
 */
export async function rankDemandOffers(demandId: string) {
  const d = await loadDemand(demandId);
  const live = d.offers.filter((o) => ["PENDING", "COUNTERED"].includes(o.status));
  const inputs: RankInputOffer[] = live.map((o) => ({
    id: o.id,
    farmerName: o.farmer.name,
    qtyKg: o.qtyKg,
    pricePerKg: currentPrice(o),
    etaHours: o.etaHours,
    distanceKm: offerDistance(d, o),
    qualityScore: o.listing?.batch.aiQualityScore ?? null,
    grade: o.listing?.grade ?? null,
    reliability: o.farmer.reliabilityScore,
  }));
  const deterministic = rankOffersDeterministic({ qtyKg: d.qtyKg, grade: d.grade, deadline: d.deadline }, inputs);
  if (!deterministic.length) return { source: "fallback" as const, ranking: [] };

  const demandText = `${d.qtyKg} kg ${d.crop}, grade ${d.grade}, target ₹${d.targetPrice}/kg, deadline ${d.deadline.toISOString()}${d.urgent ? ", URGENT" : ""}`;
  const offerText = deterministic
    .map((r) => {
      const o = inputs.find((x) => x.id === r.offerId)!;
      const f = Object.entries(r.factors).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(" ");
      return `- offerId=${r.offerId} farmer=${o.farmerName} qty=${o.qtyKg}kg price=₹${o.pricePerKg}/kg delivered=₹${r.deliveredPerKg}/kg eta=${o.etaHours}h distance=${o.distanceKm}km ${f} baseline=${r.score}`;
    })
    .join("\n");

  const result = await withFallback(
    "rank-offers",
    async (p) => {
      const out = await p.generateJSON({ task: "rank-offers", system: rankOffersPrompt.system, prompt: rankOffersPrompt.user(demandText, offerText), schema: rankedOffersSchema, temperature: 0.1 });
      const ids = new Set(out.ranking.map((r) => r.offerId));
      if (ids.size !== deterministic.length || deterministic.some((r) => !ids.has(r.offerId))) throw new Error("AI ranking missed offers");
      return out.ranking.map((r) => ({ ...deterministic.find((x) => x.offerId === r.offerId)!, score: Math.round(r.score * 10) / 10, reason: r.reason }));
    },
    () => deterministic,
  );
  const ranking = [...result.data].sort((a, b) => b.score - a.score);
  await db.$transaction(ranking.map((r, i) => db.offer.update({ where: { id: r.offerId }, data: { aiScore: r.score, aiRank: i + 1, aiReason: r.reason } })));
  return { source: result.source, ranking };
}

/**
 * Negotiation and decisions on an offer.
 *   Buyer:  COUNTER (≤ 2 rounds total), ACCEPT, REJECT
 *   Farmer: ACCEPT_COUNTER, COUNTER (back, within the round limit), WITHDRAW
 */
export async function negotiateOffer(user: User, offerId: string, input: NegotiateInput) {
  const offer = await db.offer.findUnique({ where: { id: offerId }, include: { demand: true } });
  if (!offer) throw new HttpError(404, "Offer not found");
  const isBuyer = offer.demand.buyerId === user.id;
  const isFarmer = offer.farmerId === user.id;
  if (!isBuyer && !isFarmer) throw new HttpError(403, "Not your offer");
  if (offer.demand.status !== "OPEN") throw new HttpError(409, "This requirement is closed");
  if (!["PENDING", "COUNTERED"].includes(offer.status)) throw new HttpError(409, "This offer is no longer open");
  const notify = () => publish({ type: "offer.updated", id: offer.id, userIds: [offer.demand.buyerId, offer.farmerId], roles: ["ADMIN"], data: { demandId: offer.demandId } });

  if (input.action === "ACCEPT") {
    if (!isBuyer) throw new HttpError(403, "Only the buyer can accept");
    return acceptOffer(user, offer.id);
  }
  if (input.action === "REJECT") {
    if (!isBuyer) throw new HttpError(403, "Only the buyer can reject");
    await db.offer.update({ where: { id: offer.id }, data: { status: "REJECTED" } });
    notify();
    return { status: "REJECTED" };
  }
  if (input.action === "WITHDRAW") {
    if (!isFarmer) throw new HttpError(403, "Only the farmer can withdraw");
    await db.offer.update({ where: { id: offer.id }, data: { status: "WITHDRAWN" } });
    notify();
    return { status: "WITHDRAWN" };
  }
  if (input.action === "ACCEPT_COUNTER") {
    if (!isFarmer || offer.status !== "COUNTERED" || offer.lastActor !== "BUYER" || !offer.counterPrice) throw new HttpError(409, "There's no buyer counter to accept");
    // Farmer agrees: the counter becomes the price on the table; buyer can now accept.
    await db.offer.update({ where: { id: offer.id }, data: { pricePerKg: offer.counterPrice, counterPrice: null, status: "PENDING", lastActor: "FARMER" } });
    notify();
    return { status: "PENDING", pricePerKg: offer.counterPrice };
  }
  // COUNTER
  if (!input.price) throw new HttpError(400, "Enter your counter price");
  if (offer.rounds >= MAX_COUNTER_ROUNDS) throw new HttpError(409, "Negotiation limit reached (2 rounds), accept or decline");
  const actor = isBuyer ? "BUYER" : "FARMER";
  if (offer.lastActor === actor && offer.status === "COUNTERED") throw new HttpError(409, "Wait for the other side to respond");
  if (isFarmer && !(offer.status === "COUNTERED" && offer.lastActor === "BUYER")) throw new HttpError(409, "Revise your offer instead of countering");
  await db.offer.update({ where: { id: offer.id }, data: { counterPrice: input.price, status: "COUNTERED", lastActor: actor, rounds: { increment: 1 } } });
  await audit({ actorId: user.id, action: "OFFER_COUNTERED", entity: "Offer", entityId: offer.id, meta: { price: input.price, by: actor, round: offer.rounds + 1 } });
  notify();
  return { status: "COUNTERED", counterPrice: input.price };
}

/**
 * Buyer accepts an offer → BULK order with atomic stock reservation.
 * The agreed price is the farmer's counter (if they countered last) or
 * the offer price. Once accepted quantity covers the demand it is AWARDED
 * and remaining offers are declined.
 */
export async function acceptOffer(buyer: User, offerId: string) {
  const offer = await db.offer.findUnique({ where: { id: offerId }, include: { demand: true, listing: true } });
  if (!offer || offer.demand.buyerId !== buyer.id) throw new HttpError(404, "Offer not found");
  if (offer.status === "COUNTERED" && offer.lastActor === "BUYER") throw new HttpError(409, "Waiting for the farmer to respond to your counter");
  if (!offer.listing) throw new HttpError(409, "This offer isn't linked to live stock");
  const price = currentPrice(offer);
  const area = await serviceArea(buyer.area);
  const commission = await commissionPct();
  const totals = orderTotals({ items: [{ qty: offer.qtyKg, unitPrice: price }], fulfilment: "DELIVERY", baseFee: area?.baseDeliveryFee ?? 30, commissionPct: commission, type: "BULK" });
  const at = buyer.lat && buyer.lng ? { lat: buyer.lat, lng: buyer.lng } : coordsFor(buyer.area);

  const order = await createPlacedOrder({
    buyerId: buyer.id,
    farmerId: offer.farmerId,
    type: "BULK",
    fulfilment: "DELIVERY",
    area: area?.name ?? buyer.area ?? offer.demand.area,
    addressLine: buyer.address,
    slot: `By ${offer.demand.deadline.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`,
    lat: at?.lat,
    lng: at?.lng,
    offerId: offer.id,
    notes: offer.demand.notes,
    items: [{ listingId: offer.listing.id, title: offer.listing.title, unit: offer.listing.unit, qty: offer.qtyKg, unitPrice: price }],
    totals,
  });
  const res = await confirmOrder(order.id, buyer.id);
  if (!res.ok) throw new HttpError(409, `The farmer's stock changed, ${res.reason}. Ask them to revise the offer.`);
  await onOrderConfirmed(order.id);

  const awarded = await db.$transaction(async (tx) => {
    await tx.offer.update({ where: { id: offer.id }, data: { status: "ACCEPTED", pricePerKg: price, counterPrice: null } });
    const acceptedKg = (await tx.offer.findMany({ where: { demandId: offer.demandId, status: "ACCEPTED" }, select: { qtyKg: true } })).reduce((s, o) => s + o.qtyKg, 0);
    if (acceptedKg >= offer.demand.qtyKg - 0.001) {
      await tx.demandRequest.update({ where: { id: offer.demandId }, data: { status: "AWARDED" } });
      await tx.offer.updateMany({ where: { demandId: offer.demandId, status: { in: ["PENDING", "COUNTERED"] } }, data: { status: "REJECTED" } });
      return true;
    }
    return false;
  });
  await audit({ actorId: buyer.id, action: "OFFER_ACCEPTED", entity: "Offer", entityId: offer.id, meta: { orderId: order.id, price, qty: offer.qtyKg, awarded } });
  publish({ type: "offer.updated", id: offer.id, userIds: [buyer.id, offer.farmerId], roles: ["ADMIN", "FARMER"], data: { demandId: offer.demandId } });
  publish({ type: "demand.updated", id: offer.demandId, roles: ["FARMER", "ADMIN"] });
  return { status: "ACCEPTED", orderId: order.id, code: order.code, awarded };
}
