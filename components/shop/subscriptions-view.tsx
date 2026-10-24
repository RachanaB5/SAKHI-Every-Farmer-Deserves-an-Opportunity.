// /shop/subscriptions — recurring plans: pause / resume, deliver the next
// one now, edit quantity and schedule, cancel, and recent deliveries.
"use client";

import { CalendarClock, Loader2, Pencil, Plus, Repeat, Trash2, Zap } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { MediaImage } from "@/components/common/media-image";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { EmptyState, ErrorState, SkeletonCards } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useLive } from "@/hooks/use-live";
import { sendJSON } from "@/lib/fetcher";
import { formatINR } from "@/lib/format";
import type { SubscriptionSlot } from "@/lib/subscription-schedule";
import { cn } from "@/lib/utils";
import { deliveryLabel, ScheduleFields, SubscribeSheet, type ScheduleValue } from "./subscribe-sheet";

interface Plan {
  id: string;
  crop: string;
  qty: number;
  unit: string;
  frequency: "DAILY" | "WEEKLY";
  dayOfWeek: number | null;
  preferredSlot: SubscriptionSlot;
  schedule: string;
  active: boolean;
  nextDeliveryAt: string | null;
  listing: { id: string; title: string; imageUrl: string | null; pricePerUnit: number; status: string; availableQty: number; farmer: string; village: string | null } | null;
  estimate: number | null;
  orders: { id: string; code: string; status: string; total: number; createdAt: string }[];
}

/** Subscriptions page body. */
export function SubscriptionsView() {
  const { data, error, isLoading, mutate } = useSWR<Plan[]>("/api/subscriptions");
  useLive(["order.updated"], () => mutate());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [cancelling, setCancelling] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await fn();
      if (done) toast.success(done);
      await mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const runNow = (p: Plan) =>
    act(`run:${p.id}`, async () => {
      const r = await sendJSON<{ code: string; switchedTo: string | null }>(`/api/subscriptions/${p.id}/run`, {});
      toast.success(`Order ${r.code} placed${r.switchedTo ? ` from ${r.switchedTo}` : ""}`);
    });

  const header = (
    <PageHeader
      title="Fresh, on *repeat*"
      description="Milk every morning, vegetables every Sunday, set it once, pause any time."
      actions={
        <Button className="min-h-11" onClick={() => setCreating(true)}>
          <Plus /> New plan
        </Button>
      }
    />
  );

  if (isLoading) return <div className="space-y-6">{header}<SkeletonCards count={3} /></div>;
  if (error || !data) return <ErrorState message={error?.message} onRetry={() => mutate()} />;

  return (
    <div className="space-y-6">
      {header}
      {data.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No plans yet"
          body="Pick something you buy often and choose when it should arrive."
          action={
            <Button className="min-h-11" onClick={() => setCreating(true)}>
              <Plus /> Start a plan
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <AnimatePresence initial={false}>
            {data.map((p) => {
              const unavailable = p.listing && (p.listing.status !== "ACTIVE" || p.listing.availableQty < p.qty);
              return (
                <motion.article
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className={cn("min-w-0 rounded-3xl border bg-card p-4 transition-opacity sm:p-5", !p.active && "opacity-75")}
                >
                  <div className="flex items-start gap-3">
                    <span className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-muted">{p.listing?.imageUrl && <MediaImage src={p.listing.imageUrl} alt="" sizes="64px" />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.listing?.title ?? p.crop}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {p.listing ? `${p.listing.farmer}${p.listing.village ? ` · ${p.listing.village}` : ""}` : "Any nearby farm"}
                      </p>
                      <p className="mt-1 text-sm">
                        <b className="tabular">
                          {p.qty} {p.unit}
                        </b>{" "}
                        · {p.schedule}
                      </p>
                    </div>
                    <label className="flex shrink-0 flex-col items-center gap-1 text-[11px] text-muted-foreground">
                      <Switch
                        checked={p.active}
                        disabled={busy === `toggle:${p.id}`}
                        onCheckedChange={(on) => act(`toggle:${p.id}`, () => sendJSON(`/api/subscriptions/${p.id}`, { active: on }, "PATCH"), on ? "Plan resumed" : "Plan paused")}
                        aria-label={p.active ? "Pause plan" : "Resume plan"}
                      />
                      {p.active ? "On" : "Paused"}
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-muted/60 px-3 py-2.5 text-sm">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock className="size-4 text-muted-foreground" />
                      {p.nextDeliveryAt ? deliveryLabel(p.nextDeliveryAt, p.preferredSlot) : "Paused, no deliveries"}
                    </span>
                    {p.estimate !== null && <span className="tabular text-muted-foreground">≈ {formatINR(p.estimate)} per delivery</span>}
                  </div>
                  {unavailable && <p className="mt-2 text-xs text-muted-foreground">This farm is running low, the next delivery will come from another nearby farm&apos;s {p.crop} if needed.</p>}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" className="min-h-11" disabled={!p.active || busy === `run:${p.id}`} onClick={() => runNow(p)}>
                      {busy === `run:${p.id}` ? <Loader2 className="animate-spin" /> : <Zap />} Deliver now
                    </Button>
                    <Button variant="ghost" className="min-h-11" onClick={() => setEditing(p)}>
                      <Pencil /> Edit
                    </Button>
                    <Button variant="ghost" className="min-h-11 text-muted-foreground" onClick={() => setCancelling(p)} aria-label="Cancel plan">
                      <Trash2 />
                    </Button>
                  </div>

                  {p.orders.length > 0 && (
                    <div className="mt-4 border-t pt-3">
                      <p className="mb-2 text-xs text-muted-foreground">Recent deliveries</p>
                      <ul className="space-y-1.5">
                        {p.orders.map((o) => (
                          <li key={o.id}>
                            <Link href={`/shop/orders/${o.id}`} className="flex min-h-9 items-center gap-2 text-sm hover:underline">
                              <span className="font-mono text-xs">{o.code}</span>
                              <StatusBadge status={o.status} />
                              <span className="tabular ml-auto">{formatINR(o.total)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <SubscribeSheet open={creating} onOpenChange={setCreating} onCreated={() => mutate()} />
      {editing && <EditPlan plan={editing} onClose={() => setEditing(null)} onSaved={() => mutate()} />}
      <ResponsiveModal open={Boolean(cancelling)} onOpenChange={(o) => !o && setCancelling(null)} title="Cancel this plan?">
        <p className="text-sm text-muted-foreground">No more deliveries will be placed. Past orders stay in your history. You can pause instead if you&apos;re away for a while.</p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="min-h-11" onClick={() => setCancelling(null)}>
            Keep plan
          </Button>
          <Button
            variant="destructive"
            className="min-h-11"
            onClick={() => {
              const p = cancelling;
              setCancelling(null);
              if (p) act(`del:${p.id}`, () => sendJSON(`/api/subscriptions/${p.id}`, {}, "DELETE"), "Plan cancelled");
            }}
          >
            Cancel plan
          </Button>
        </div>
      </ResponsiveModal>
    </div>
  );
}

function EditPlan({ plan, onClose, onSaved }: { plan: Plan; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<ScheduleValue>({ qty: String(plan.qty), frequency: plan.frequency, dayOfWeek: plan.dayOfWeek ?? 0, preferredSlot: plan.preferredSlot });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await sendJSON(`/api/subscriptions/${plan.id}`, { qty: Number(v.qty), frequency: v.frequency, dayOfWeek: v.frequency === "WEEKLY" ? v.dayOfWeek : null, preferredSlot: v.preferredSlot }, "PATCH");
      toast.success("Plan updated");
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ResponsiveModal open onOpenChange={(o) => !o && onClose()} title={`Edit ${plan.listing?.title ?? plan.crop}`}>
      <div className="space-y-5">
        <ScheduleFields value={v} onChange={setV} unit={plan.unit} min={plan.unit === "kg" ? 0.5 : 1} />
        <Button className="min-h-12 w-full" size="lg" disabled={busy || !(Number(v.qty) > 0)} onClick={save}>
          {busy && <Loader2 className="animate-spin" />} Save changes
        </Button>
      </div>
    </ResponsiveModal>
  );
}
