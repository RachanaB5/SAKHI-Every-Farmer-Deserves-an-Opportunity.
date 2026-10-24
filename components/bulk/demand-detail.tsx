// Bulk buyer requirement detail: offers ranked by AI (or the deterministic
// fallback) with score, factor bars and a one-line reason; cards shuffle
// into rank order. Counter (max 2 rounds), decline, or accept → BULK order
// with the farmer's stock reserved atomically.
"use client";

import { ArrowLeft, Check, Crown, Flame, Loader2, MapPin, Repeat, Sparkles, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AISourceBadge } from "@/components/ai/ai-labels";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/common/states";
import { StatusBadge, offerStatusLabel } from "@/components/common/status-badge";
import { MediaImage } from "@/components/common/media-image";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/use-live";
import type { SerializedDemand, SerializedOffer } from "@/lib/bulk";
import { CROPS, isCropSlug } from "@/lib/crops";
import { sendJSON } from "@/lib/fetcher";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Countdown } from "./deadline";

interface Ranked {
  offerId: string;
  score: number;
  reason: string;
  deliveredPerKg: number;
  factors: Record<"cost" | "coverage" | "eta" | "quality" | "distance" | "reliability", number>;
}
const FACTOR_LABEL: Record<keyof Ranked["factors"], string> = { cost: "Cost", coverage: "Qty", eta: "ETA", quality: "Quality", distance: "Near", reliability: "Reliable" };

/** /bulk/demands/[id] */
export function DemandDetail({ id }: { id: string }) {
  const { data: d, error, isLoading, mutate } = useSWR<SerializedDemand>(`/api/demands/${id}`);
  const [rank, setRank] = useState<{ source: string; ranking: Ranked[] } | null>(null);
  const [ranking, setRanking] = useState(false);
  const [accepting, setAccepting] = useState<SerializedOffer | null>(null);
  const liveSig = useRef("");

  async function runRank() {
    setRanking(true);
    try {
      const r = await sendJSON<{ source: string; ranking: Ranked[] }>("/api/ai/rank-offers", { demandId: id });
      setRank(r);
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRanking(false);
    }
  }

  // Re-rank whenever the set of live offers (or their prices) changes.
  useEffect(() => {
    if (!d) return;
    const live = d.offers.filter((o) => ["PENDING", "COUNTERED"].includes(o.status));
    const sig = live.map((o) => `${o.id}:${o.pricePerKg}:${o.counterPrice}:${o.qtyKg}`).join("|");
    if (sig && sig !== liveSig.current && d.status === "OPEN") {
      liveSig.current = sig;
      runRank();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runRank is stable for this demand
  }, [d]);
  useLive(["offer.updated", "demand.updated"], () => mutate());

  if (isLoading) return <SkeletonBlock className="h-96 w-full rounded-3xl" />;
  if (error || !d) return <ErrorState message={error?.message} onRetry={() => mutate()} />;

  const byRank = new Map(rank?.ranking.map((r, i) => [r.offerId, { ...r, pos: i + 1 }]));
  const ordered = [...d.offers].sort((a, b) => {
    const ra = byRank.get(a.id)?.pos ?? a.aiRank ?? 99;
    const rb = byRank.get(b.id)?.pos ?? b.aiRank ?? 99;
    const live = (o: SerializedOffer) => (["PENDING", "COUNTERED", "ACCEPTED"].includes(o.status) ? 0 : 1);
    return live(a) - live(b) || ra - rb;
  });
  const img = isCropSlug(d.crop) ? CROPS[d.crop].image : null;
  const pct = Math.min(100, (d.acceptedKg / d.qtyKg) * 100);

  return (
    <div>
      <Link href="/bulk" className="mb-4 inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Requirements
      </Link>

      <section className="dark relative overflow-hidden rounded-3xl bg-background p-5 text-foreground sm:p-6">
        {img && (
          <div className="absolute inset-y-0 right-0 w-1/2 opacity-40 [mask-image:linear-gradient(90deg,transparent,black)]">
            <MediaImage src={img} sizes="50vw" />
          </div>
        )}
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={d.status} pulse={d.status === "OPEN"} />
            {d.urgent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-tomato px-2 py-0.5 text-xs font-semibold text-white">
                <Flame className="size-3" /> Urgent
              </span>
            )}
            {d.recurring && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs">
                <Repeat className="size-3" /> {d.frequency === "DAILY" ? "Daily" : "Weekly"}
              </span>
            )}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {d.qtyKg} kg <span className="font-serif font-normal italic">{d.cropName.toLowerCase()}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Grade {d.grade} · target {formatINR(d.targetPrice)}/kg · {d.status === "OPEN" ? <>needed <Countdown to={d.deadline} /></> : "closed"}
          </p>
          {d.notes && <p className="mt-2 max-w-md text-sm opacity-80">“{d.notes}”</p>}
          <div className="mt-4 max-w-sm">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Covered</span>
              <span className="tabular">
                {d.acceptedKg} / {d.qtyKg} kg
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full bg-lime" initial={{ width: 0 }} animate={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Offers <span className="text-muted-foreground">({d.offers.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          {rank && <AISourceBadge source={rank.source} />}
          {d.status === "OPEN" && d.offers.some((o) => ["PENDING", "COUNTERED"].includes(o.status)) && (
            <Button variant="outline" size="sm" onClick={runRank} disabled={ranking}>
              {ranking ? <Loader2 className="animate-spin" /> : <Sparkles />} {ranking ? "Ranking…" : "Re-rank"}
            </Button>
          )}
        </div>
      </div>

      {d.offers.length === 0 && <EmptyState icon={Sparkles} title="Waiting for offers" body="Farmers with live stock nearby have been notified. Offers appear here instantly." />}

      <LayoutGroup>
        <ul className="space-y-3">
          {ordered.map((o) => (
            <OfferCard key={o.id} offer={o} demand={d} ranked={byRank.get(o.id) ?? null} ranking={ranking} onChange={() => mutate()} onAccept={() => setAccepting(o)} />
          ))}
        </ul>
      </LayoutGroup>

      <AcceptDialog demand={d} offer={accepting} onClose={() => setAccepting(null)} onDone={() => { setAccepting(null); mutate(); }} />
    </div>
  );
}

function OfferCard({
  offer: o,
  demand,
  ranked,
  ranking,
  onChange,
  onAccept,
}: {
  offer: SerializedOffer;
  demand: SerializedDemand;
  ranked: (Ranked & { pos: number }) | null;
  ranking: boolean;
  onChange: () => void;
  onAccept: () => void;
}) {
  const [counter, setCounter] = useState(String(Math.round(Math.min(o.pricePerKg, demand.targetPrice + 1))));
  const [showCounter, setShowCounter] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const live = ["PENDING", "COUNTERED"].includes(o.status) && demand.status === "OPEN";
  const waitingFarmer = o.status === "COUNTERED" && o.lastActor === "BUYER";
  const farmerCountered = o.status === "COUNTERED" && o.lastActor === "FARMER";
  const price = farmerCountered && o.counterPrice ? o.counterPrice : o.pricePerKg;
  const score = ranked?.score ?? o.aiScore;
  const reason = ranked?.reason ?? o.aiReason;
  const pos = ranked?.pos ?? o.aiRank;

  async function act(action: string, p?: number) {
    setBusy(action);
    try {
      await sendJSON(`/api/offers/${o.id}`, { action, price: p });
      toast.success(action === "COUNTER" ? "Counter sent" : "Offer declined");
      setShowCounter(false);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.li layout transition={{ type: "spring", stiffness: 260, damping: 28 }} className={cn("relative overflow-hidden rounded-3xl border bg-card p-4", pos === 1 && live && "border-lime ring-2 ring-lime/40", !live && o.status !== "ACCEPTED" && "opacity-60")}>
      {ranking && live && <span className="absolute inset-x-0 top-0 h-0.5 animate-shimmer bg-gradient-to-r from-transparent via-lime to-transparent bg-[length:200%_100%]" />}
      <div className="flex items-start gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl text-lg font-semibold", pos === 1 && live ? "bg-lime text-lime-foreground" : "bg-muted")}>
          {pos === 1 && live ? <Crown className="size-5" /> : pos ? `#${pos}` : "-"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{o.farmer.farmName ?? o.farmer.name}</p>
            <StatusBadge status={o.status} label={offerStatusLabel(o.status, o.lastActor, "BUYER")} />
            {o.fromSurplus && <span className="rounded-full bg-lime/30 px-2 py-0.5 text-[11px] font-medium">Surplus rescue</span>}
          </div>
          <p className="text-sm text-muted-foreground">
            {o.farmer.name} · <MapPin className="inline size-3" /> {o.farmer.village} · {Math.round(o.distanceKm)} km · {Math.round(o.farmer.reliability * 100)}% reliable
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>
              <b className="tabular">{o.qtyKg} kg</b> <span className="text-muted-foreground">of {demand.qtyKg}</span>
            </span>
            <span>
              <b className="tabular">{formatINR(price)}/kg</b>
              {farmerCountered && <span className="ml-1 text-xs text-muted-foreground">(countered)</span>}
            </span>
            {ranked && <span className="text-muted-foreground">₹{ranked.deliveredPerKg}/kg delivered</span>}
            <span className="text-muted-foreground">~{o.etaHours} h</span>
            {o.listing?.qualityScore && <span className="text-muted-foreground">visual {o.listing.qualityScore}</span>}
          </div>
        </div>
        {score !== null && score !== undefined && (
          <div className="shrink-0 text-right">
            <p className="tabular text-2xl leading-none font-semibold">{Math.round(score)}</p>
            <p className="text-[10px] text-muted-foreground uppercase">score</p>
          </div>
        )}
      </div>

      {score !== null && score !== undefined && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full bg-lime" initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.9 }} />
          </div>
          {reason && (
            <p className="mt-2 flex gap-1.5 text-sm">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /> {reason}
            </p>
          )}
          {ranked && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
              {(Object.keys(FACTOR_LABEL) as (keyof Ranked["factors"])[]).map((k) => {
                const v = Math.round(ranked.factors[k] * 100);
                return (
                  <div key={k} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <dt className="truncate text-muted-foreground">{FACTOR_LABEL[k]}</dt>
                      <dd className="tabular font-medium">{v}</dd>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <motion.div className="h-full rounded-full bg-foreground/70" initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.7 }} />
                    </div>
                  </div>
                );
              })}
            </dl>
          )}
        </div>
      )}
      {o.note && <p className="mt-2 text-sm text-muted-foreground">“{o.note}”</p>}

      {o.status === "ACCEPTED" && o.order && (
        <Link href={`/bulk/orders/${o.order.id}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-success underline">
          <Check className="size-4" /> Order {o.order.code}
        </Link>
      )}

      {live && (
        <div className="mt-3 space-y-2">
          {waitingFarmer && <p className="text-sm text-muted-foreground">You countered at {formatINR(o.counterPrice)}/kg, waiting for the farmer (round {o.rounds}/2).</p>}
          <div className="flex flex-wrap gap-2">
            {!waitingFarmer && (
              <Button variant="brand" onClick={onAccept}>
                <Check /> Accept {formatINR(price)}/kg
              </Button>
            )}
            {!waitingFarmer && o.rounds < 2 && (
              <Button variant="outline" onClick={() => setShowCounter((s) => !s)}>
                Counter
              </Button>
            )}
            <Button variant="ghost" className="text-muted-foreground" onClick={() => act("REJECT")} disabled={busy !== null}>
              <X /> Decline
            </Button>
          </div>
          <AnimatePresence>
            {showCounter && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/50 p-3">
                  <span className="text-sm">Counter at ₹</span>
                  <input aria-label="Counter price per kg" inputMode="decimal" value={counter} onChange={(e) => setCounter(e.target.value.replace(/[^\d.]/g, ""))} className="h-10 w-24 rounded-xl border bg-background px-3 text-base" />
                  <span className="text-sm text-muted-foreground">/kg · round {o.rounds + 1} of 2</span>
                  <Button size="sm" onClick={() => act("COUNTER", Number(counter))} disabled={busy !== null || !Number(counter)}>
                    {busy === "COUNTER" && <Loader2 className="animate-spin" />} Send
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.li>
  );
}

function AcceptDialog({ demand, offer, onClose, onDone }: { demand: SerializedDemand; offer: SerializedOffer | null; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!offer) return null;
  const price = offer.status === "COUNTERED" && offer.lastActor === "FARMER" && offer.counterPrice ? offer.counterPrice : offer.pricePerKg;
  async function accept() {
    setBusy(true);
    try {
      const r = await sendJSON<{ code: string; awarded: boolean }>(`/api/offers/${offer!.id}`, { action: "ACCEPT" });
      toast.success(`Order ${r.code} placed${r.awarded ? ", requirement fully covered" : ""}`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ResponsiveModal open onOpenChange={(o) => !o && onClose()} title={`Accept ${offer.farmer.farmName ?? offer.farmer.name}`} description="This places a bulk order and reserves the farmer's stock right away.">
      <div className="space-y-4">
        <dl className="space-y-1.5 rounded-2xl bg-muted/50 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Quantity</dt>
            <dd className="tabular font-medium">{offer.qtyKg} kg</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Agreed price</dt>
            <dd className="tabular font-medium">{formatINR(price)}/kg</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery by</dt>
            <dd className="font-medium">~{offer.etaHours} h</dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Goods total</dt>
            <dd className="tabular">{formatINR(price * offer.qtyKg)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">Delivery fee for your area is added on the invoice. Payment is captured once stock is reserved; the farmer is paid after verified delivery.</p>
        <Button size="lg" variant="brand" className="w-full" onClick={accept} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Place bulk order
        </Button>
        {demand.qtyKg > offer.qtyKg && <p className="text-center text-xs text-muted-foreground">Covers {offer.qtyKg} of {demand.qtyKg} kg, you can accept more offers for the rest.</p>}
      </div>
    </ResponsiveModal>
  );
}
