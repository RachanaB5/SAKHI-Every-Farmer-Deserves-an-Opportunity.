// Farmer's bell: customer complaints and grade changes on their listings,
// plus order progress (new orders, who is coming, arrivals, deliveries),
// pushed live. Opening the list marks everything read. Text is built from
// each notification's data in the farmer's language.
"use client";

import { AlertTriangle, Bell, Bike, PackageCheck, ShoppingBag, Store, TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/use-live";
import { isOrderNotification, orderNotificationText, type OrderNotificationType } from "@/lib/assistant/agent-text";
import { cropName } from "@/lib/crops";
import { sendJSON } from "@/lib/fetcher";
import { timeAgo } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import type { SerializedNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";

interface Feed {
  items: SerializedNotification[];
  unread: number;
}

const ISSUE_KEYS = ["NOT_FRESH", "DAMAGED", "WRONG_ITEM", "SHORT_QTY"];

const ORDER_ICON: Record<OrderNotificationType, typeof Bell> = {
  ORDER_NEW: ShoppingBag,
  RIDER_BOOKED: Bike,
  RIDER_ARRIVED: Bike,
  BUYER_COMING: Store,
  BUYER_ARRIVED: Store,
  ORDER_DELIVERED: PackageCheck,
};

/** One notification as sentences in the reader's language. */
function useLines() {
  const { t, lang } = useI18n();
  return (n: SerializedNotification): string[] => {
    // Order progress reads exactly as Sakhi says it.
    if (isOrderNotification(n.type)) return [orderNotificationText(lang, n.type, n.data)];
    const crop = cropName(String(n.data.crop ?? ""), lang);
    if (n.type === "QUALITY_COMPLAINT") {
      const issue = ISSUE_KEYS.includes(String(n.data.issue)) ? t(`issue.${n.data.issue}` as MessageKey) : String(n.data.issue ?? "");
      const complaints = Number(n.data.complaints ?? 0);
      return [
        t("notif.complaint", { crop, issue }),
        ...(n.data.photoBacked ? [t("notif.complaintPhoto")] : []),
        ...(complaints >= 2 ? [t("notif.complaintCount", { count: complaints })] : []),
      ];
    }
    const vars = { crop, from: String(n.data.from ?? ""), to: String(n.data.to ?? "") };
    return n.type === "GRADE_DOWN" ? [t("notif.gradeDown", vars), t("notif.gradeDownHelp")] : [t("notif.gradeUp", vars)];
  };
}

/** Bell button with unread count; opens the notification list. */
export function NotificationBell({ className }: { className?: string }) {
  const { t, lang } = useI18n();
  const lines = useLines();
  const [open, setOpen] = useState(false);
  const { data, mutate } = useSWR<Feed>("/api/notifications");
  useLive(["notification.created"], () => mutate());
  const unread = data?.unread ?? 0;

  function show(next: boolean) {
    setOpen(next);
    // Opening the list counts as reading it; the dots stay until it closes.
    if (!next && unread > 0) sendJSON("/api/notifications/read", {}).then(() => mutate(), () => {});
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn("relative size-11", className)}
        aria-label={unread ? `${t("notif.open")} (${unread})` : t("notif.open")}
        onClick={() => show(true)}
      >
        <Bell className="size-6" />
        {unread > 0 && (
          <motion.span
            key={unread}
            initial={{ scale: 0.4 }}
            animate={{ scale: 1 }}
            className="absolute top-1 right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-tomato px-1 text-[11px] font-bold text-white"
          >
            {unread}
          </motion.span>
        )}
      </Button>
      <ResponsiveModal open={open} onOpenChange={show} title={t("notif.title")}>
        {!data?.items.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("notif.empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {data.items.map((n) => {
              const order = isOrderNotification(n.type);
              const Icon = isOrderNotification(n.type) ? ORDER_ICON[n.type] : n.type === "GRADE_UP" ? TrendingUp : n.type === "GRADE_DOWN" ? TrendingDown : AlertTriangle;
              const [first, ...rest] = lines(n);
              const body = (
                <div className={cn("flex gap-3 rounded-2xl border p-3", !n.read && "border-lime/60 bg-lime/10")}>
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-xl",
                      order ? "bg-lime/40" : n.type === "GRADE_UP" ? "bg-success/15 text-success" : n.type === "GRADE_DOWN" ? "bg-tomato/15 text-tomato" : "bg-warning/20",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{first}</p>
                    {rest.map((line) => (
                      <p key={line} className="mt-0.5 text-sm text-muted-foreground">
                        {line}
                      </p>
                    ))}
                    <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.createdAt, lang)}</p>
                  </div>
                  {!n.read && <span className="mt-1 size-2 shrink-0 rounded-full bg-tomato" aria-hidden />}
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} onClick={() => show(false)} className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {unread > 0 && (
          <Button variant="outline" className="mt-4 w-full" onClick={() => sendJSON("/api/notifications/read", {}).then(() => mutate())}>
            {t("notif.markAll")}
          </Button>
        )}
      </ResponsiveModal>
    </>
  );
}
