// Admin trust & safety: duplicate-photo flags, farmers with repeated
// complaints (suspend / reinstate), price outliers (pause / resume the
// listing) and the list of suspended accounts. Every signal is advisory.
"use client";

import { Ban, Copy, ImageOff, MessageSquareWarning, ShieldCheck, Star, TrendingDown, TrendingUp, UserCheck } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { MediaImage } from "@/components/common/media-image";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/use-live";
import { sendJSON } from "@/lib/fetcher";
import { formatINR, timeAgo } from "@/lib/format";
import type { TrustReport } from "@/lib/trust";
import { cn } from "@/lib/utils";

const ISSUE_LABEL: Record<string, string> = { DAMAGED: "Damaged", NOT_FRESH: "Not fresh", WRONG_ITEM: "Wrong item", SHORT_QTY: "Short quantity", LATE: "Late" };

/** /admin/trust */
export function TrustCenter() {
  const { data, error, isLoading, mutate } = useSWR<TrustReport>("/api/admin/trust");
  useLive(["batch.updated", "order.updated", "inventory.updated"], () => mutate());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
      await mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const setSuspended = (id: string, name: string, suspended: boolean) =>
    run(id, () => sendJSON(`/api/admin/users/${id}`, { suspended }, "PATCH"), suspended ? `${name} suspended, live listings paused` : `${name} reinstated`);
  const setListing = (id: string, status: "ACTIVE" | "PAUSED") =>
    run(id, () => sendJSON(`/api/admin/listings/${id}`, { status }, "PATCH"), status === "PAUSED" ? "Listing paused" : "Listing resumed");

  if (isLoading) return <SkeletonRows count={6} />;
  if (error || !data) return <ErrorState message={error?.message} onRetry={() => mutate()} />;

  const tiles = [
    { label: "Re-used photos", value: data.duplicates.length, icon: Copy },
    { label: "Complaint flags", value: data.complaints.length, icon: MessageSquareWarning },
    { label: "Price outliers", value: data.priceOutliers.length, icon: TrendingUp },
    { label: "Suspended", value: data.suspended.length, icon: Ban },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="Trust & *safety*" description="Signals that need a person to look. Flags assist, they never decide on their own." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <motion.div key={t.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-3xl border bg-card p-4">
            <t.icon className="size-4 text-muted-foreground" />
            <p className="tabular mt-2 text-3xl font-semibold">{t.value}</p>
            <p className="text-xs text-muted-foreground">{t.label}</p>
          </motion.div>
        ))}
      </div>

      <Section title="Re-used photos" hint="Identical file bytes seen on another batch. Often an honest re-upload, sometimes a borrowed photo.">
        {data.duplicates.length === 0 ? (
          <EmptyState icon={ImageOff} title="No re-used photos" body="Every photo on file is unique." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.duplicates.map((d) => (
              <div key={d.batchId} className="flex gap-3 rounded-3xl border bg-card p-3">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-muted">
                  <MediaImage src={d.imageUrl} alt={`${d.crop} photo`} sizes="80px" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold capitalize">{d.crop}</p>
                    <StatusBadge status={d.status} />
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {d.farmer.name} · {d.farmer.area}
                  </p>
                  <p className="mt-1 text-xs">
                    {d.copies === 1 ? "1 photo matches" : `${d.copies} photos match`} {d.sameFarmer ? "their own earlier batch" : <b>{d.matchesFarmer ?? "another farmer"}&apos;s batch</b>} · {timeAgo(d.createdAt)}
                  </p>
                  {d.status === "PENDING_REVIEW" && (
                    <Link href={`/admin/review/${d.batchId}`} className="mt-1 inline-flex min-h-9 items-center text-sm font-semibold underline-offset-4 hover:underline">
                      Review batch →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Repeated complaints" hint="Last 30 days. Flagged at 3+ complaints, or 2+ when they're 20% or more of delivered orders.">
        {data.complaints.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No farmers flagged" body="Complaint rates are within normal range." />
        ) : (
          <div className="space-y-3">
            {data.complaints.map((c) => (
              <div key={c.farmer.id} className="rounded-3xl border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{c.farmer.name}</p>
                      {c.farmer.suspended && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Suspended</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {c.farmer.area} · reliability {Math.round(c.farmer.reliabilityScore * 100)}
                    </p>
                  </div>
                  {c.farmer.suspended ? (
                    <Button variant="outline" className="min-h-11" disabled={busy === c.farmer.id} onClick={() => setSuspended(c.farmer.id, c.farmer.name, false)}>
                      <UserCheck /> Reinstate
                    </Button>
                  ) : (
                    <Button variant="outline" className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive/5" disabled={busy === c.farmer.id} onClick={() => setConfirm({ id: c.farmer.id, name: c.farmer.name })}>
                      <Ban /> Suspend
                    </Button>
                  )}
                </div>
                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-sm">
                    <span>
                      <b className="tabular">{c.complaints}</b> complaints · <b className="tabular">{c.disputes}</b> disputes on <b className="tabular">{c.orders}</b> orders
                    </span>
                    <span className="tabular font-semibold">{Math.round(c.rate * 100)}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <motion.div className="h-full rounded-full bg-tomato" initial={{ width: 0 }} animate={{ width: `${Math.min(100, c.rate * 100)}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {c.avgRating !== null && (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1">
                      <Star className="size-3" /> {c.avgRating.toFixed(1)} avg
                    </span>
                  )}
                  {Object.entries(c.issues).map(([k, n]) => (
                    <span key={k} className="rounded-full border px-2.5 py-1">
                      {ISSUE_LABEL[k] ?? k} × {n}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Price outliers" hint="Live listings above 1.5× or below 0.6× the indicative retail reference (mandi modal × 1.15).">
        {data.priceOutliers.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Prices look normal" body="No listing is far from the market reference." />
        ) : (
          <div className="space-y-3">
            {data.priceOutliers.map((p) => (
              <div key={p.listingId} className="flex flex-col gap-3 rounded-3xl border bg-card p-4 sm:flex-row sm:items-center">
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", p.direction === "high" ? "bg-tomato/15 text-tomato" : "bg-lime/40")}>
                  {p.direction === "high" ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{p.title}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {p.farmer.name} · {p.area}
                  </p>
                  <p className="mt-1 text-sm">
                    <b className="tabular">{formatINR(p.price)}</b>/{p.unit} vs reference <span className="tabular">{formatINR(p.reference)}</span> ·{" "}
                    <b className={cn("tabular", p.direction === "high" && "text-tomato")}>{p.ratio}× market</b>
                  </p>
                </div>
                {p.status === "ACTIVE" ? (
                  <Button variant="outline" className="min-h-11" disabled={busy === p.listingId} onClick={() => setListing(p.listingId, "PAUSED")}>
                    Pause listing
                  </Button>
                ) : (
                  <Button variant="outline" className="min-h-11" disabled={busy === p.listingId} onClick={() => setListing(p.listingId, "ACTIVE")}>
                    Resume
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Suspended accounts" hint="Suspended users are signed out and can't log in. A farmer's listings stay paused after reinstating.">
        {data.suspended.length === 0 ? (
          <EmptyState icon={UserCheck} title="Nobody is suspended" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.suspended.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-3xl border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.role.replace("_", " ").toLowerCase()} · {u.area} · {u.phone}
                  </p>
                </div>
                <Button variant="outline" className="min-h-11" disabled={busy === u.id} onClick={() => setSuspended(u.id, u.name, false)}>
                  Reinstate
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <ResponsiveModal open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)} title={`Suspend ${confirm?.name ?? ""}?`}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            They&apos;ll be signed out straight away, can&apos;t log in, and every live listing they have is paused. Orders already placed continue. You can reinstate them from this page.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" className="min-h-11" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="min-h-11"
              onClick={() => {
                if (confirm) setSuspended(confirm.id, confirm.name, true);
                setConfirm(null);
              }}
            >
              <Ban /> Suspend account
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <p className="mt-1 mb-3 text-sm text-muted-foreground">{hint}</p>
      {children}
    </section>
  );
}
