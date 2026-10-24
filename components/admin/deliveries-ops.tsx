// Admin delivery management: riders (availability + load), active runs
// with reassignment, failed handovers, and the OTP / QR attempt log.
"use client";

import {
  AlertTriangle,
  Bike,
  CheckCircle2,
  KeyRound,
  Loader2,
  QrCode,
  UserRoundPlus,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { ErrorState, SkeletonRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLive } from "@/hooks/use-live";
import { sendJSON } from "@/lib/fetcher";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Ops {
  areas: string[];
  riders: {
    id: string;
    name: string;
    area: string | null;
    phone: string;
    isAvailable: boolean;
    activeRuns: number;
    deliveredToday: number;
  }[];
  active: {
    orderId: string;
    code: string;
    area: string;
    orderStatus: string;
    mode: string;
    status: string;
    farmer: string;
    buyer: string;
    worker: { id: string; name: string } | null;
    otpAttempts: number;
    otpActive: boolean;
    assignedAt: string | null;
    pickedUpAt: string | null;
  }[];
  problems: {
    orderId: string;
    code: string;
    area: string;
    orderStatus: string;
    reason: string | null;
    worker: string | null;
    createdAt: string;
  }[];
  attempts: {
    id: string;
    code: string;
    orderId: string;
    mode: string;
    method: string;
    success: boolean;
    reason: string | null;
    actor: string;
    actorRole: string | null;
    createdAt: string;
  }[];
}

/** /admin/deliveries */
export function DeliveriesOps() {
  const { data, error, isLoading, mutate } = useSWR<Ops>("/api/admin/deliveries", {
    refreshInterval: 15_000,
  });
  useLive(["delivery.updated", "order.updated"], () => mutate());
  const [busy, setBusy] = useState<string | null>(null);
  const [allAttempts, setAllAttempts] = useState(false);
  const [addRiderOpen, setAddRiderOpen] = useState(false);
  const [newRider, setNewRider] = useState({ name: "", phone: "", pin: "", area: "" });

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
      const r = await sendJSON<{ name: string }>(`/api/admin/deliveries/${orderId}/reassign`, {
        workerId,
      });
      toast.success(`Reassigned to ${r.name}`);
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function createRider(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const area = newRider.area || data?.areas[0];
    if (!area) {
      toast.error("Enable a service area before adding a delivery person");
      return;
    }
    setBusy("create-rider");
    try {
      const rider = await sendJSON<Ops["riders"][number]>("/api/admin/users", {
        ...newRider,
        area,
      });
      setNewRider({ name: "", phone: "", pin: "", area: "" });
      setAddRiderOpen(false);
      toast.success(`${rider.name} added as a delivery person. Share the PIN securely.`);
      await mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <SkeletonRows count={5} />;
  if (error || !data) return <ErrorState message={error?.message} onRetry={() => mutate()} />;
  const failedToday = data.attempts.filter(
    (a) => !a.success && new Date(a.createdAt).toDateString() === new Date().toDateString(),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery *ops*"
        description="Riders, live runs and every OTP / QR handover attempt."
        actions={
          <Button className="min-h-11" onClick={() => setAddRiderOpen(true)}>
            <UserRoundPlus /> Add delivery person
          </Button>
        }
      />

      <ResponsiveModal
        open={addRiderOpen}
        onOpenChange={setAddRiderOpen}
        title="Add delivery person"
        description="Create an active delivery account. Set a 4–6 digit PIN and share it securely with the rider."
      >
        <form onSubmit={createRider} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-rider-name">Full name</Label>
            <Input
              id="new-rider-name"
              autoComplete="name"
              value={newRider.name}
              onChange={(e) => setNewRider((r) => ({ ...r, name: e.target.value }))}
              minLength={2}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-rider-phone">Mobile number</Label>
            <Input
              id="new-rider-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="98765 43210"
              value={newRider.phone}
              onChange={(e) => setNewRider((r) => ({ ...r, phone: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-rider-area">Service area</Label>
            <select
              id="new-rider-area"
              value={newRider.area || data.areas[0] || ""}
              onChange={(e) => setNewRider((r) => ({ ...r, area: e.target.value }))}
              className="border-input bg-background h-11 w-full rounded-xl border px-3.5 text-base"
              required
            >
              {data.areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-rider-pin">Initial PIN</Label>
            <Input
              id="new-rider-pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="4–6 digits"
              maxLength={6}
              value={newRider.pin}
              onChange={(e) =>
                setNewRider((r) => ({ ...r, pin: e.target.value.replace(/\D/g, "") }))
              }
              minLength={4}
              required
            />
          </div>
          <Button
            type="submit"
            className="min-h-11 w-full"
            disabled={busy === "create-rider" || newRider.pin.length < 4}
          >
            {busy === "create-rider" ? <Loader2 className="animate-spin" /> : <UserRoundPlus />}
            Create delivery account
          </Button>
        </form>
      </ResponsiveModal>

      <section>
        <h2 className="text-muted-foreground mb-2 text-sm font-semibold tracking-wide uppercase">
          Riders
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.riders.map((r) => (
            <div key={r.id} className="bg-card flex items-center gap-3 rounded-3xl border p-4">
              <span
                className={cn(
                  "grid size-11 place-items-center rounded-2xl",
                  r.isAvailable ? "bg-lime/40" : "bg-muted",
                )}
              >
                <Bike className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{r.name}</p>
                <p className="text-muted-foreground text-xs">
                  {r.area} · {r.activeRuns} active · {r.deliveredToday} delivered today
                </p>
              </div>
              <label className="text-muted-foreground flex items-center gap-2 text-xs">
                {r.isAvailable ? "On shift" : "Off"}
                <Switch
                  checked={r.isAvailable}
                  disabled={busy === r.id}
                  onCheckedChange={(v) => toggleRider(r.id, v)}
                  aria-label={`${r.name} availability`}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-muted-foreground mb-2 text-sm font-semibold tracking-wide uppercase">
          Live handovers ({data.active.length})
        </h2>
        <ul className="space-y-2">
          {data.active.map((d) => (
            <motion.li
              key={d.orderId}
              layout
              className="bg-card flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{d.code}</span>
                  <StatusBadge status={d.mode === "PICKUP" ? "READY_FOR_PICKUP" : d.status} pulse />
                  {d.otpActive && (
                    <span className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]">
                      <KeyRound className="size-3" /> code live
                    </span>
                  )}
                  {d.otpAttempts > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px]",
                        d.otpAttempts >= 3 ? "bg-tomato/15 text-tomato" : "bg-muted",
                      )}
                    >
                      {d.otpAttempts} attempt{d.otpAttempts > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm break-words">
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
                  className="bg-background h-11 rounded-xl border px-3 text-base sm:w-48"
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
          {data.active.length === 0 && (
            <p className="text-muted-foreground text-sm">No live handovers.</p>
          )}
        </ul>
      </section>

      {data.problems.length > 0 && (
        <section>
          <h2 className="text-muted-foreground mb-2 text-sm font-semibold tracking-wide uppercase">
            Failed handovers
          </h2>
          <ul className="space-y-2">
            {data.problems.map((p) => (
              <li
                key={p.orderId}
                className="border-warning/40 bg-warning/10 flex gap-3 rounded-2xl border p-3 text-sm"
              >
                <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="font-mono font-semibold">{p.code}</span> · {p.reason}
                  <span className="text-muted-foreground block text-xs">
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
          <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
            OTP / QR attempt log
          </h2>
          <span className="text-muted-foreground text-xs">{failedToday} failed today</span>
        </div>
        <div className="bg-card overflow-hidden rounded-3xl border">
          <div className="bg-muted/40 text-muted-foreground hidden grid-cols-[28px_110px_80px_1fr_1.4fr_140px] gap-3 border-b px-4 py-2 text-xs font-medium md:grid">
            <span />
            <span>Order</span>
            <span>Method</span>
            <span>By</span>
            <span>Result</span>
            <span>When</span>
          </div>
          <ul className="divide-y">
            {(allAttempts ? data.attempts : data.attempts.slice(0, 15)).map((a) => (
              <li
                key={a.id}
                className="grid grid-cols-[28px_1fr] gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm md:grid-cols-[28px_110px_80px_1fr_1.4fr_140px] md:items-center"
              >
                {a.success ? (
                  <CheckCircle2 className="text-success size-4 md:row-auto" />
                ) : (
                  <XCircle className="text-destructive size-4" />
                )}
                <span className="font-mono font-semibold">{a.code}</span>
                <span className="text-muted-foreground col-start-2 inline-flex items-center gap-1 text-xs md:col-start-auto md:text-sm">
                  {a.method === "QR" ? (
                    <QrCode className="size-3.5" />
                  ) : (
                    <KeyRound className="size-3.5" />
                  )}{" "}
                  {a.method.toLowerCase()}
                </span>
                <span className="text-muted-foreground md:text-foreground col-start-2 text-xs md:col-start-auto md:text-sm">
                  {a.actor}
                  {a.actorRole ? ` · ${a.actorRole.toLowerCase()}` : ""}
                </span>
                <span
                  className={cn(
                    "col-start-2 text-xs md:col-start-auto md:text-sm",
                    a.success ? "text-success" : "text-destructive",
                  )}
                >
                  {a.success ? "Verified" : (a.reason ?? "Failed")}
                </span>
                <span className="text-muted-foreground col-start-2 text-xs md:col-start-auto">
                  {formatDateTime(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
          {data.attempts.length > 15 && (
            <button
              type="button"
              onClick={() => setAllAttempts((v) => !v)}
              className="text-muted-foreground hover:bg-muted/40 min-h-11 w-full border-t text-sm"
            >
              {allAttempts ? "Show fewer" : `Show all ${data.attempts.length} attempts`}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
