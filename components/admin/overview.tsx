// Admin marketplace overview: KPI tiles (incl. kg rescued from waste),
// 30-day GMV, GMV by area, retail vs bulk split, top crops by kg and the
// ratings distribution. Live-refreshing; every chart has a data table.
"use client";

import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bike,
  ChartNoAxesCombined,
  ClipboardList,
  Leaf,
  ScanSearch,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

const axis = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
} as const;

/** /admin */
export function AdminOverview() {
  const { data, error, isLoading, mutate } = useSWR<Analytics>("/api/admin/analytics", {
    refreshInterval: 30_000,
  });
  useLive(["order.updated", "batch.updated", "settlement.updated", "offer.updated"], () =>
    mutate(),
  );

  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Admin *command center*"
          description="Marketplace operations and live performance, all in one place."
        />
        <AdminWorkspaces />
        <div id="marketplace-pulse" className="scroll-mt-28">
          <SkeletonBlock className="h-[32rem] w-full rounded-3xl" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Admin *command center*"
          description="Marketplace operations and live performance, all in one place."
        />
        <AdminWorkspaces />
        <div id="marketplace-pulse" className="scroll-mt-28">
          <ErrorState message={error?.message} onRetry={() => mutate()} />
        </div>
      </div>
    );
  }
  const k = data.kpis;
  const typeTotal = data.byType.RETAIL + data.byType.BULK || 1;
  const tiles = [
    { label: "Active farmers", v: k.activeFarmers, sub: `of ${k.totalFarmers} onboarded` },
    { label: "Orders · 30d", v: k.orders, sub: `${k.buyers} buyers` },
    {
      label: "GMV · 30d",
      v: k.gmv,
      money: true,
      sub: `${formatINR(k.platformRevenue)} platform revenue`,
    },
    {
      label: "Fulfilment rate",
      v: k.fulfilmentRate,
      pct: true,
      sub: "handed over vs cancelled/disputed",
    },
    { label: "Farmer earnings", v: k.farmerEarnings, money: true, sub: "net settlements · 30d" },
    { label: "Kg sold · 30d", v: k.kgSold, sub: "verified handovers" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin *command center*"
        description="Marketplace operations and live performance, all in one place."
      />

      <AdminWorkspaces pendingReview={k.pendingReview} disputes={k.disputes} />

      <section
        id="marketplace-pulse"
        aria-labelledby="marketplace-pulse-title"
        className="scroll-mt-28"
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-muted-foreground mb-1 inline-flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <span className="bg-lime size-1.5 animate-pulse rounded-full" /> Live · last 30 days
            </p>
            <h2 id="marketplace-pulse-title" className="text-2xl font-semibold tracking-tight">
              Marketplace pulse
            </h2>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/admin/review"
            className={cn(
              "hover:border-foreground/30 flex items-center gap-3 rounded-3xl border p-4",
              k.pendingReview > 0 && "border-lime bg-lime/12",
            )}
          >
            <ScanSearch className="size-5" />
            <span className="flex-1 text-sm">
              <b>{k.pendingReview}</b> harvest{k.pendingReview === 1 ? "" : "s"} awaiting review
            </span>
            <ArrowUpRight className="size-4" />
          </Link>
          <Link
            href="/admin/orders?status=DISPUTED"
            className={cn(
              "hover:border-foreground/30 flex items-center gap-3 rounded-3xl border p-4",
              k.disputes > 0 && "border-warning/60 bg-warning/12",
            )}
          >
            <AlertTriangle className="size-5" />
            <span className="flex-1 text-sm">
              <b>{k.disputes}</b> open dispute{k.disputes === 1 ? "" : "s"}
            </span>
            <ArrowUpRight className="size-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {tiles.map((t, i) => (
            <motion.div
              key={t.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card rounded-3xl border p-4"
            >
              <p className="text-muted-foreground text-xs">{t.label}</p>
              <p className="tabular mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                <CountUp
                  value={t.v}
                  format={(n) =>
                    t.money
                      ? formatINRCompact(n)
                      : t.pct
                        ? `${n.toFixed(1)}%`
                        : Math.round(n).toLocaleString("en-IN")
                  }
                />
              </p>
              <p className="text-muted-foreground text-[11px] leading-snug">{t.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Impact hero: kg rescued */}
        <section className="dark bg-background text-foreground relative overflow-hidden rounded-3xl p-5 sm:p-6">
          <span className="animate-orb bg-lime/25 absolute -top-16 -right-10 size-56 rounded-full blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Leaf className="text-lime size-4" /> Rescued from waste via surplus offers
              </p>
              <p className="tabular text-lime text-5xl font-semibold tracking-tight">
                <CountUp value={k.kgRescued} format={(n) => `${Math.round(n)} kg`} />
              </p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-sm">Average buyer rating</p>
              <p className="tabular text-3xl font-semibold">{k.avgRating ?? "-"} ★</p>
            </div>
          </div>
        </section>

        <ChartCard
          title="GMV · last 30 days"
          subtitle={`${formatINR(k.gmv)} across ${k.orders} orders`}
          table={[
            ["Day", "GMV (₹)", "Orders"],
            ...data.series.map((s) => [shortDay(s.date), Math.round(s.gmv), s.orders]),
          ]}
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
                <Tooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: 3 }}
                  content={
                    <ChartTooltip
                      formatValue={(v) => formatINR(v)}
                      formatLabel={(l) => shortDay(l)}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="gmv"
                  name="GMV"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#gmv-fill)"
                  activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard
            title="GMV by service area"
            table={[["Area", "GMV (₹)"], ...data.byArea.map((a) => [a.area, Math.round(a.gmv)])]}
          >
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.byArea}
                  layout="vertical"
                  margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
                  barCategoryGap={6}
                >
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="area" {...axis} width={80} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                    content={<ChartTooltip formatValue={(v) => formatINR(v)} />}
                  />
                  <Bar
                    dataKey="gmv"
                    name="GMV"
                    fill="var(--chart-1)"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={22}
                    label={{
                      position: "right",
                      fontSize: 11,
                      fill: "var(--foreground)",
                      formatter: (v: unknown) => formatINRCompact(Number(v)),
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Top crops by kg sold"
            table={[["Crop", "Kg"], ...data.topCrops.map((c) => [cropName(c.crop), c.kg])]}
          >
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.topCrops.map((c) => ({ ...c, name: cropName(c.crop) }))}
                  layout="vertical"
                  margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                  barCategoryGap={4}
                >
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" {...axis} width={72} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                    content={<ChartTooltip formatValue={(v) => `${v} kg`} />}
                  />
                  <Bar
                    dataKey="kg"
                    name="Kg sold"
                    fill="var(--chart-1)"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={22}
                    label={{ position: "right", fontSize: 11, fill: "var(--foreground)" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Retail vs bulk"
            subtitle="Share of 30-day GMV"
            table={[
              ["Channel", "GMV (₹)"],
              ["Retail", Math.round(data.byType.RETAIL)],
              ["Bulk", Math.round(data.byType.BULK)],
            ]}
          >
            <div className="flex h-4 gap-0.5 overflow-hidden rounded-full">
              <motion.span
                className="bg-[var(--chart-1)]"
                initial={{ width: 0 }}
                animate={{ width: `${(data.byType.RETAIL / typeTotal) * 100}%` }}
                transition={{ duration: 0.9 }}
              />
              <motion.span
                className="bg-[var(--chart-2)]"
                initial={{ width: 0 }}
                animate={{ width: `${(data.byType.BULK / typeTotal) * 100}%` }}
                transition={{ duration: 0.9, delay: 0.1 }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <p>
                <span className="mr-1.5 inline-block size-2 rounded-full bg-[var(--chart-1)]" />
                Retail <b className="tabular">{formatINRCompact(data.byType.RETAIL)}</b>{" "}
                <span className="text-muted-foreground">
                  ({Math.round((data.byType.RETAIL / typeTotal) * 100)}%)
                </span>
              </p>
              <p>
                <span className="mr-1.5 inline-block size-2 rounded-full bg-[var(--chart-2)]" />
                Bulk <b className="tabular">{formatINRCompact(data.byType.BULK)}</b>{" "}
                <span className="text-muted-foreground">
                  ({Math.round((data.byType.BULK / typeTotal) * 100)}%)
                </span>
              </p>
            </div>
          </ChartCard>

          <ChartCard
            title="Buyer ratings"
            subtitle={k.avgRating ? `Average ${k.avgRating} ★` : undefined}
            table={[["Stars", "Reviews"], ...data.ratings.map((r) => [`${r.rating} ★`, r.count])]}
          >
            <ul className="space-y-1.5">
              {data.ratings.map((r) => {
                const max = Math.max(1, ...data.ratings.map((x) => x.count));
                return (
                  <li key={r.rating} className="flex items-center gap-2 text-sm">
                    <span className="tabular text-muted-foreground w-8">{r.rating} ★</span>
                    <span className="bg-muted h-3 flex-1 overflow-hidden rounded-full">
                      <motion.span
                        className="block h-full rounded-full bg-[var(--chart-1)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${(r.count / max) * 100}%` }}
                        transition={{ duration: 0.8 }}
                      />
                    </span>
                    <span className="tabular w-8 text-right">{r.count}</span>
                  </li>
                );
              })}
            </ul>
          </ChartCard>
        </div>
      </section>
    </div>
  );
}

function AdminWorkspaces({
  pendingReview,
  disputes,
}: {
  pendingReview?: number;
  disputes?: number;
}) {
  const workspaces = [
    {
      href: "#marketplace-pulse",
      title: "Marketplace overview",
      description: "GMV, farmer earnings, fulfilment, sales and waste-rescue analytics.",
      action: "View analytics",
      icon: ChartNoAxesCombined,
      status: "Live · 30 days",
    },
    {
      href: "/admin/review",
      title: "Harvest review",
      description:
        "Review farmer listings, quality signals and duplicate-photo flags before publishing.",
      action: "Open review queue",
      icon: ScanSearch,
      status: pendingReview === undefined ? "Human approval" : `${pendingReview} awaiting review`,
    },
    {
      href: "/admin/orders",
      title: "Orders & refunds",
      description:
        "Monitor retail and bulk orders, investigate disputes and issue or dismiss refunds.",
      action: "Manage orders",
      icon: ClipboardList,
      status: disputes === undefined ? "Order operations" : `${disputes} open disputes`,
    },
    {
      href: "/admin/trust",
      title: "Trust & safety",
      description:
        "Investigate complaints, price outliers and reused photos; suspend or reinstate accounts.",
      action: "Open trust center",
      icon: ShieldAlert,
      status: "People make decisions",
    },
    {
      href: "/admin/deliveries",
      title: "Delivery operations",
      description: "Manage rider availability, reassign runs and review failed OTP / QR handovers.",
      action: "Manage deliveries",
      icon: Bike,
      status: "Live handovers",
    },
    {
      href: "/admin/controls",
      title: "Platform controls",
      description:
        "Set fees and service areas, configure surplus rules, run payouts and subscriptions.",
      action: "Open controls",
      icon: SlidersHorizontal,
      status: "Settings & payouts",
    },
  ];

  return (
    <section aria-labelledby="admin-workspaces-title">
      <h2
        id="admin-workspaces-title"
        className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase"
      >
        Admin workspaces
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {workspaces.map((workspace) => (
          <Link
            key={workspace.title}
            href={workspace.href}
            className="group hover:border-lime/60 focus-visible:ring-lime flex min-h-52 flex-col rounded-[2rem] border border-white/10 bg-[#193729] p-5 text-white transition duration-200 hover:-translate-y-0.5 hover:bg-[#1d402f] focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="text-lime grid size-12 place-items-center rounded-full bg-[#456a39]">
              <workspace.icon className="size-5" aria-hidden="true" />
            </span>
            <span className="mt-4 text-xl font-semibold tracking-tight">{workspace.title}</span>
            <span className="mt-1 text-sm leading-relaxed text-white/75">
              {workspace.description}
            </span>
            <span className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm font-medium">
              <span className="text-lime">{workspace.status}</span>
              <span className="inline-flex items-center gap-1.5 transition-transform group-hover:translate-x-1">
                {workspace.action} <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
