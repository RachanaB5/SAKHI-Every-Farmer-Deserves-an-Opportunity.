// Sticky cart CTA for shoppers: floats above the mobile tab bar (and as a
// pill bottom-right on desktop) whenever the cart has items.
"use client";

import { ArrowRight, ShoppingBag } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { formatINR } from "@/lib/format";
import { useCart } from "@/lib/store/cart";

const noop = () => () => {};

/** Hidden on the cart/checkout pages themselves. */
export function CartBar() {
  const pathname = usePathname();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const items = useCart((s) => s.items);
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);
  const farmers = new Set(items.map((i) => i.farmerId)).size;
  const show = mounted && items.length > 0 && !pathname.startsWith("/shop/cart") && !pathname.startsWith("/shop/checkout");

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md lg:right-8 lg:bottom-8 lg:left-auto lg:mx-0 lg:w-96"
        >
          <Link
            href="/shop/cart"
            className="flex min-h-14 items-center gap-3 rounded-2xl bg-foreground px-4 py-2.5 text-background shadow-[0_20px_50px_-15px_rgba(0,0,0,0.5)]"
          >
            <span className="relative grid size-9 place-items-center rounded-xl bg-lime text-lime-foreground">
              <ShoppingBag className="size-5" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-sm font-semibold">
                {items.length} item{items.length > 1 ? "s" : ""} · <span className="tabular">{formatINR(total)}</span>
              </span>
              <span className="block text-xs opacity-70">
                from {farmers} farmer{farmers > 1 ? "s" : ""}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              View cart <ArrowRight className="size-4" />
            </span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
