// Confirmed changes: UPDATE_PRICE, UPDATE_STOCK and BOOK_DELIVERY. Each
// "prepare" resolves the exact record, shows what will change and returns a
// signed token; "execute" re-checks everything through the normal service.
import "server-only";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { bookDelivery } from "@/lib/delivery/assign";
import { round2 } from "@/lib/fees";
import { setAvailableStock, soldQty } from "@/lib/inventory";
import { updateOwnListing } from "@/lib/listings";
import { signConfirm } from "../confirm";
import type { AssistantLang, Entities } from "../intents";
import { amount, crop, qty, reply, say, unitWord, withCard } from "../reply";
import type { AssistantReply } from "../types";

/** The farmer's most recent sellable listing of a crop (live first, then paused / sold out). */
async function ownListing(farmerId: string, cropSlug: string) {
  const rows = await db.listing.findMany({ where: { farmerId, crop: cropSlug, status: { in: ["ACTIVE", "PAUSED", "SOLD_OUT"] } }, include: { batch: { select: { quantityKg: true } } }, orderBy: { createdAt: "desc" } });
  return rows.find((l) => l.status === "ACTIVE") ?? rows.find((l) => l.status === "PAUSED") ?? rows[0] ?? null;
}

export async function preparePrice(user: User, e: Entities, lang: AssistantLang): Promise<AssistantReply> {
  const l = await ownListing(user.id, e.crop!);
  const name = crop(lang, e.crop!);
  if (!l || l.status === "SOLD_OUT") return reply("UPDATE_PRICE", lang, "ff.say.price.noListing", { crop: name });
  const unit = unitWord(lang, l.unit);
  return {
    ...reply("UPDATE_PRICE", lang, "ff.say.price.confirm", { crop: name, from: amount(l.pricePerUnit), to: amount(e.price!), unit }),
    needsConfirmation: true,
    confirmToken: await signConfirm(user.id, { intent: "UPDATE_PRICE", lang, listingId: l.id, price: e.price! }),
    card: {
      type: "confirm",
      intent: "UPDATE_PRICE",
      entities: { crop: e.crop, price: e.price },
      title: say(lang, "ff.card.confirmTitle"),
      rows: [
        { label: say(lang, "ff.card.crop"), value: l.title },
        { label: say(lang, "ff.card.from"), value: `₹${amount(l.pricePerUnit)}/${unit}` },
      ],
      editable: [{ field: "price", label: say(lang, "ff.card.to"), value: e.price!, unit: `₹/${unit}` }],
    },
  };
}

export async function executePrice(user: User, p: { listingId: string; price: number }, lang: AssistantLang): Promise<AssistantReply> {
  const { after } = await updateOwnListing(user.id, p.listingId, { price: p.price });
  return reply("UPDATE_PRICE", lang, "ff.say.price.done", { crop: crop(lang, after.crop), to: amount(after.pricePerUnit), unit: unitWord(lang, after.unit) });
}

export async function prepareStock(user: User, e: Entities, lang: AssistantLang): Promise<AssistantReply> {
  const l = await ownListing(user.id, e.crop!);
  const name = crop(lang, e.crop!);
  if (!l) return reply("UPDATE_STOCK", lang, "ff.say.stock.noneCrop", { crop: name });
  const unit = unitWord(lang, l.unit);
  const cap = round2(Math.max(0, l.batch.quantityKg - soldQty(l) - l.reservedQty));
  if (e.qty! > cap) return reply("UPDATE_STOCK", lang, "ff.say.stock.cap", { crop: name, cap: qty(cap), unit });
  return {
    ...reply("UPDATE_STOCK", lang, "ff.say.stock.confirm", { crop: name, from: qty(l.availableQty), to: qty(e.qty!), unit }),
    needsConfirmation: true,
    confirmToken: await signConfirm(user.id, { intent: "UPDATE_STOCK", lang, listingId: l.id, qty: e.qty! }),
    card: {
      type: "confirm",
      intent: "UPDATE_STOCK",
      entities: { crop: e.crop, qty: e.qty },
      title: say(lang, "ff.card.confirmTitle"),
      rows: [
        { label: say(lang, "ff.card.crop"), value: l.title },
        { label: say(lang, "ff.card.from"), value: `${qty(l.availableQty)} ${unit}` },
      ],
      editable: [{ field: "qty", label: say(lang, "ff.card.to"), value: e.qty!, unit }],
    },
  };
}

export async function executeStock(user: User, p: { listingId: string; qty: number }, lang: AssistantLang): Promise<AssistantReply> {
  const r = await setAvailableStock(user.id, p.listingId, p.qty);
  const l = await db.listing.findUniqueOrThrow({ where: { id: p.listingId }, select: { crop: true } });
  return reply("UPDATE_STOCK", lang, "ff.say.stock.done", { crop: crop(lang, l.crop), to: qty(r.after), unit: unitWord(lang, r.unit) });
}

/** Delivery orders of this farmer that still need a rider. */
async function bookable(farmerId: string) {
  return db.order.findMany({
    where: { farmerId, fulfilment: "DELIVERY", status: { in: ["CONFIRMED", "PACKED"] } },
    include: { buyer: { select: { name: true } }, delivery: { include: { worker: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function prepareBook(user: User, e: Entities, lang: AssistantLang): Promise<AssistantReply> {
  const orders = await bookable(user.id);
  let order = e.orderCode ? orders.find((o) => o.code === e.orderCode) : orders.length === 1 ? orders[0] : undefined;
  if (e.orderCode && !order) {
    const any = await db.order.findFirst({ where: { code: e.orderCode, farmerId: user.id }, include: { delivery: { include: { worker: { select: { name: true } } } } } });
    if (!any) return reply("BOOK_DELIVERY", lang, "ff.say.payment.notFound", { code: e.orderCode });
    if (any.delivery?.worker) return reply("BOOK_DELIVERY", lang, "ff.say.book.already", { code: any.code, rider: any.delivery.worker.name });
    return reply("BOOK_DELIVERY", lang, "ff.say.book.none");
  }
  if (!order) {
    if (!orders.length) return reply("BOOK_DELIVERY", lang, "ff.say.book.none");
    return withCard(reply("BOOK_DELIVERY", lang, "ff.say.ask.order", {}, { followUp: { intent: "BOOK_DELIVERY", entities: {}, missing: ["orderCode"] } }), {
      type: "deliveries",
      rows: orders.map((o) => ({ orderId: o.id, code: o.code, status: o.status, rider: o.delivery?.worker?.name ?? null, fulfilment: o.fulfilment })),
    });
  }
  order = order!;
  if (order.delivery?.worker && order.delivery.status !== "FAILED") return reply("BOOK_DELIVERY", lang, "ff.say.book.already", { code: order.code, rider: order.delivery.worker.name });
  return {
    ...reply("BOOK_DELIVERY", lang, "ff.say.book.confirm", { code: order.code }),
    needsConfirmation: true,
    confirmToken: await signConfirm(user.id, { intent: "BOOK_DELIVERY", lang, orderId: order.id }),
    card: {
      type: "confirm",
      intent: "BOOK_DELIVERY",
      entities: { orderCode: order.code },
      title: say(lang, "ff.card.confirmTitle"),
      rows: [
        { label: say(lang, "ff.card.order"), value: order.code },
        { label: say(lang, "ff.card.buyer"), value: `${order.buyer.name} · ${order.area}` },
      ],
    },
  };
}

export async function executeBook(user: User, p: { orderId: string }, lang: AssistantLang): Promise<AssistantReply> {
  const r = await bookDelivery(p.orderId, user.id);
  const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, select: { code: true } });
  return reply("BOOK_DELIVERY", lang, r.alreadyBooked ? "ff.say.book.already" : "ff.say.book.done", { code: o.code, rider: r.worker?.name ?? "" });
}
