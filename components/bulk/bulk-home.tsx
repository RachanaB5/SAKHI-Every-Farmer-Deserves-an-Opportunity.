// Bulk buyer home: KPIs, open / awarded requirements with live offer
// counts, best AI score and deadline countdowns, and the post CTA.
"use client";

import { ArrowUpRight, Flame, Handshake, Plus, Repeat } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { MediaImage } from "@/components/common/media-image";
import { Photo } from "@/components/common/photo";
import { StatusBadge } from "@/components/common/status-badge";
import { CountUp } from "@/components/motion/count-up";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/use-live";
import type { SerializedDemand } from "@/lib/bulk";
import { CROPS, isCropSlug } from "@/lib/crops";
import { formatINR, formatINRCompact } from "@/lib/format";
import type { SerializedOrder } from "@/lib/orders/queries";
import { IN_FLIGHT } from "@/lib/orders/state";
import { BulkTabs } from "./bulk-tabs";
import { Countdown } from "./deadline";

/** /bulk */
export function BulkHome({ orgName }: { orgName: string }) {
  const { data, error, isLoading, mutate } = useSWR<SerializedDemand[]>("/api/demands");
  const { data: orders } = useSWR<SerializedOrder[]>("/api/orders?type=BULK&limit=100");
  useLive(["offer.updated", "demand.updated", "order.updated"], () => mutate());

  const open = data?.filter((d) => d.status === "OPEN") ?? [];
  const toReview = open.reduce((s, d) => s + d.offers.filter((o) => o.status === "PENDING" || (o.status === "COUNTERED" && o.lastActor === "FARMER")).length, 0);
  const active = orders?.filter((o) => (IN_FLIGHT as readonly string[]).includes(o.status)).length ?? 0;
  const [since] = useState(() => Date.now() - 30 * 86_400_000);
  const spend = orders?.filter((o) => new Date(o.createdAt).getTime() > since && o.status !== "CANCELLED").reduce((s, o) => s + o.total, 0) ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow={orgName}
        title="Bulk *procurement*"
        description="Post what your kitchen needs. Nearby farmers offer, AI ranks them, you decide."
        actions={
          <Button asChild variant="brand">
            <Link href="/bulk/demands/new">
              <Plus /> Post requirement
            </Link>
          </Button>
        }
      />
      <BulkTabs />
      <div className="relative mb-5 overflow-hidden rounded-3xl">
        <Photo name="field-panorama" scrim="left" position="50% 75%" sizes="(max-width: 1152px) 100vw, 1100px" className="h-28 w-full sm:h-36" />
        <p className="absolute inset-y-0 left-0 flex max-w-[70%] items-center px-5 text-base font-semibold text-white sm:px-7 sm:text-xl">Sourced direct from verified farms, handed over with an OTP.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: "Open requirements", v: open.length },
          { k: "Offers to review", v: toReview, hot: toReview > 0 },
          { k: "Active orders", v: active },
          { k: "Spend · 30 days", v: spend, money: true },
        ].map((kpi, i) => (
          <motion.div key={kpi.k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className={`rounded-3xl border p-4 ${kpi.hot ? "border-lime bg-lime/15" : "bg-card"}`}>
            <p className="text-xs text-muted-foreground">{kpi.k}</p>
            <p className="tabular mt-1 text-2xl font-semibold">
              <CountUp value={kpi.v} format={kpi.money ? formatINRCompact : undefined} />
            </p>
          </motion.div>
        ))}
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Your requirements</h2>
      {isLoading && <SkeletonRows count={3} />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data?.length === 0 && (
        <EmptyState icon={Handshake} title="No requirements yet" body="Post your first bulk requirement, farmers nearby are notified instantly." action={<Button asChild><Link href="/bulk/demands/new">Post requirement</Link></Button>} />
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {data?.map((d, i) => {
          const best = d.offers.filter((o) => o.aiScore !== null).sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))[0];
          const img = isCropSlug(d.crop) ? CROPS[d.crop].image : null;
          return (
            <motion.li key={d.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.05 }}>
              <Link href={`/bulk/demands/${d.id}`} className="group flex h-full gap-3 rounded-3xl border bg-card p-4 transition-colors hover:border-foreground/30">
                <span className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-muted">{img && <MediaImage src={img} sizes="64px" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">
                      {d.qtyKg} kg {d.cropName}
                    </span>
                    {d.urgent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-tomato/15 px-2 py-0.5 text-[11px] font-semibold text-tomato">
                        <Flame className="size-3" /> Urgent
                      </span>
                    )}
                    {d.recurring && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                        <Repeat className="size-3" /> {d.frequency === "DAILY" ? "Daily" : "Weekly"}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    Target {formatINR(d.targetPrice)}/kg · grade {d.grade}
                    {d.status === "OPEN" && (
                      <>
                        {" "}
                        · <Countdown to={d.deadline} />
                      </>
                    )}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <StatusBadge status={d.status} pulse={d.status === "OPEN"} />
                    <span className="text-muted-foreground">
                      {d.offerCount} offer{d.offerCount === 1 ? "" : "s"}
                    </span>
                    {best && <span className="rounded-full bg-lime/35 px-2 py-0.5 text-xs font-semibold">Top score {Math.round(best.aiScore!)}</span>}
                  </span>
                </span>
                <ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
