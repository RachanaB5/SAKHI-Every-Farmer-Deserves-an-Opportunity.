// Renders children only in the browser (fallback during SSR). Used for
// forms whose defaults depend on the user's local date, so the server's
// clock or time zone can never leak into them.
"use client";

import { useMounted } from "@/hooks/use-mounted";

/** Client-only boundary. */
export function ClientOnly({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return useMounted() ? children : fallback;
}
