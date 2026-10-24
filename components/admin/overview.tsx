// Admin marketplace overview: KPI tiles (incl. kg rescued from waste),
// 30-day GMV, GMV by area, retail vs bulk split, top crops by kg and the
// ratings distribution. Live-refreshing; every chart has a data table.
"use client";

import { AlertTriangle, ArrowUpRight, Leaf, ScanSearch } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useSWR from "swr";
import { ChartCard, ChartTooltip, shortDay } from "@/components/charts/chart-card";
import { ErrorState, SkeletonBlock } from "@/components/common/states";
import { CountUp } from "@/components/motion/count-up";
import { PageHeader } from "@/components/shell/page-header";
import { useLive } from "@/hooks/use-live";
import { cropName } from "@/lib/crops";
import { formatINR, formatINRCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Analytics {
  kpis: {
    activeFarmers: number;
    totalFarmers: number;
    buyers: number;
    orders: number;
    gmv: number;
    fulfilmentRate: number;
    farmerEarnings: number;
    platformRevenue: number;
    kgSold: number;
    kgRescued: number;
    avgRating: number | null;
    pendingReview: number;
    disputes: number;
  };
  series: { date: string; gmv: number; orders: number }[];
  byArea: { area: string; gmv: number }[];
  byType: { RETAIL: number; BULK: number };
  topCrops: { crop: string; kg: number }[];
  ratings: { rating: number; count: number }[];
}

const axis = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: "var(--muted-foreground)" } } as const;

/** /admin */
export function AdminOverview() {
  const { data, error, isLoading, mutate } = useSWR<Analytics>("/api/admin/analytics", { refreshInterval: 30_000 });
  useLive(["order.updated", "batch.updated", "settlement.updated", "offer.updated"], () => mutate());

  if (isLoading) return <SkeletonBlock className="h-[32rem] w-full rounded-3xl" />;
  if (error || !data) return <ErrorState message={error?.message} onRetry={() => mutate()} />;
  const k = data.kpis;
  const typeTotal = data.byType.RETAIL + data.byType.BULK || 1;
  const tiles = [
    { label: "Active farmers", v: k.activeFarmers, sub: `of ${k.totalFarmers} onboarded` },
    { label: "Orders · 30d", v: k.orders, sub: `${k.buyers} buyers` },
    { label: "GMV · 30d", v: k.gmv, money: true, sub: `${formatINR(k.platformRevenue)} platform revenue` },
    { label: "Fulfilment rate", v: k.fulfilmentRate, pct: true, sub: "handed over vs cancelled/disputed" },
    { label: "Farmer earnings", v: k.farmerEarnings, money: true, sub: "net settlements · 30d" },
    { label: "Kg sold · 30d", v: k.kgSold, sub: "verified handovers" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Marketplace *pulse*"
        eyebrow={
          <span className="inline-flex items-center gap-1.5 normal-case">
            <span className="size-1.5 animate-pulse rounded-full bg-lime" /> Live · last 30 days
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/review" className={cn("flex items-center gap-3 rounded-3xl border p-4 hover:border-foreground/30", k.pendingReview > 0 && "border-lime bg-lime/12")}>
          <ScanSearch className="size-5" />
          <span className="flex-1 text-sm">
            <b>{k.pendingReview}</b> harvest{k.pendingReview === 1 ? "" : "s"} awaiting review
          </span>
          <ArrowUpRight className="size-4" />
        </Link>
        <Link href="/admin/orders?status=DISPUTED" className={cn("flex items-center gap-3 rounded-3xl border p-4 hover:border-foreground/30", k.disputes > 0 && "border-warning/60 bg-warning/12")}>
          <AlertTriangle className="size-5" />
          <span className="flex-1 text-sm">
            <b>{k.disputes}</b> open dispute{k.disputes === 1 ? "" : "s"}
          </span>
          <ArrowUpRight className="size-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map((t, i) => (
          <motion.div key={t.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-3xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="tabular mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              <CountUp value={t.v} format={(n) => (t.money ? formatINRCompact(n) : t.pct ? `${n.toFixed(1)}%` : Math.round(n).toLocaleString("en-IN"))} />
            </p>
            <p className="text-[11px] leading-snug text-muted-foreground">{t.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Impact hero: kg rescued */}
      <section className="dark relative overflow-hidden rounded-3xl bg-background p-5 text-foreground sm:p-6">
        <span className="absolute -top-16 -right-10 size-56 animate-orb rounded-full bg-lime/25 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Leaf className="size-4 text-lime" /> Rescued from waste via surplus offers
            </p>
            <p className="tabular text-5xl font-semibold tracking-tight text-lime">
              <CountUp value={k.kgRescued} format={(n) => `${Math.round(n)} kg`} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Average buyer rating</p>
            <p className="tabular text-3xl font-semibold">{k.avgRating ?? "-"} ★</p>
          </div>
        </div>
      </section>

      <ChartCard
        title="GMV · last 30 days"
        subtitle={`${formatINR(k.gmv)} across ${k.orders} orders`}
        table={[["Day", "GMV (₹)", "Orders"], ...data.series.map((s) => [shortDay(s.date), Math.round(s.gmv), s.orders])]}
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gmv-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="date" tickFormatter={shortDay} {...axis} minTickGap={28} />
              <YAxis {...axis} width={44} tickFormatter={(v: number) => formatINRCompact(v)} />
              <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: 3 }} content={<ChartTooltip formatValue={(v) => formatINR(v)} formatLabel={(l) => shortDay(l)} />} />
              <Area type="monotone" dataKey="gmv" name="GMV" stroke="var(--chart-1)" strokeWidth={2} fill="url(#gmv-fill)" activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="GMV by service area" table={[["Area", "GMV (₹)"], ...data.byArea.map((a) => [a.area, Math.round(a.gmv)])]}>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byArea} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barCategoryGap={6}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="area" {...axis} width={80} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip formatValue={(v) => formatINR(v)} />} />
                <Bar dataKey="gmv" name="GMV" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: "right", fontSize: 11, fill: "var(--foreground)", formatter: (v: unknown) => formatINRCompact(Number(v)) }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Top crops by kg sold" table={[["Crop", "Kg"], ...data.topCrops.map((c) => [cropName(c.crop), c.kg])]}>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topCrops.map((c) => ({ ...c, name: cropName(c.crop) }))} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barCategoryGap={4}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" {...axis} width={72} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip formatValue={(v) => `${v} kg`} />} />
                <Bar dataKey="kg" name="Kg sold" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: "right", fontSize: 11, fill: "var(--foreground)" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Retail vs bulk" subtitle="Share of 30-day GMV" table={[["Channel", "GMV (₹)"], ["Retail", Math.round(data.byType.RETAIL)], ["Bulk", Math.round(data.byType.BULK)]]}>
          <div className="flex h-4 gap-0.5 overflow-hidden rounded-full">
            <motion.span className="bg-[var(--chart-1)]" initial={{ width: 0 }} animate={{ width: `${(data.byType.RETAIL / typeTotal) * 100}%` }} transition={{ duration: 0.9 }} />
            <motion.span className="bg-[var(--chart-2)]" initial={{ width: 0 }} animate={{ width: `${(data.byType.BULK / typeTotal) * 100}%` }} transition={{ duration: 0.9, delay: 0.1 }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <p>
              <span className="mr-1.5 inline-block size-2 rounded-full bg-[var(--chart-1)]" />
              Retail <b className="tabular">{formatINRCompact(data.byType.RETAIL)}</b> <span className="text-muted-foreground">({Math.round((data.byType.RETAIL / typeTotal) * 100)}%)</span>
            </p>
            <p>
              <span className="mr-1.5 inline-block size-2 rounded-full bg-[var(--chart-2)]" />
              Bulk <b className="tabular">{formatINRCompact(data.byType.BULK)}</b> <span className="text-muted-foreground">({Math.round((data.byType.BULK / typeTotal) * 100)}%)</span>
            </p>
          </div>
        </ChartCard>

        <ChartCard title="Buyer ratings" subtitle={k.avgRating ? `Average ${k.avgRating} ★` : undefined} table={[["Stars", "Reviews"], ...data.ratings.map((r) => [`${r.rating} ★`, r.count])]}>
          <ul className="space-y-1.5">
            {data.ratings.map((r) => {
              const max = Math.max(1, ...data.ratings.map((x) => x.count));
              return (
                <li key={r.rating} className="flex items-center gap-2 text-sm">
                  <span className="tabular w-8 text-muted-foreground">{r.rating} ★</span>
                  <span className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.span className="block h-full rounded-full bg-[var(--chart-1)]" initial={{ width: 0 }} animate={{ width: `${(r.count / max) * 100}%` }} transition={{ duration: 0.8 }} />
                  </span>
                  <span className="tabular w-8 text-right">{r.count}</span>
                </li>
              );
            })}
          </ul>
        </ChartCard>
      </div>
    </div>
  );
}
