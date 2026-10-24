// Subscribes to a CSS media query (SSR-safe; false until mounted).
"use client";

import { useSyncExternalStore } from "react";

/**
 * @param query - e.g. "(min-width: 768px)"
 * @returns whether the query currently matches
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True at ≥768px — the breakpoint where bottom sheets become dialogs. */
export function useIsDesktop() {
  return useMediaQuery("(min-width: 768px)");
}
