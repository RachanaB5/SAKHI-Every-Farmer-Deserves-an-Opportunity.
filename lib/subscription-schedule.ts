// Subscription scheduling maths (pure, no DB). Delivery days and slots are
// Indian Standard Time regardless of the server's zone; the order for a
// delivery is placed LEAD_HOURS before the slot opens so the farmer can pack.

/** Delivery windows a subscription can use. */
export const SUBSCRIPTION_SLOTS = ["6–8 AM", "7–9 AM", "9–11 AM", "5–7 PM"] as const;
export type SubscriptionSlot = (typeof SUBSCRIPTION_SLOTS)[number];

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Hours between placing the order and the slot opening. */
export const LEAD_HOURS = 2;
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** 24h start hour of a slot label like "6–8 AM" or "5–7 PM" (defaults to 7). */
export function slotStartHour(slot: string): number {
  const m = /^(\d{1,2})\s*[–-]\s*\d{1,2}\s*(AM|PM)$/i.exec(slot.trim());
  if (!m) return 7;
  const h = Number(m[1]) % 12;
  return m[2].toUpperCase() === "PM" ? h + 12 : h;
}

/**
 * When the next order should be placed.
 * @param frequency - DAILY or WEEKLY
 * @param dayOfWeek - 0 = Sunday … 6 = Saturday (weekly only)
 * @param slot - delivery window label
 * @param from - strictly after this instant
 * @returns the run instant and the delivery day it serves
 */
export function nextRun(frequency: "DAILY" | "WEEKLY", dayOfWeek: number | null | undefined, slot: string, from: Date = new Date()): { runAt: Date; deliveryAt: Date } {
  const startHour = slotStartHour(slot);
  // Midnight IST of the current IST day, expressed as a UTC instant.
  const istNow = from.getTime() + IST_OFFSET_MS;
  const istMidnight = istNow - (((istNow % DAY_MS) + DAY_MS) % DAY_MS) - IST_OFFSET_MS;
  for (let d = 0; d <= 8; d++) {
    const dayStart = istMidnight + d * DAY_MS;
    const weekday = new Date(dayStart + IST_OFFSET_MS).getUTCDay();
    if (frequency === "WEEKLY" && weekday !== (dayOfWeek ?? 0)) continue;
    const deliveryAt = dayStart + startHour * 3_600_000;
    const runAt = deliveryAt - LEAD_HOURS * 3_600_000;
    if (runAt > from.getTime()) return { runAt: new Date(runAt), deliveryAt: new Date(deliveryAt) };
  }
  // Unreachable for valid input; fall back to a day later.
  return { runAt: new Date(from.getTime() + DAY_MS), deliveryAt: new Date(from.getTime() + DAY_MS + LEAD_HOURS * 3_600_000) };
}

/** Human summary, e.g. "Every day, 6–8 AM" or "Every Sunday, 9–11 AM". */
export function describeSchedule(frequency: "DAILY" | "WEEKLY", dayOfWeek: number | null | undefined, slot: string): string {
  return frequency === "DAILY" ? `Every day, ${slot}` : `Every ${WEEKDAYS[dayOfWeek ?? 0]}, ${slot}`;
}
