// Read-only Sakhi intents: earnings, payments, stock, prices,
// harvest status and deliveries. Every query is scoped to the signed-in
// farmer; numbers come from the database, phrasing from templates.
import "server-only";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { farmerEarnings } from "@/lib/farmer/earnings";
import { round2, settlementFor } from "@/lib/fees";
import { translate, type MessageKey } from "@/lib/i18n";
import { HOLDS_STOCK, IN_FLIGHT } from "@/lib/orders/state";
import { computePriceAdvice } from "@/lib/pricing";
import type { AssistantLang, Entities } from "../intents";
import { amount, crop, day, qty, reply, say, unitWord, withCard } from "../reply";
import type { AssistantReply } from "../types";

export async function checkEarnings(user: User, e: Entities, lang: AssistantLang): Promise<AssistantReply> {
  const period = e.period ?? "all";
  const s = await farmerEarnings(user.id, period);
  const periodText = say(lang, `ff.period.${period}` as MessageKey);
  if (!s.orders) return reply("CHECK_EARNINGS", lang, "ff.say.earnings.none", { period: periodText });
  return withCard(
    reply("CHECK_EARNINGS", lang, "ff.say.earnings", { period: periodText, value: amount(s.orderValue), settled: amount(s.settled), pending: amount(s.pending), awaiting: amount(s.awaiting), fee: amount(s.platformFee) }),
    { type: "earnings", earnings: s },
  );
}

export async function checkPayment(user: User, e: Entities, lang: AssistantLang): Promise<AssistantReply> {
  if (e.orderCode) {
    const o = await db.order.findFirst({ where: { code: e.orderCode, farmerId: user.id }, include: { settlement: true, delivery: { select: { cost: true } } } });
    if (!o) return reply("CHECK_PAYMENT_STATUS", lang, "ff.say.payment.notFound", { code: e.orderCode });
    if (o.settlement?.status === "SETTLED") return reply("CHECK_PAYMENT_STATUS", lang, "ff.say.payment.settled", { code: o.code, net: amount(o.settlement.net), date: day(lang, o.settlement.settledAt ?? o.settlement.createdAt) });
    if (o.settlement) return reply("CHECK_PAYMENT_STATUS", lang, "ff.say.payment.pending", { code: o.code, net: amount(o.settlement.net) });
    if (HOLDS_STOCK.includes(o.status)) {
      const est = settlementFor({ subtotal: o.subtotal, platformFee: o.platformFee, buyerDeliveryFee: o.deliveryFee, actualCourierCost: o.fulfilment === "PICKUP" ? 0 : (o.delivery?.cost ?? 0) });
      return reply("CHECK_PAYMENT_STATUS", lang, "ff.say.payment.awaiting", { code: o.code, net: amount(est.net) });
    }
    return reply("CHECK_PAYMENT_STATUS", lang, "ff.say.payment.notFound", { code: o.code });
  }
  const [pending, last, recent] = await Promise.all([
    db.settlement.findMany({ where: { farmerId: user.id, status: "PENDING" }, select: { net: true } }),
    db.settlement.findFirst({ where: { farmerId: user.id, status: "SETTLED" }, orderBy: { settledAt: "desc" } }),
    db.settlement.findMany({ where: { farmerId: user.id }, orderBy: { createdAt: "desc" }, take: 5, include: { order: { select: { id: true, code: true } } } }),
  ]);
  const rows = recent.map((s) => ({ orderId: s.order.id, code: s.order.code, stage: s.status === "SETTLED" ? ("SETTLED" as const) : ("PENDING" as const), net: s.net, date: (s.settledAt ?? s.createdAt).toISOString() }));
  const total = round2(pending.reduce((a, s) => a + s.net, 0));
  if (!pending.length) return withCard(reply("CHECK_PAYMENT_STATUS", lang, "ff.say.payment.nothing"), { type: "payments", rows });
  const key = last ? "ff.say.payment.summary" : "ff.say.payment.summaryFirst";
  return withCard(
    reply("CHECK_PAYMENT_STATUS", lang, key, { pending: amount(total), n: pending.length, amount: last ? amount(last.net) : "", date: last ? day(lang, last.settledAt ?? last.createdAt) : "" }),
    { type: "payments", rows },
  );
}

/** The farmer's live listings (optionally one crop). */
function liveListings(farmerId: string, cropSlug?: string | null) {
  return db.listing.findMany({ where: { farmerId, status: "ACTIVE", ...(cropSlug && { crop: cropSlug }) }, orderBy: { createdAt: "desc" } });
}

export async function checkStock(user: User, e: Entities, lang: AssistantLang): Promise<AssistantReply> {
  const rows = await liveListings(user.id, e.crop);
  const card = { type: "stock" as const, rows: rows.map((l) => ({ listingId: l.id, crop: l.crop, title: l.title, available: l.availableQty, reserved: l.reservedQty, sold: round2(l.totalQty - l.availableQty - l.reservedQty), unit: l.unit })) };
  if (e.crop) {
    if (!rows.length) return reply("CHECK_STOCK", lang, "ff.say.stock.noneCrop", { crop: crop(lang, e.crop) });
    const available = round2(rows.reduce((a, l) => a + l.availableQty, 0));
    const reserved = round2(rows.reduce((a, l) => a + l.reservedQty, 0));
    return withCard(reply("CHECK_STOCK", lang, "ff.say.stock.one", { crop: crop(lang, e.crop), available: qty(available), reserved: qty(reserved), unit: unitWord(lang, rows[0].unit) }), card);
  }
  if (!rows.length) return reply("CHECK_STOCK", lang, "ff.say.stock.none");
  return withCard(reply("CHECK_STOCK", lang, "ff.say.stock.all", { n: rows.length }), card);
}

export async function checkPrice(user: User, e: Entities, lang: AssistantLang): Promise<AssistantReply> {
  const rows = await liveListings(user.id, e.crop);
  if (e.crop) {
    const advice = await computePriceAdvice(e.crop, user.area).catch(() => null);
    const market = advice?.suggested ?? null;
    const card = { type: "prices" as const, rows: rows.map((l) => ({ listingId: l.id, crop: l.crop, title: l.title, price: l.pricePerUnit, unit: l.unit, market })) };
    if (!rows.length) return reply("CHECK_LISTING_PRICE", lang, "ff.say.price.noListing", { crop: crop(lang, e.crop) });
    const l = rows[0];
    const vars = { crop: crop(lang, e.crop), price: amount(l.pricePerUnit), unit: unitWord(lang, l.unit), market: market ? amount(market) : "" };
    return withCard(reply("CHECK_LISTING_PRICE", lang, market ? "ff.say.price.oneMarket" : "ff.say.price.one", vars), card);
  }
  if (!rows.length) return reply("CHECK_LISTING_PRICE", lang, "ff.say.stock.none");
  return withCard(reply("CHECK_LISTING_PRICE", lang, "ff.say.price.all"), {
    type: "prices",
    rows: rows.map((l) => ({ listingId: l.id, crop: l.crop, title: l.title, price: l.pricePerUnit, unit: l.unit, market: null })),
  });
}

export async function checkStatus(user: User, e: Entities, lang: AssistantLang): Promise<AssistantReply> {
  const batches = await db.batch.findMany({
    where: { farmerId: user.id, ...(e.crop && { crop: e.crop }), OR: [{ listing: { is: null } }, { listing: { status: { not: "REMOVED" } } }] },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const card = { type: "status" as const, rows: batches.map((b) => ({ batchId: b.id, crop: b.crop, status: b.status, note: b.adminNote, createdAt: b.createdAt.toISOString() })) };
  if (!batches.length) return reply("CHECK_LISTING_STATUS", lang, "ff.say.status.none");
  if (e.crop) {
    const b = batches[0];
    return withCard(reply("CHECK_LISTING_STATUS", lang, `ff.say.status.${b.status}` as MessageKey, { crop: crop(lang, b.crop), note: b.adminNote ?? "-" }), card);
  }
  const count = (s: string) => batches.filter((b) => b.status === s).length;
  return withCard(reply("CHECK_LISTING_STATUS", lang, "ff.say.status.summary", { pending: count("PENDING_REVIEW"), live: count("APPROVED"), changes: count("RESUBMIT"), rejected: count("REJECTED") }), card);
}

export async function checkDelivery(user: User, e: Entities, lang: AssistantLang): Promise<AssistantReply> {
  const statusText = (s: string) => translate(lang, `status.${s}` as MessageKey);
  if (e.orderCode) {
    const o = await db.order.findFirst({ where: { code: e.orderCode, farmerId: user.id }, include: { delivery: { include: { worker: { select: { name: true } } } } } });
    if (!o) return reply("DELIVERY_STATUS", lang, "ff.say.payment.notFound", { code: e.orderCode });
    const rider = o.delivery?.worker?.name;
    return reply("DELIVERY_STATUS", lang, rider ? "ff.say.delivery.rider" : "ff.say.delivery.one", { code: o.code, status: statusText(o.status), rider: rider ?? "" });
  }
  const orders = await db.order.findMany({ where: { farmerId: user.id, status: { in: IN_FLIGHT } }, include: { delivery: { include: { worker: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 8 });
  if (!orders.length) return reply("DELIVERY_STATUS", lang, "ff.say.delivery.none");
  return withCard(reply("DELIVERY_STATUS", lang, "ff.say.delivery.list", { n: orders.length }), {
    type: "deliveries",
    rows: orders.map((o) => ({ orderId: o.id, code: o.code, status: o.status, rider: o.delivery?.worker?.name ?? null, fulfilment: o.fulfilment })),
  });
}
