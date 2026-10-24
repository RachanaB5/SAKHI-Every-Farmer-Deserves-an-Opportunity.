// Rider home: active runs (farm → drop) with one-tap "picked up", today's
// completed handovers, and a shortcut to find an order by code/QR/voice.
"use client";

import { ArrowRight, Bike, CheckCircle2, Loader2, MapPin, Package, ScanLine, Sprout } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/use-live";
import { sendJSON } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import type { SerializedOrder } from "@/lib/orders/queries";

/** The /delivery home screen. */
export function Runs() {
  const { data, error, isLoading, mutate } = useSWR<{ active: SerializedOrder[]; done: SerializedOrder[] }>("/api/deliveries");
  useLive(["order.updated", "delivery.updated"], () => mutate());
  const [busy, setBusy] = useState<string | null>(null);

  async function pickedUp(o: SerializedOrder) {
    setBusy(o.id);
    try {
      await sendJSON(`/api/deliveries/${o.id}/pickup`);
      toast.success(`${o.code} picked up, customer notified`);
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Today's *runs*" description={data ? `${data.active.length} active · ${data.done.length} delivered today` : " "} />
      <Link href="/delivery/find" className="mb-5 flex items-center gap-3 rounded-3xl bg-foreground p-4 text-background">
        <span className="grid size-11 place-items-center rounded-2xl bg-lime text-lime-foreground">
          <ScanLine className="size-5" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">Find an order</span>
          <span className="block text-sm opacity-70">Type, scan or say the code</span>
        </span>
        <ArrowRight className="size-5" />
      </Link>

      {isLoading && <SkeletonRows count={3} />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data && data.active.length === 0 && <EmptyState icon={Bike} title="No active runs" body="New bookings from farmers show up here instantly." />}

      <ul className="space-y-3">
        {data?.active.map((o, i) => (
          <motion.li key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-3xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-xl font-semibold tracking-tight">{o.code}</p>
              <StatusBadge status={o.delivery!.status} pulse />
            </div>
            <ol className="mt-3 space-y-2 text-sm">
              <li className="flex gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-lime text-lime-foreground">
                  <Sprout className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{o.farmer.farmName ?? o.farmer.name}</span>
                  <span className="text-muted-foreground">{o.farmer.village}</span>
                </span>
              </li>
              <li className="ml-3 h-3 border-l-2 border-dashed" aria-hidden />
              <li className="flex gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-tomato text-white">
                  <MapPin className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{o.buyer.name}</span>
                  <span className="break-words text-muted-foreground">
                    {o.addressLine}, {o.area}
                  </span>
                </span>
              </li>
            </ol>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Package className="size-3.5" /> {o.items.length} item{o.items.length > 1 ? "s" : ""} · {o.slot ?? "ASAP"}
              {o.delivery?.distanceKm ? ` · ${Math.round(o.delivery.distanceKm)} km` : ""}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {o.delivery?.status === "ASSIGNED" ? (
                <Button onClick={() => pickedUp(o)} disabled={busy === o.id}>
                  {busy === o.id ? <Loader2 className="animate-spin" /> : <Package />} Picked up
                </Button>
              ) : (
                <Button asChild variant="brand">
                  <Link href={`/delivery/${o.id}`}>Hand over</Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={`/delivery/${o.id}`}>Details</Link>
              </Button>
            </div>
          </motion.li>
        ))}
      </ul>

      {data && data.done.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Delivered today</h2>
          <ul className="divide-y rounded-3xl border bg-card">
            {data.done.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <CheckCircle2 className="size-5 text-success" />
                <span className="font-mono font-semibold">{o.code}</span>
                <span className="flex-1 text-muted-foreground">{o.area}</span>
                <span className="text-xs text-muted-foreground">{o.delivery?.verifiedAt ? formatDateTime(o.delivery.verifiedAt) : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
