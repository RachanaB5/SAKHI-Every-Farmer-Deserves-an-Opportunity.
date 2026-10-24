// Cart page: lines grouped by farmer (each farmer becomes its own order),
// quantity steppers, remove, and a summary with the checkout CTA.
"use client";

import { ArrowRight, ShoppingBasket, Sparkles, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { EmptyState } from "@/components/common/states";
import { MediaImage } from "@/components/common/media-image";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/fees";
import { formatINR, formatQty } from "@/lib/format";
import { useCart, type CartItem } from "@/lib/store/cart";
import { stepFor } from "./add-to-cart";

const noop = () => () => {};

/** Groups cart lines by farmer, preserving insertion order. */
export function groupByFarmer(items: CartItem[]) {
  const map = new Map<string, { farmerId: string; farmerName: string; items: CartItem[] }>();
  for (const i of items) {
    const g = map.get(i.farmerId) ?? { farmerId: i.farmerId, farmerName: i.farmerName, items: [] };
    g.items.push(i);
    map.set(i.farmerId, g);
  }
  return [...map.values()];
}

/** @param bulk - bulk-buyer quantity steps */
export function CartView({ bulk = false }: { bulk?: boolean }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  if (!mounted) return null;

  const groups = groupByFarmer(items);
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);

  if (!items.length) {
    return (
      <div>
        <PageHeader title="Your *basket*" />
        <EmptyState
          icon={ShoppingBasket}
          title="Your basket is empty"
          body="Add fresh produce straight from the farm, or let AI build a basket from your shopping list."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href={bulk ? "/bulk/browse" : "/shop"}>Browse produce</Link>
              </Button>
              {!bulk && (
                <Button asChild variant="outline">
                  <Link href="/shop/assistant">
                    <Sparkles /> AI basket
                  </Link>
                </Button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Your *basket*" description={`${items.length} item${items.length > 1 ? "s" : ""} from ${groups.length} farm${groups.length > 1 ? "s" : ""}, each farm packs and ships its own order.`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {groups.map((g) => {
            const gSub = g.items.reduce((s, i) => s + i.qty * i.price, 0);
            return (
              <motion.section key={g.farmerId} layout className="rounded-3xl border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="font-semibold">{g.farmerName}</p>
                  <span className="text-xs text-muted-foreground">
                    {gSub >= FREE_DELIVERY_THRESHOLD || bulk ? (bulk ? "Bulk order" : "Free delivery 🎉") : `Add ${formatINR(FREE_DELIVERY_THRESHOLD - gSub)} for free delivery`}
                  </span>
                </div>
                <ul className="divide-y">
                  <AnimatePresence initial={false}>
                    {g.items.map((i) => {
                      const step = stepFor(i.unit, bulk);
                      return (
                        <motion.li
                          key={i.listingId}
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, x: -60, height: 0 }}
                          className="flex items-center gap-3 py-3"
                        >
                          <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">{i.imageUrl && <MediaImage src={i.imageUrl} sizes="56px" />}</div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm leading-tight font-medium break-words">{i.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatINR(i.price)}/{i.unit} · {formatINR(i.qty * i.price)}
                            </p>
                            <div className="mt-1.5 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => (i.qty - step < i.minQty ? remove(i.listingId) : setQty(i.listingId, i.qty - step))}
                                className="grid size-9 place-items-center rounded-full border text-lg"
                                aria-label="Less"
                              >
                                −
                              </button>
                              <span className="tabular min-w-16 text-center text-sm font-semibold">{formatQty(i.qty, i.unit)}</span>
                              <button
                                type="button"
                                onClick={() => setQty(i.listingId, i.qty + step)}
                                disabled={i.qty + step > i.maxQty}
                                className="grid size-9 place-items-center rounded-full border text-lg disabled:opacity-40"
                                aria-label="More"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => remove(i.listingId)} aria-label={`Remove ${i.title}`}>
                            <Trash2 className="size-4" />
                          </Button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </motion.section>
            );
          })}
        </div>
        <aside className="h-fit rounded-3xl border bg-card p-5 lg:sticky lg:top-8">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Items</span>
            <span className="tabular font-medium">{formatINR(subtotal)}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-muted-foreground">Delivery</span>
            <span className="text-muted-foreground">at checkout</span>
          </div>
          <p className="mt-3 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            No platform fee for you. Farmers pay a small commission so prices stay fair. Stock is reserved only when you pay.
          </p>
          <Button asChild size="lg" variant="brand" className="mt-4 w-full">
            <Link href="/shop/checkout">
              Checkout · {formatINR(subtotal)} <ArrowRight />
            </Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
