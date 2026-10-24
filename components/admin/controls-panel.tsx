// Admin platform controls: commission and surplus thresholds, service
// areas (on/off + base delivery fee), cold-chain category availability per
// area, and the simulated payout run.
"use client";

import { Check, Loader2, MapPin, Percent, Repeat, Snowflake, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { ErrorState, SkeletonRows } from "@/components/common/states";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useLive } from "@/hooks/use-live";
import { sendJSON } from "@/lib/fetcher";
import { formatDateTime, formatINR, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SettingRow {
  key: string;
  value: number;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
  help: string;
}
interface Controls {
  settings: SettingRow[];
  areas: { id: string; name: string; active: boolean; isPilot: boolean; baseDeliveryFee: number; radiusKm: number }[];
  categories: { slug: string; name: string; enabledAreas: string[] }[];
  payouts: { pendingCount: number; pendingAmount: number; lastRun: { at: string; meta: { count?: number; amount?: number } | null } | null };
  subscriptions: { active: number; due: number; nextRunAt: string | null };
}

/** /admin/controls */
export function ControlsPanel() {
  const { data, error, isLoading, mutate } = useSWR<Controls>("/api/admin/controls");
  useLive(["settlement.updated"], () => mutate());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRun, setConfirmRun] = useState(false);

  async function patch(key: string, payload: Record<string, unknown>, done: string) {
    setBusy(key);
    try {
      await sendJSON("/api/admin/controls", payload, "PATCH");
      toast.success(done);
      await mutate();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }
  async function runPayouts() {
    setConfirmRun(false);
    setBusy("payouts");
    try {
      const r = await sendJSON<{ settled: number; amount: number }>("/api/admin/settlements/run", {});
      toast.success(r.settled ? `Settled ${r.settled} payouts · ${formatINR(r.amount)}` : "Nothing pending");
      await mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runSubscriptions() {
    setBusy("subs");
    try {
      const r = await sendJSON<{ due: number; placed: number; skipped: number }>("/api/subscriptions/run-due", {});
      toast.success(r.due ? `${r.placed} placed${r.skipped ? ` · ${r.skipped} skipped` : ""}` : "No subscriptions due right now");
      await mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <SkeletonRows count={6} />;
  if (error || !data) return <ErrorState message={error?.message} onRetry={() => mutate()} />;
  const byKey = Object.fromEntries(data.settings.map((s) => [s.key, s]));
  const activeAreas = data.areas.filter((a) => a.active);

  return (
    <div className="space-y-8">
      <PageHeader title="Platform *controls*" description="Fees, surplus rules, service areas and payouts. Every change is audit-logged." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Fees" icon={Percent}>
          <SettingControl s={byKey.commissionPct} busy={busy} onSave={(v) => patch("commissionPct", { kind: "setting", key: "commissionPct", value: v }, `Commission set to ${v}%`)}>
            {(v) => (
              <p className="text-sm text-muted-foreground">
                On a {formatINR(1000)} order the farmer receives <b className="tabular text-foreground">{formatINR(1000 * (1 - v / 100))}</b> before any delivery share.
              </p>
            )}
          </SettingControl>
        </Card>

        <Card title="Payouts" icon={Wallet}>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="tabular text-3xl font-semibold">{formatINR(data.payouts.pendingAmount)}</p>
              <p className="text-sm text-muted-foreground">
                {data.payouts.pendingCount} settlement{data.payouts.pendingCount === 1 ? "" : "s"} pending
              </p>
            </div>
            <Button className="min-h-11" disabled={busy === "payouts" || data.payouts.pendingCount === 0} onClick={() => setConfirmRun(true)}>
              {busy === "payouts" && <Loader2 className="animate-spin" />} Run payouts
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {data.payouts.lastRun
              ? `Last run ${timeAgo(data.payouts.lastRun.at)}${data.payouts.lastRun.meta?.count ? ` · ${data.payouts.lastRun.meta.count} payouts, ${formatINR(data.payouts.lastRun.meta.amount ?? 0)}` : ""}`
              : "No payout run yet."}{" "}
            Simulated, in production this follows the gateway&apos;s transfer confirmation.
          </p>
        </Card>

        <Card title="Subscriptions" icon={Repeat} className="lg:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex gap-8">
              <div>
                <p className="tabular text-3xl font-semibold">{data.subscriptions.active}</p>
                <p className="text-sm text-muted-foreground">active plans</p>
              </div>
              <div>
                <p className={cn("tabular text-3xl font-semibold", data.subscriptions.due > 0 && "text-tomato")}>{data.subscriptions.due}</p>
                <p className="text-sm text-muted-foreground">due now</p>
              </div>
            </div>
            <Button variant="outline" className="min-h-11" disabled={busy === "subs"} onClick={runSubscriptions}>
              {busy === "subs" && <Loader2 className="animate-spin" />} Run due now
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {data.subscriptions.nextRunAt ? `Next order goes out ${formatDateTime(data.subscriptions.nextRunAt)}. ` : ""}A scheduler calls <code className="font-mono">/api/subscriptions/run-due</code> every 15 minutes in production; each plan is claimed atomically, so overlapping runs never double-order.
          </p>
        </Card>
      </div>

      <Card title="Surplus rescue rules" icon={Snowflake} className="space-y-6">
        <p className="-mt-2 text-sm text-muted-foreground">A listing is flagged at risk when either rule trips. Farmers then see one-tap rescue offers to community kitchens.</p>
        <div className="grid gap-6 md:grid-cols-3">
          {(["surplusSellThroughPct", "surplusMinAgeHours", "surplusShelfLifePct"] as const).map((k) => (
            <SettingControl key={k} s={byKey[k]} busy={busy} onSave={(v) => patch(k, { kind: "setting", key: k, value: v }, `${byKey[k].label.replace(/^…/, "")} updated`)} />
          ))}
        </div>
      </Card>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Service areas</h2>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">Checkout blocks addresses outside active areas. Base fee is the delivery charge before free delivery kicks in (₹499+).</p>
        <div className="grid gap-3 md:grid-cols-3">
          {data.areas.map((a) => (
            <AreaCard key={a.id} area={a} busy={busy === a.id} onPatch={(p, done) => patch(a.id, { kind: "area", id: a.id, ...p }, done)} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Cold-chain categories</h2>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">Milk, eggs and chicken need refrigerated handling, so they&apos;re sold only where you switch them on.</p>
        <div className="space-y-3">
          {data.categories.map((c) => (
            <div key={c.slug} className="flex flex-col gap-3 rounded-3xl border bg-card p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.enabledAreas.length ? `Sold in ${c.enabledAreas.join(", ")}` : "Not sold anywhere yet"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeAreas.map((a) => {
                  const on = c.enabledAreas.includes(a.name);
                  const key = `${c.slug}:${a.name}`;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      disabled={busy === key}
                      onClick={() => patch(key, { kind: "category", slug: c.slug, area: a.name, enabled: !on }, `${c.name} ${on ? "paused" : "enabled"} in ${a.name}`)}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors",
                        on ? "border-lime bg-lime text-lime-foreground" : "bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {busy === key ? <Loader2 className="size-3.5 animate-spin" /> : on ? <Check className="size-3.5" /> : null}
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <ResponsiveModal open={confirmRun} onOpenChange={setConfirmRun} title="Run payout batch?">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Marks {data.payouts.pendingCount} pending settlement{data.payouts.pendingCount === 1 ? "" : "s"} ({formatINR(data.payouts.pendingAmount)}) as paid. Farmers see the update on their payments page straight away.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" className="min-h-11" onClick={() => setConfirmRun(false)}>
              Cancel
            </Button>
            <Button className="min-h-11" onClick={runPayouts}>
              Settle {formatINR(data.payouts.pendingAmount)}
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}

function Card({ title, icon: Icon, className, children }: { title: string; icon: React.ComponentType<{ className?: string }>; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-3xl border bg-card p-5", className)}>
      <h2 className="mb-4 flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </h2>
      {children}
    </section>
  );
}

/** Slider + value readout; a Save button appears once the value changes. */
function SettingControl({ s, busy, onSave, children }: { s: SettingRow; busy: string | null; onSave: (v: number) => Promise<boolean>; children?: (v: number) => React.ReactNode }) {
  const [draft, setDraft] = useState<number | null>(null);
  const v = draft ?? s.value;
  const dirty = draft !== null && draft !== s.value;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{s.label}</p>
        <p className="tabular shrink-0 text-2xl font-semibold">
          {v}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{s.unit}</span>
        </p>
      </div>
      <Slider value={[v]} min={s.min} max={s.max} step={s.step} onValueChange={([n]) => setDraft(n)} aria-label={s.label} className="py-2" />
      <p className="text-xs text-muted-foreground">{s.help}</p>
      {children?.(v)}
      <AnimatePresence initial={false}>
        {dirty && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex gap-2 overflow-hidden">
            <Button className="min-h-11" disabled={busy === s.key} onClick={async () => (await onSave(v)) && setDraft(null)}>
              {busy === s.key && <Loader2 className="animate-spin" />} Save
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={() => setDraft(null)}>
              Reset
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AreaCard({
  area,
  busy,
  onPatch,
}: {
  area: Controls["areas"][number];
  busy: boolean;
  onPatch: (p: { active?: boolean; baseDeliveryFee?: number }, done: string) => Promise<boolean>;
}) {
  const [fee, setFee] = useState(String(area.baseDeliveryFee));
  const saveFee = () => {
    const n = Number(fee);
    if (!Number.isFinite(n) || n === area.baseDeliveryFee) return setFee(String(area.baseDeliveryFee));
    onPatch({ baseDeliveryFee: n }, `${area.name} base fee set to ${formatINR(n)}`);
  };
  return (
    <div className={cn("rounded-3xl border bg-card p-4 transition-opacity", !area.active && "opacity-70")}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", area.active ? "bg-lime/40" : "bg-muted")}>
          <MapPin className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {area.name}
            {area.isPilot && <span className="ml-2 rounded-full bg-lime px-2 py-0.5 align-middle text-[11px] text-lime-foreground">Pilot</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {area.radiusKm} km radius · {area.active ? "Delivering" : "Paused"}
          </p>
        </div>
        <Switch checked={area.active} disabled={busy} onCheckedChange={(on) => onPatch({ active: on }, `${area.name} ${on ? "re-opened" : "paused"}`)} aria-label={`${area.name} active`} />
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Base fee ₹</span>
        <Input
          inputMode="decimal"
          value={fee}
          disabled={busy}
          onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ""))}
          onBlur={saveFee}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          className="h-11 w-24 text-base"
          aria-label={`${area.name} base delivery fee`}
        />
      </label>
    </div>
  );
}
