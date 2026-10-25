// Marketplace browse (consumer shop and bulk "Browse & buy"): search,
// category chips, filter sheet, AI basket promo and a live-updating grid.
"use client";

import { ArrowUpRight, Leaf, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import useSWR from "swr";
import { MediaImage } from "@/components/common/media-image";
import { EmptyState, ErrorState, SkeletonCards } from "@/components/common/states";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { useI18n } from "@/components/providers/i18n-provider";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useLive } from "@/hooks/use-live";
import type { SerializedListing } from "@/lib/listings";
import { PHOTOS } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { DEFAULT_FILTERS, useBuyerFilters, type Filters, type Sort } from "./buyer-filter-context";
import { CartBar } from "./cart-bar";
import { ListingCard } from "./listing-card";

export interface CategoryChip {
  slug: string;
  name: string;
  available: boolean;
}

/** Category card photos: brand photography where we have it, seed crop photos otherwise. */
const CATEGORY_PHOTO: Record<string, { src: string; cls?: string }> = {
  "": { src: PHOTOS["veg-basket"].src },
  vegetables: { src: PHOTOS["crate-topdown"].src },
  leafy: { src: "/seed/spinach-1.jpg" },
  fruits: { src: PHOTOS["fruit-basket"].src },
  dairy: { src: "/seed/milk-1.jpg" },
  eggs: { src: "/seed/eggs-1.jpg" },
  poultry: { src: "/seed/chicken-1.jpg" },
};
const SORTS: { key: Sort; label: string }[] = [
  { key: "nearest", label: "Nearest farm" },
  { key: "fresh", label: "Freshest harvest" },
  { key: "price", label: "Lowest price" },
  { key: "quality", label: "Best quality score" },
];

/**
 * @param area - buyer's service area (shown in the header)
 * @param categories - category chips with availability in that area
 * @param detailBase - route prefix for cards (e.g. /shop/listing)
 * @param bulk - bulk-buyer mode (bigger quantity steps, no grocery promo)
 * @param initialQuery - search text from the top bar (`?q=`)
 */
export function Browse({
  area,
  categories,
  detailBase = "/shop/listing",
  bulk = false,
  title = "Fresh from the *farm*",
  top,
  initialQuery = "",
}: {
  area: string | null;
  categories: CategoryChip[];
  detailBase?: string;
  bulk?: boolean;
  title?: string;
  /** Rendered under the header (e.g. the bulk buyer tabs). */
  top?: React.ReactNode;
  initialQuery?: string;
}) {
  const { tx } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const query = useDeferredValue(q.trim());
  const [category, setCategory] = useState("");
  const buyerFilters = useBuyerFilters();
  const [localFilters, setLocalFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [localSheet, setLocalSheet] = useState(false);
  const filters = buyerFilters?.filters ?? localFilters;
  const setFilters = buyerFilters?.setFilters ?? setLocalFilters;
  const sheet = buyerFilters?.sheetOpen ?? localSheet;
  const setSheet = buyerFilters?.setSheetOpen ?? setLocalSheet;
  const activeCount = Number(filters.sort !== "nearest") + Number(Boolean(filters.maxPrice)) + Number(Boolean(filters.freshDays)) + Number(filters.gradeA);

  const key = useMemo(() => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (category) p.set("category", category);
    p.set("sort", filters.sort);
    if (filters.maxPrice) p.set("maxPrice", String(filters.maxPrice));
    if (filters.freshDays) p.set("freshDays", String(filters.freshDays));
    if (filters.gradeA) p.set("gradeA", "1");
    return `/api/listings?${p}`;
  }, [query, category, filters]);
  const { data, error, isLoading, mutate } = useSWR<SerializedListing[]>(key, { keepPreviousData: true });
  useLive(["inventory.updated"], () => mutate());

  const blocked = categories.find((c) => c.slug === category && !c.available);

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader
        title={title}
        eyebrow={
          <span className="inline-flex items-center gap-1.5 normal-case">
            <span className="size-1.5 animate-pulse rounded-full bg-lime" /> {tx("Delivering to {place}", { place: area ? tx(area) : tx("your area") })}
          </span>
        }
      />
      {top}

      {!buyerFilters && (
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx("Search crops or farmers")} className="pl-10" aria-label={tx("Search")} />
            {q && (
              <button type="button" onClick={() => setQ("")} className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full hover:bg-muted" aria-label={tx("Clear search")}>
                <X className="size-4" />
              </button>
            )}
          </label>
          <Button variant="outline" size="icon" onClick={() => setSheet(true)} aria-label={tx("Filters")} className="relative shrink-0">
            <SlidersHorizontal />
            {activeCount > 0 && <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-lime text-[11px] font-bold text-lime-foreground">{activeCount}</span>}
          </Button>
        </div>
      )}

      <div role="group" aria-label={tx("Categories")} className="-mx-4 mt-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {[{ slug: "", name: "All", available: true }, ...categories].map((c) => {
          const on = category === c.slug;
          const img = CATEGORY_PHOTO[c.slug];
          return (
            <button
              key={c.slug || "all"}
              type="button"
              onClick={() => setCategory(c.slug)}
              aria-pressed={on}
              className={cn(
                "group relative h-20 w-32 shrink-0 snap-start overflow-hidden rounded-2xl text-left ring-offset-2 ring-offset-background transition-all active:scale-[0.97] sm:w-36",
                on ? "ring-2 ring-foreground" : "ring-1 ring-border hover:ring-foreground/40",
              )}
            >
              {img && <MediaImage src={img.src} sizes="144px" className={cn("transition-transform duration-500 group-hover:scale-105", img.cls)} />}
              <span aria-hidden className={cn("absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent", !c.available && "bg-black/30")} />
              <span className="absolute inset-x-2.5 bottom-2 flex items-end justify-between gap-1 text-[13px] leading-tight font-semibold text-white">
                {tx(c.name)}
                {!c.available && <span className="rounded-full bg-white/25 px-1.5 text-[10px] font-medium backdrop-blur">{tx("Soon")}</span>}
              </span>
              {on && <span aria-hidden className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-lime ring-2 ring-black/40" />}
            </button>
          );
        })}
      </div>

      {!bulk && !query && !category && (
        <Link
          href="/shop/assistant"
          className="dark group relative mt-5 flex items-center gap-4 overflow-hidden rounded-3xl bg-background p-5 text-foreground"
        >
          <span className="absolute -top-12 -right-10 size-44 animate-orb rounded-full bg-lime/25 blur-2xl" />
          <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-lime text-lime-foreground">
            <Sparkles className="size-6" />
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block font-semibold">{tx("Snap your shopping list")}</span>
            <span className="block text-sm text-muted-foreground">{tx("Handwritten or spoken. AI builds the best basket across farms.")}</span>
          </span>
          <ArrowUpRight className="relative size-5 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      )}

      <div className="mt-5">
        {blocked ? (
          <EmptyState
            icon={Leaf}
            title={tx("{category} isn't sold in {place} yet", { category: tx(blocked.name), place: area ? tx(area) : tx("your area") })}
            body={tx("Milk, eggs and chicken need cold-chain handling, so we're piloting them in Yelahanka first.")}
          />
        ) : isLoading && !data ? (
          <SkeletonCards count={6} className="grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => mutate()} />
        ) : data && data.length === 0 ? (
          <EmptyState
            icon={Search}
            title={tx("Nothing matches yet")}
            body={tx("Try another search or clear the filters.")}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQ("");
                  if (buyerFilters) router.push("/shop");
                  setFilters(DEFAULT_FILTERS);
                  setCategory("");
                }}
              >
                {tx("Clear all")}
              </Button>
            }
          />
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {data?.length} listing{data?.length === 1 ? "" : "s"} · admin-verified harvests only
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
              {data?.map((l, i) => (
                <ListingCard key={l.id} listing={l} href={`${detailBase}/${l.id}`} bulk={bulk} index={i} />
              ))}
            </div>
          </>
        )}
      </div>

      <FilterSheet open={sheet} onOpenChange={setSheet} value={filters} onApply={(f) => { setFilters(f); setSheet(false); }} />
      <CartBar />
    </div>
  );
}

function FilterSheet({ open, onOpenChange, value, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; value: Filters; onApply: (f: Filters) => void }) {
  const { tx } = useI18n();
  const [draft, setDraft] = useState(value);
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => { if (o) setDraft(value); onOpenChange(o); }} title={tx("Filter & sort")}>
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium">{tx("Sort by")}</p>
          <div className="grid grid-cols-2 gap-2">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setDraft({ ...draft, sort: s.key })}
                className={cn("min-h-11 rounded-xl border px-3 text-sm", draft.sort === s.key && "border-foreground bg-foreground text-background")}
              >
                {tx(s.label)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">{tx("Harvested")}</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: 1, l: "Today" },
              { v: 2, l: "≤ 2 days" },
              { v: null, l: "Any time" },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                onClick={() => setDraft({ ...draft, freshDays: o.v })}
                className={cn("min-h-11 rounded-xl border text-sm", draft.freshDays === o.v && "border-foreground bg-foreground text-background")}
              >
                {tx(o.l)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-3 flex justify-between text-sm">
            <span className="font-medium">{tx("Max price")}</span>
            <span className="tabular text-muted-foreground">{draft.maxPrice ? `₹${draft.maxPrice}/unit` : "No limit"}</span>
          </div>
          <Slider min={10} max={300} step={5} value={[draft.maxPrice ?? 300]} onValueChange={([v]) => setDraft({ ...draft, maxPrice: v >= 300 ? null : v })} />
        </div>
        <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-4">
          <span className="text-sm font-medium">{tx("Grade A only")}</span>
          <Switch checked={draft.gradeA} onCheckedChange={(c) => setDraft({ ...draft, gradeA: c })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" onClick={() => setDraft(DEFAULT_FILTERS)}>
            {tx("Reset")}
          </Button>
          <Button size="lg" onClick={() => onApply(draft)}>
            {tx("Show results")}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
