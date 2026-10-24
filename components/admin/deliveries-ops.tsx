// Admin delivery management: riders (availability + load), active runs
// with reassignment, failed handovers, and the OTP / QR attempt log.
"use client";

import { AlertTriangle, Bike, CheckCircle2, KeyRound, QrCode, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ErrorState, SkeletonRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Switch } from "@/components/ui/switch";
import { useLive } from "@/hooks/use-live";
import { sendJSON } from "@/lib/fetcher";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Ops {
  riders: { id: string; name: string; area: string | null; phone: string; isAvailable: boolean; activeRuns: number; deliveredToday: number }[];
  active: { orderId: string; code: string; area: string; orderStatus: string; mode: string; status: string; farmer: string; buyer: string; worker: { id: string; name: string } | null; otpAttempts: number; otpActive: boolean; assignedAt: string | null; pickedUpAt: string | null }[];
  problems: { orderId: string; code: string; area: string; orderStatus: string; reason: string | null; worker: string | null; createdAt: string }[];
  attempts: { id: string; code: string; orderId: string; mode: string; method: string; success: boolean; reason: string | null; actor: string; actorRole: string | null; createdAt: string }[];
}

/** /admin/deliveries */
export function DeliveriesOps() {
  const { data, error, isLoading, mutate } = useSWR<Ops>("/api/admin/deliveries", { refreshInterval: 15_000 });
  useLive(["delivery.updated", "order.updated"], () => mutate());
  const [busy, setBusy] = useState<string | null>(null);
  const [allAttempts, setAllAttempts] = useState(false);

  async function toggleRider(id: string, isAvailable: boolean) {
    setBusy(id);
    try {
      await sendJSON(`/api/admin/users/${id}`, { isAvailable }, "PATCH");
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function reassign(orderId: string, workerId: string) {
    setBusy(orderId);
    try {
      const r = await sendJSON<{ name: string }>(`/api/admin/deliveries/${orderId}/reassign`, { workerId });
      toast.success(`Reassigned to ${r.name}`);
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <SkeletonRows count={5} />;
  if (error || !data) return <ErrorState message={error?.message} onRetry={() => mutate()} />;
  const failedToday = data.attempts.filter((a) => !a.success && new Date(a.createdAt).toDateString() === new Date().toDateString()).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Delivery *ops*" description="Riders, live runs and every OTP / QR handover attempt." />

      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Riders</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.riders.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-3xl border bg-card p-4">
              <span className={cn("grid size-11 place-items-center rounded-2xl", r.isAvailable ? "bg-lime/40" : "bg-muted")}>
                <Bike className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.area} · {r.activeRuns} active · {r.deliveredToday} delivered today
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {r.isAvailable ? "On shift" : "Off"}
                <Switch checked={r.isAvailable} disabled={busy === r.id} onCheckedChange={(v) => toggleRider(r.id, v)} aria-label={`${r.name} availability`} />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Live handovers ({data.active.length})</h2>
        <ul className="space-y-2">
          {data.active.map((d) => (
            <motion.li key={d.orderId} layout className="flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{d.code}</span>
                  <StatusBadge status={d.mode === "PICKUP" ? "READY_FOR_PICKUP" : d.status} pulse />
                  {d.otpActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      <KeyRound className="size-3" /> code live
                    </span>
                  )}
                  {d.otpAttempts > 0 && <span className={cn("rounded-full px-2 py-0.5 text-[11px]", d.otpAttempts >= 3 ? "bg-tomato/15 text-tomato" : "bg-muted")}>{d.otpAttempts} attempt{d.otpAttempts > 1 ? "s" : ""}</span>}
                </div>
                <p className="text-sm break-words text-muted-foreground">
                  {d.farmer} → {d.buyer} · {d.area}
                  {d.assignedAt && ` · assigned ${timeAgo(d.assignedAt)}`}
                </p>
              </div>
              {d.mode === "DELIVERY" && (
                <select
                  aria-label={`Rider for ${d.code}`}
                  value={d.worker?.id ?? ""}
                  disabled={busy === d.orderId}
                  onChange={(e) => e.target.value && reassign(d.orderId, e.target.value)}
                  className="h-11 rounded-xl border bg-background px-3 text-base sm:w-48"
                >
                  <option value="">Unassigned</option>
                  {data.riders.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.isAvailable ? "" : " (off)"}
                    </option>
                  ))}
                </select>
              )}
            </motion.li>
          ))}
          {data.active.length === 0 && <p className="text-sm text-muted-foreground">No live handovers.</p>}
        </ul>
      </section>

      {data.problems.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Failed handovers</h2>
          <ul className="space-y-2">
            {data.problems.map((p) => (
              <li key={p.orderId} className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <span className="min-w-0 flex-1">
                  <span className="font-mono font-semibold">{p.code}</span> · {p.reason}
                  <span className="block text-xs text-muted-foreground">
                    {p.worker ?? "-"} · {p.area} · {timeAgo(p.createdAt)}
                  </span>
                </span>
                <StatusBadge status={p.orderStatus} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">OTP / QR attempt log</h2>
          <span className="text-xs text-muted-foreground">{failedToday} failed today</span>
        </div>
        <div className="overflow-hidden rounded-3xl border bg-card">
          <div className="hidden grid-cols-[28px_110px_80px_1fr_1.4fr_140px] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span />
            <span>Order</span>
            <span>Method</span>
            <span>By</span>
            <span>Result</span>
            <span>When</span>
          </div>
          <ul className="divide-y">
            {(allAttempts ? data.attempts : data.attempts.slice(0, 15)).map((a) => (
              <li key={a.id} className="grid grid-cols-[28px_1fr] gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm md:grid-cols-[28px_110px_80px_1fr_1.4fr_140px] md:items-center">
                {a.success ? <CheckCircle2 className="size-4 text-success md:row-auto" /> : <XCircle className="size-4 text-destructive" />}
                <span className="font-mono font-semibold">{a.code}</span>
                <span className="col-start-2 inline-flex items-center gap-1 text-xs text-muted-foreground md:col-start-auto md:text-sm">
                  {a.method === "QR" ? <QrCode className="size-3.5" /> : <KeyRound className="size-3.5" />} {a.method.toLowerCase()}
                </span>
                <span className="col-start-2 text-xs text-muted-foreground md:col-start-auto md:text-sm md:text-foreground">
                  {a.actor}
                  {a.actorRole ? ` · ${a.actorRole.toLowerCase()}` : ""}
                </span>
                <span className={cn("col-start-2 text-xs md:col-start-auto md:text-sm", a.success ? "text-success" : "text-destructive")}>{a.success ? "Verified" : a.reason ?? "Failed"}</span>
                <span className="col-start-2 text-xs text-muted-foreground md:col-start-auto">{formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
          {data.attempts.length > 15 && (
            <button type="button" onClick={() => setAllAttempts((v) => !v)} className="min-h-11 w-full border-t text-sm text-muted-foreground hover:bg-muted/40">
              {allAttempts ? "Show fewer" : `Show all ${data.attempts.length} attempts`}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
