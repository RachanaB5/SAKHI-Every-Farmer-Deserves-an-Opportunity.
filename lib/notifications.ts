// In-app notifications (the farmer's bell). A row stores a type plus data
// such as { crop, from, to }; the client turns that into a sentence in the
// reader's language. Every new notification is pushed live over SSE.
import "server-only";
import type { Notification, Prisma } from "@prisma/client";
import type { OrderNotificationType } from "@/lib/assistant/agent-text";
import { db } from "@/lib/db";
import { publish } from "@/lib/events";

/** Quality feedback on listings, plus order progress (see lib/assistant/agent-text.ts). */
export type NotificationType = "QUALITY_COMPLAINT" | "GRADE_DOWN" | "GRADE_UP" | OrderNotificationType;

/**
 * Stores a notification and pushes it to the user's open tabs.
 * @param link - page the notification opens
 */
export async function notifyUser(userId: string, type: NotificationType, data: Prisma.InputJsonObject, link?: string) {
  const n = await db.notification.create({ data: { userId, type, data, link: link ?? null } });
  publish({ type: "notification.created", id: n.id, userIds: [userId], data: { type } });
  return n;
}

/** Client shape. */
export function serializeNotification(n: Notification) {
  return {
    id: n.id,
    type: n.type as NotificationType,
    data: (n.data ?? {}) as Record<string, unknown>,
    link: n.link,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}

export type SerializedNotification = ReturnType<typeof serializeNotification>;

/** Latest notifications plus the unread count. */
export async function listNotifications(userId: string, take = 30) {
  const [rows, unread] = await Promise.all([
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items: rows.map(serializeNotification), unread };
}

/**
 * Marks notifications read.
 * @param ids - specific notifications; omit to mark all
 */
export async function markNotificationsRead(userId: string, ids?: string[]) {
  const { count } = await db.notification.updateMany({ where: { userId, readAt: null, ...(ids && { id: { in: ids } }) }, data: { readAt: new Date() } });
  return count;
}
