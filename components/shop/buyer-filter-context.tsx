"use client";

import { createContext, useContext, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Sort = "nearest" | "price" | "fresh" | "quality";
export interface Filters {
  sort: Sort;
  maxPrice: number | null;
  freshDays: number | null;
  gradeA: boolean;
}

export const DEFAULT_FILTERS: Filters = { sort: "nearest", maxPrice: null, freshDays: null, gradeA: false };

interface BuyerFilterState {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  sheetOpen: boolean;
  setSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const BuyerFilterContext = createContext<BuyerFilterState | null>(null);

export function BuyerFilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  return <BuyerFilterContext.Provider value={{ filters, setFilters, sheetOpen, setSheetOpen }}>{children}</BuyerFilterContext.Provider>;
}

export function useBuyerFilters() {
  return useContext(BuyerFilterContext);
}

export function BuyerFilterButton() {
  const buyerFilters = useBuyerFilters();
  if (!buyerFilters) return null;

  const { filters, setSheetOpen } = buyerFilters;
  const activeCount = Number(filters.sort !== "nearest") + Number(Boolean(filters.maxPrice)) + Number(Boolean(filters.freshDays)) + Number(filters.gradeA);

  return (
    <Button variant="outline" size="icon" onClick={() => setSheetOpen(true)} aria-label="Filters" className="relative shrink-0">
      <SlidersHorizontal />
      {activeCount > 0 && <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-lime text-[11px] font-bold text-lime-foreground">{activeCount}</span>}
    </Button>
  );
}
