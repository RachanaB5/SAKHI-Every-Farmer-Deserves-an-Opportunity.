// "Bulk procurement | Browse & buy" switch at the top of the bulk buyer's
// two main screens.
"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/bulk", label: "Bulk procurement" },
  { href: "/bulk/browse", label: "Browse & buy" },
];

/** Segmented link pair with a sliding pill. */
export function BulkTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl border p-1">
      {TABS.map((t) => {
        const on = pathname === t.href;
        return (
          <Link key={t.href} href={t.href} className={cn("relative flex min-h-11 items-center justify-center rounded-xl px-2 text-center text-sm font-medium", on ? "text-background" : "text-muted-foreground")}>
            {on && <motion.span layoutId="bulk-tab" className="absolute inset-0 -z-10 rounded-xl bg-foreground" />}
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
