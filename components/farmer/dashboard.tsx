// Farmer sales dashboard (/farmer/insights): greeting + big "list a harvest" action, KPI
// tiles (today, 30-day revenue, fees, delivery costs, estimated net,
// pending vs settled), 14-day sales bars, mandi price trend lines,
// inventory sell-through, order pipeline and a surplus alert.
"use client";

import { AlertTriangle, ArrowUpRight, Mic, Package, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useSWR from "swr";
import { ChartCard, ChartTooltip, shortDay } from "@/components/charts/chart-card";
import { ErrorState, SkeletonBlock } from "@/components/common/states";
import { FarmerStatusBadge, statusText } from "@/components/farmer/farmer-status-badge";
import { CountUp } from "@/components/motion/count-up";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/use-live";
import { cropName } from "@/lib/crops";
import { formatINR, formatINRCompact, formatQty, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Dashboard {
  commissionPct: number;
  name: string;
  today: { orders: number; sales: number };
  last30: { gross: number; fees: number; deliveryCosts: number; net: number; kgSold: number; orders: number };
  money: { awaiting: number; pending: number; settled: number };
  series: { date: string; gross: number; kg: number }[];
  trend: { mandi: string; crops: string[]; rows: Record<string, number | string>[] };
  inventory: { id: string; title: string; crop: string; unit: string; price: number; status: string; total: number; available: number; reserved: number; sold: number; sellThrough: number }[];
  statusCounts: Record<string, number>;
  recent: { id: string; code: string; status: string; buyer: string; total: number; createdAt: string }[];
  surplus: { count: number };
}

const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

/** /farmer */
export function FarmerDashboard() {
  const { t, lang } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<Dashboard>("/api/farmer/dashboard", { refreshInterval: 30_000 });
  useLive(["order.updated", "settlement.updated", "batch.updated"], () => mutate());

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-32 w-full rounded-3xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-24 rounded-3xl" />
          ))}
        </div>
        <SkeletonBlock className="h-64 w-full rounded-3xl" />
      </div>
    );
  }
  if (error || !data) return <ErrorState message={error?.message} onRetry={() => mutate()} />;

  const first = data.name.split(" ")[0];
  const kpis = [
    { k: t("dash.todaySales"), v: data.today.sales, sub: data.today.orders === 1 ? t("payments.order") : t("payments.orders", { count: data.today.orders }) },
    { k: t("dash.revenue"), v: data.last30.gross, sub: t("dash.kgSold", { kg: data.last30.kgSold }) },
    { k: t("dash.fees"), v: data.last30.fees, sub: t("dash.commission", { pct: data.last30.gross > 0 ? Math.round((data.last30.fees / data.last30.gross) * 1000) / 10 : data.commissionPct }) },
    { k: t("dash.deliveryCosts"), v: data.last30.deliveryCosts, sub: t("dash.courierShare") },
  ];

  return (
    <div className="space-y-5">
      {/* Hero */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dark relative overflow-hidden rounded-[2rem] bg-background p-5 text-foreground sm:p-7">
        <span className="absolute -top-20 -right-16 size-72 animate-orb rounded-full bg-lime/25 blur-3xl" />
        <span className="absolute -bottom-24 left-10 size-56 animate-orb rounded-full bg-tomato/15 blur-3xl [animation-delay:-6s]" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t("dash.subtitle")}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{t("dash.greeting", { name: first })}</h1>
            <p className="mt-4 text-xs text-muted-foreground">{t("dash.netEstimate")} · {t("dash.days30")}</p>
            <p className="tabular text-5xl font-semibold tracking-tight text-lime">
              <CountUp value={data.last30.net} format={(n) => formatINR(n)} />
            </p>
          </div>
          <Button asChild size="lg" variant="brand" className="h-14 rounded-2xl px-6 text-base">
            <Link href="/farmer/batches/new">
              <Mic /> {t("dash.newHarvest")}
            </Link>
          </Button>
        </div>
      </motion.section>

      {data.surplus.count > 0 && (
        <Link href="/farmer/surplus" className="flex items-center gap-3 rounded-3xl border border-warning/50 bg-warning/12 p-4 transition-colors hover:bg-warning/20">
          <span className="relative grid size-10 shrink-0 place-items-center rounded-2xl bg-warning/30">
            <AlertTriangle className="size-5" />
            <span className="absolute inset-0 animate-pulse-ring rounded-2xl bg-warning/40" />
          </span>
          <span className="flex-1 text-sm">
            <b>{t("dash.surplusAlert", { count: data.surplus.count })}</b>
            <span className="block text-muted-foreground">{t("dash.surplusHint")}</span>
          </span>
          <ArrowUpRight className="size-5" />
        </Link>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="rounded-3xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{kpi.k}</p>
            <p className="tabular mt-1 text-2xl font-semibold tracking-tight">
              <CountUp value={kpi.v} format={(n) => formatINR(n)} />
            </p>
            <p className="text-[11px] text-muted-foreground">{kpi.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Money states */}
      <Link href="/farmer/payments" className="grid grid-cols-3 divide-x rounded-3xl border bg-card text-center transition-colors hover:border-foreground/30">
        {[
          { k: t("payments.awaiting"), v: data.money.awaiting },
          { k: t("dash.pendingSettlement"), v: data.money.pending },
          { k: t("dash.settled"), v: data.money.settled, strong: true },
        ].map((m) => (
          <div key={m.k} className="px-2 py-4">
            <p className="text-[11px] leading-tight text-muted-foreground">{m.k}</p>
            <p className={cn("tabular mt-1 text-lg font-semibold", m.strong && "text-success")}>{formatINRCompact(m.v)}</p>
          </div>
        ))}
      </Link>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title={t("dash.sales14")}
          subtitle={t("dash.salesSub", { amount: formatINR(data.series.reduce((s, d) => s + d.gross, 0)), count: data.last30.orders })}
          table={[[t("dash.day"), t("dash.salesRs"), t("common.kg")], ...data.series.map((s) => [shortDay(s.date), Math.round(s.gross), s.kg])]}
        >
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.series} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="date" tickFormatter={shortDay} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis hide />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip formatValue={(v) => formatINR(v)} formatLabel={(l) => shortDay(l)} />} />
                <Bar dataKey="gross" name={t("dash.sales")} fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title={t("dash.priceTrend")}
          subtitle={t("dash.trendSub", { mandi: data.trend.mandi })}
          legend={data.trend.crops.map((c, i) => ({ label: cropName(c, lang), color: SERIES[i] }))}
          table={[[t("dash.day"), ...data.trend.crops.map((c) => cropName(c, lang))], ...data.trend.rows.map((r) => [shortDay(String(r.date)), ...data.trend.crops.map((c) => r[c] ?? "-")])]}
          action={<TrendingUp className="size-4 text-muted-foreground" />}
        >
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend.rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="date" tickFormatter={shortDay} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v: number) => `₹${Math.round(v)}`}
                  domain={[(min: number) => Math.max(0, Math.floor(min / 5) * 5 - 5), (max: number) => Math.ceil(max / 5) * 5 + 5]}
                />
                <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: 3 }} content={<ChartTooltip formatValue={(v) => `₹${v}`} formatLabel={(l) => shortDay(l)} />} />
                {data.trend.crops.map((c, i) => (
                  <Line key={c} type="monotone" dataKey={c} name={cropName(c, lang)} stroke={SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section className="rounded-3xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("dash.inventory")}</h3>
            <Link href="/farmer/listings" className="text-sm text-muted-foreground hover:text-foreground">
              {t("common.viewAll")}
            </Link>
          </div>
          <ul className="mt-3 space-y-3">
            {data.inventory.slice(0, 6).map((l) => (
              <li key={l.id}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{cropName(l.crop, lang)}</span>
                  <span className="tabular text-muted-foreground">
                    {formatQty(l.available, l.unit, lang)} {t("listings.available")} · {l.sellThrough}% {t("listings.sold")}
                  </span>
                </div>
                <div className="mt-1 flex h-2 gap-0.5 overflow-hidden rounded-full">
                  <motion.span className="bg-foreground" initial={{ width: 0 }} animate={{ width: `${(l.sold / Math.max(1, l.total)) * 100}%` }} transition={{ duration: 0.8 }} />
                  <motion.span className="bg-foreground/40" initial={{ width: 0 }} animate={{ width: `${(l.reserved / Math.max(1, l.total)) * 100}%` }} transition={{ duration: 0.8, delay: 0.1 }} />
                  <span className="flex-1 bg-muted" />
                </div>
              </li>
            ))}
            {data.inventory.length === 0 && <p className="text-sm text-muted-foreground">{t("common.empty")}</p>}
          </ul>
          <p className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-foreground" /> {t("listings.sold")}
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-foreground/40" /> {t("listings.reserved")}
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-muted ring-1 ring-border" /> {t("listings.available")}
            </span>
          </p>
        </section>

        <section className="rounded-3xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("dash.recentOrders")}</h3>
            <Link href="/farmer/orders" className="text-sm text-muted-foreground hover:text-foreground">
              {t("common.viewAll")}
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(data.statusCounts)
              .filter(([, n]) => n > 0)
              .map(([s, n]) => (
                <FarmerStatusBadge key={s} status={s} label={`${n} · ${statusText(t, s)}`} />
              ))}
          </div>
          {data.recent.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{t("common.empty")}</p>}
          <ul className="mt-3 divide-y">
            {data.recent.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Package className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-xs font-semibold">{o.code}</span>
                  <span className="block text-xs break-words text-muted-foreground">
                    {o.buyer} · {timeAgo(o.createdAt, lang)}
                  </span>
                </span>
                <span className="tabular font-medium">{formatINR(o.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
