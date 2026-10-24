// Buyer's orders: Active / Past tabs with live status, mini progress bar,
// items preview and total.
"use client";

import { ArrowUpRight, PackageOpen } from "lucide-react";
import { LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { MediaImage } from "@/components/common/media-image";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/use-live";
import { formatINR, timeAgo } from "@/lib/format";
import type { SerializedOrder } from "@/lib/orders/queries";
import { IN_FLIGHT } from "@/lib/orders/state";
import { cn } from "@/lib/utils";

const STEP_PROGRESS: Record<string, number> = { PLACED: 10, CONFIRMED: 30, PACKED: 55, OUT_FOR_DELIVERY: 80, READY_FOR_PICKUP: 80, DELIVERED: 100, COLLECTED: 100 };

/**
 * @param basePath - detail route prefix (/shop/orders or /bulk/orders)
 */
export function OrdersList({ basePath = "/shop/orders", title = "Your *orders*", shopHref = "/shop" }: { basePath?: string; title?: string; shopHref?: string }) {
  const [scope, setScope] = useState<"active" | "past">("active");
  const { data, error, isLoading, mutate } = useSWR<SerializedOrder[]>(`/api/orders?scope=${scope}`);
  useLive(["order.updated"], () => mutate());

  return (
    <div>
      <PageHeader title={title} />
      <LayoutGroup id="orders-scope">
        <div className="mb-4 inline-flex rounded-full border p-1">
          {(["active", "past"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setScope(s)} className={cn("relative h-10 rounded-full px-5 text-sm font-medium capitalize", scope === s ? "text-background" : "text-muted-foreground")}>
              {scope === s && <motion.span layoutId="scope-pill" className="absolute inset-0 -z-10 rounded-full bg-foreground" />}
              {s}
            </button>
          ))}
        </div>
      </LayoutGroup>
      {isLoading && <SkeletonRows count={4} />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={PackageOpen}
          title={scope === "active" ? "No orders on the way" : "No past orders yet"}
          action={
            <Button asChild variant="outline">
              <Link href={shopHref}>Start shopping</Link>
            </Button>
          }
        />
      )}
      <ul className="space-y-3">
        {data?.map((o, i) => {
          const live = IN_FLIGHT.includes(o.status as (typeof IN_FLIGHT)[number]);
          return (
            <motion.li key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
              <Link href={`${basePath}/${o.id}`} className="block rounded-3xl border bg-card p-4 transition-colors hover:border-foreground/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{o.code}</p>
                    <p className="text-sm text-muted-foreground">
                      {o.farmer.name} · {timeAgo(o.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={o.status} pulse={live} />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {o.items.slice(0, 4).map((it) => (
                      <span key={it.id} className="relative size-9 overflow-hidden rounded-full border-2 border-card bg-muted">
                        {it.imageUrl && <MediaImage src={it.imageUrl} sizes="36px" />}
                      </span>
                    ))}
                  </div>
                  <p className="min-w-0 flex-1 text-sm leading-snug break-words text-muted-foreground">
                    {o.items.slice(0, 2).map((it) => it.title).join(", ")}
                    {o.items.length > 2 ? ` +${o.items.length - 2} more` : ""}
                  </p>
                  <p className="tabular text-sm font-semibold">{formatINR(o.total)}</p>
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </div>
                {live && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <motion.div className="h-full rounded-full bg-lime" initial={{ width: 0 }} animate={{ width: `${STEP_PROGRESS[o.status] ?? 5}%` }} transition={{ duration: 0.8 }} />
                  </div>
                )}
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
