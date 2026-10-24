// Farmer payments: three honest money stages (awaiting delivery → pending
// settlement → settled), a 30-day gross/fees/delivery/net breakdown, and
// a per-order timeline with the exact fee math. A placed or captured
// order is never shown as money received.
"use client";

import { ChevronDown, Clock, Landmark, Wallet } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useState } from "react";
import useSWR from "swr";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/common/states";
import { CountUp } from "@/components/motion/count-up";
import { useI18n } from "@/components/providers/i18n-provider";
import type { MessageKey } from "@/lib/i18n";
import { PageHeader } from "@/components/shell/page-header";
import { useLive } from "@/hooks/use-live";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

type Stage = "AWAITING" | "PENDING" | "SETTLED";
interface Row {
  orderId: string;
  code: string;
  stage: Stage;
  orderStatus: string | null;
  gross: number;
  platformFee: number;
  deliveryCost: number;
  net: number;
  estimated: boolean;
  authorisedAt: string | null;
  capturedAt: string | null;
  deliveredAt: string | null;
  settledAt: string | null;
  createdAt: string;
}
interface Data {
  commissionPct: number;
  summary: {
    awaiting: { count: number; net: number };
    pending: { count: number; net: number };
    settled30d: { count: number; net: number };
    fees30d: number;
    deliveryCosts30d: number;
    gross30d: number;
  };
  rows: Row[];
}

const STAGES: { key: Stage; title: MessageKey; short: MessageKey; sub: MessageKey; tone: string; icon: typeof Wallet }[] = [
  { key: "AWAITING", title: "payments.awaiting", short: "payments.awaiting", sub: "payments.awaitingSub", tone: "bg-info/12 text-info", icon: Clock },
  { key: "PENDING", title: "payments.pending", short: "payments.pending", sub: "payments.pendingSub", tone: "bg-warning/20", icon: Wallet },
  { key: "SETTLED", title: "payments.settled", short: "status.SETTLED", sub: "payments.settledSub", tone: "bg-lime/40", icon: Landmark },
];

/** /farmer/payments */
export function Payments() {
  const { t } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<Data>("/api/farmer/payments");
  useLive(["settlement.updated", "order.updated"], () => mutate());
  const [filter, setFilter] = useState<Stage | "ALL">("ALL");

  if (isLoading) return <SkeletonBlock className="h-96 w-full rounded-3xl" />;
  if (error || !data) return <ErrorState message={error?.message} onRetry={() => mutate()} />;
  const s = data.summary;
  const amounts: Record<Stage, { count: number; net: number }> = { AWAITING: s.awaiting, PENDING: s.pending, SETTLED: s.settled30d };
  const rows = data.rows.filter((r) => filter === "ALL" || r.stage === filter);
  const parts = [
    { k: t("payments.yourNet"), v: Math.max(0, s.gross30d - s.fees30d - s.deliveryCosts30d), c: "bg-lime" },
    { k: t("payments.platformFee", { pct: s.gross30d > 0 ? Math.round((s.fees30d / s.gross30d) * 1000) / 10 : data.commissionPct }), v: s.fees30d, c: "bg-foreground/70" },
    { k: t("payments.deliveryShare"), v: s.deliveryCosts30d, c: "bg-tomato/80" },
  ];

  return (
    <div>
      <PageHeader title={t("payments.title")} description={t("payments.desc")} />

      {/* Money pipeline */}
      <div className="grid gap-3 md:grid-cols-3">
        {STAGES.map((st, i) => (
          <div key={st.key} className="relative">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="h-full rounded-3xl border bg-card p-5">
              <span className={cn("inline-grid size-10 place-items-center rounded-2xl", st.tone)}>
                <st.icon className="size-5" />
              </span>
              <p className="mt-3 text-sm font-medium text-muted-foreground">{t(st.title)}</p>
              <p className="tabular mt-1 text-3xl font-semibold tracking-tight">
                <CountUp value={amounts[st.key].net} format={(n) => formatINR(n)} />
              </p>
              <p className="text-xs text-muted-foreground">
                {amounts[st.key].count === 1 ? t("payments.order") : t("payments.orders", { count: amounts[st.key].count })} · {t(st.sub)}
              </p>
            </motion.div>
            {i < STAGES.length - 1 && <FlowConnector />}
          </div>
        ))}
      </div>

      {/* 30-day breakdown */}
      <section className="mt-5 rounded-3xl border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">{t("payments.last30")}</p>
          <p className="text-sm text-muted-foreground">
            {t("payments.gross")} <span className="tabular font-semibold text-foreground">{formatINR(s.gross30d)}</span>
          </p>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
          {parts.map((p, i) => (
            <motion.span key={p.k} className={p.c} initial={{ width: 0 }} animate={{ width: `${s.gross30d ? (p.v / s.gross30d) * 100 : 0}%` }} transition={{ duration: 0.9, delay: 0.2 + i * 0.1 }} />
          ))}
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          {parts.map((p) => (
            <div key={p.k}>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("size-2 rounded-full", p.c)} /> {p.k}
              </dt>
              <dd className="tabular font-semibold">{formatINR(p.v)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Timeline */}
      <LayoutGroup id="pay-filter">
        <div className="mt-6 mb-3 flex flex-wrap gap-2">
          {(["ALL", "AWAITING", "PENDING", "SETTLED"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn("relative h-11 rounded-full px-4 text-sm font-medium", filter === f ? "text-background" : "border text-muted-foreground")}>
              {filter === f && <motion.span layoutId="pay-pill" className="absolute inset-0 -z-10 rounded-full bg-foreground" />}
              {f === "ALL" ? t("payments.all") : t(STAGES.find((x) => x.key === f)!.short)}
            </button>
          ))}
        </div>
      </LayoutGroup>
      {rows.length === 0 && <EmptyState icon={Wallet} title={t("common.empty")} />}
      <ul className="space-y-2">
        {rows.map((r) => (
          <PaymentRow key={`${r.stage}-${r.orderId}`} row={r} />
        ))}
      </ul>
    </div>
  );
}

/** Dots flowing from one stage card to the next. */
function FlowConnector() {
  return (
    <div aria-hidden className="pointer-events-none absolute z-10 flex md:top-1/2 md:-right-3 md:h-1 md:w-6 md:-translate-y-1/2 max-md:-bottom-3 max-md:left-1/2 max-md:h-6 max-md:w-1 max-md:-translate-x-1/2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute size-1.5 rounded-full bg-lime"
          animate={{ opacity: [0, 1, 0], x: ["0%", "300%"], y: ["0%", "0%"] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.45 }}
        />
      ))}
    </div>
  );
}

function PaymentRow({ row }: { row: Row }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const steps = [
    { k: t("payments.authorised"), at: row.authorisedAt },
    { k: t("payments.captured"), at: row.capturedAt },
    { k: t("status.DELIVERED"), at: row.deliveredAt },
    { k: t("status.SETTLED"), at: row.settledAt, settle: true },
  ];
  return (
    <li className="overflow-hidden rounded-2xl border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-sm font-semibold">{row.code}</span>
          <span className="mt-1 flex items-center gap-1">
            {steps.map((st, i) => (
              <span key={st.k} className="flex items-center gap-1">
                <span className={cn("size-2 rounded-full", st.at ? "bg-lime" : "bg-muted-foreground/30")} title={st.k} />
                {i < steps.length - 1 && <span className={cn("h-px w-3", steps[i + 1].at ? "bg-lime" : "bg-muted-foreground/30")} />}
              </span>
            ))}
            <span className="ml-2 text-xs text-muted-foreground">{formatDate(row.createdAt, lang)}</span>
          </span>
        </span>
        <span className="text-right">
          <span className="tabular block font-semibold">
            {row.estimated && <span className="mr-1 text-xs font-normal text-muted-foreground">{t("payments.est")}</span>}
            {formatINR(row.net, true)}
          </span>
          <span className={cn("text-xs", row.stage === "SETTLED" ? "text-success" : row.stage === "PENDING" ? "text-foreground" : "text-muted-foreground")}>
            {row.stage === "SETTLED" ? t("status.SETTLED") : row.stage === "PENDING" ? t("payments.pending") : t("payments.awaiting")}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-t">
            <div className="space-y-3 p-4 text-sm">
              <p className="tabular flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{formatINR(row.gross, true)}</span>
                <span className="text-muted-foreground">− {t("payments.feeLine", { amount: formatINR(row.platformFee, true) })}</span>
                <span className="text-muted-foreground">− {t("payments.deliveryLine", { amount: formatINR(row.deliveryCost, true) })}</span>
                <span>= </span>
                <span className="font-semibold">{formatINR(row.net, true)}</span>
              </p>
              <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {steps.map((st) => (
                  <li key={st.k} className={cn("rounded-xl p-2", st.at ? "bg-lime/20" : "bg-muted/60 text-muted-foreground")}>
                    <span className="block text-xs font-medium">{st.k}</span>
                    <span className="block text-[11px]">{st.at ? formatDateTime(st.at, lang) : st.settle && row.stage === "PENDING" ? t("payments.nextBatch") : "-"}</span>
                  </li>
                ))}
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
