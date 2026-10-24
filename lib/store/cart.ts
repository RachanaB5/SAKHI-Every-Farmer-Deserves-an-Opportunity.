// Client cart (multi-farmer), persisted to localStorage. Adding to the
// cart never touches inventory — stock is only reserved when an order is
// confirmed server-side (lib/inventory.ts).
"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface CartItem {
  listingId: string;
  title: string;
  crop: string;
  unit: string;
  price: number;
  qty: number;
  minQty: number;
  maxQty: number;
  farmerId: string;
  farmerName: string;
  imageUrl: string | null;
  area: string;
}

interface CartState {
  items: CartItem[];
  /** Adds qty to an existing line or creates it; clamps to available stock. */
  add: (item: Omit<CartItem, "qty">, qty: number) => void;
  setQty: (listingId: string, qty: number) => void;
  remove: (listingId: string) => void;
  clear: () => void;
  /** Drops the lines belonging to the given farmers (after a successful checkout). */
  removeFarmers: (farmerIds: string[]) => void;
}

/** Keeps quantities in 0.5 steps within [min, max]. */
const clamp = (qty: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(qty * 2) / 2));

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item, qty) =>
        set((s) => {
          const existing = s.items.find((i) => i.listingId === item.listingId);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.listingId === item.listingId
                  ? { ...i, ...item, qty: clamp(i.qty + qty, item.minQty, item.maxQty) }
                  : i,
              ),
            };
          }
          return { items: [...s.items, { ...item, qty: clamp(qty, item.minQty, item.maxQty) }] };
        }),
      setQty: (listingId, qty) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.listingId === listingId ? { ...i, qty: clamp(qty, i.minQty, i.maxQty) } : i,
          ),
        })),
      remove: (listingId) => set((s) => ({ items: s.items.filter((i) => i.listingId !== listingId) })),
      clear: () => set({ items: [] }),
      removeFarmers: (farmerIds) =>
        set((s) => ({ items: s.items.filter((i) => !farmerIds.includes(i.farmerId)) })),
    }),
    { name: "foodflow-cart", storage: createJSONStorage(() => localStorage) },
  ),
);

/** Number of distinct lines in the cart (used for the tab badge). */
export function useCartCount() {
  return useCart((s) => s.items.length);
}
