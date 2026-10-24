// Live counters shown on nav items (cart lines, admin review queue,
// delivery runs). Each source only loads for the role that needs it.
"use client";

import useSWR from "swr";
import { useSyncExternalStore } from "react";
import type { Role } from "@/lib/auth/token";
import { useCartCount } from "@/lib/store/cart";

export type BadgeKey = "cart" | "review" | "runs";

const noop = () => () => {};

/** Returns badge counts for the role's nav. */
export function useNavBadges(role: Role): Record<BadgeKey, number> {
  const cart = useCartCount();
  // The cart lives in localStorage — only trust it on the client to avoid hydration mismatch.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const { data: counts } = useSWR<{ review?: number; runs?: number }>(
    role === "ADMIN" || role === "DELIVERY" ? "/api/nav/counts" : null,
    { refreshInterval: 15_000 },
  );
  return {
    cart: mounted && (role === "CONSUMER" || role === "BULK_BUYER") ? cart : 0,
    review: counts?.review ?? 0,
    runs: counts?.runs ?? 0,
  };
}
