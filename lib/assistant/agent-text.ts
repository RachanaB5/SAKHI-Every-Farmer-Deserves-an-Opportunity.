// What Sakhi and the farmer's bell say about an order's progress: one
// sentence per order notification, filled from its stored data in the
// farmer's language. Client-safe: the bell shows it, Sakhi reads it aloud.
import { translate, type Lang, type MessageKey } from "@/lib/i18n";
import { amount, crop, qty, unitWord } from "./reply";

export const ORDER_NOTIFICATION_TYPES = ["ORDER_NEW", "RIDER_BOOKED", "RIDER_ARRIVED", "BUYER_COMING", "BUYER_ARRIVED", "ORDER_DELIVERED"] as const;
export type OrderNotificationType = (typeof ORDER_NOTIFICATION_TYPES)[number];

export const isOrderNotification = (type: string): type is OrderNotificationType => (ORDER_NOTIFICATION_TYPES as readonly string[]).includes(type);

/** One order line as stored on a notification (a type, not an interface, so it fits Prisma's JSON). */
export type AgentItem = {
  crop: string | null;
  title: string;
  qty: number;
  unit: string;
};

/** "5 kg tomato, 2 dozen eggs" in the farmer's language. */
export function itemsText(lang: Lang, items: AgentItem[]): string {
  return items.map((i) => `${qty(i.qty)} ${unitWord(lang, i.unit)} ${i.crop ? crop(lang, i.crop) : i.title}`).join(", ");
}

/** Checkout's pickup window ("Today 5–7 PM") in the farmer's language; anything else as it is. */
export function slotText(lang: Lang, slot: string): string {
  const m = /^(Today|Tomorrow) (\d{1,2}–\d{1,2}) (AM|PM)$/.exec(slot.trim());
  if (!m) return slot;
  return translate(lang, "ff.slot.when", {
    day: translate(lang, m[1] === "Today" ? "ff.slot.today" : "ff.slot.tomorrow"),
    range: m[2],
    part: translate(lang, m[3] === "AM" ? "ff.slot.am" : "ff.slot.pm"),
  });
}

/** The sentence for one order notification. */
export function orderNotificationText(lang: Lang, type: OrderNotificationType, data: Record<string, unknown>): string {
  const str = (k: string) => (data[k] == null ? "" : String(data[k]));
  const vars = {
    code: str("code"),
    buyer: str("buyer"),
    rider: str("rider"),
    min: str("etaMin"),
    net: amount(Number(data.net ?? 0)),
    items: Array.isArray(data.items) ? itemsText(lang, data.items as AgentItem[]) : "",
    slot: data.slot ? slotText(lang, str("slot")) : "",
  };
  const key: MessageKey =
    type === "ORDER_NEW"
      ? data.fulfilment === "PICKUP"
        ? vars.slot
          ? "ff.agent.new.pickup"
          : "ff.agent.new.pickupNoSlot"
        : vars.rider
          ? "ff.agent.new.rider"
          : "ff.agent.new.noRider"
      : type === "RIDER_BOOKED"
        ? "ff.agent.riderBooked"
        : type === "RIDER_ARRIVED"
          ? "ff.agent.riderArrived"
          : type === "BUYER_COMING"
            ? "ff.agent.buyerComing"
            : type === "BUYER_ARRIVED"
              ? "ff.agent.buyerArrived"
              : "ff.agent.delivered";
  return translate(lang, key, vars);
}
