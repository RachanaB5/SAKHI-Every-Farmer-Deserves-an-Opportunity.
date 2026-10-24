// Add-to-cart control: an "Add" button that morphs into an inline −/qty/+
// stepper once the item is in the cart. Cart changes never touch stock —
// inventory is only reserved when an order is confirmed at checkout.
"use client";

import { Minus, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { flyToCart } from "@/lib/fly-to-cart";
import type { SerializedListing } from "@/lib/listings";
import { useCart } from "@/lib/store/cart";
import { cn } from "@/lib/utils";

const noop = () => () => {};

/** Quantity increment per unit; bulk buyers move in bigger steps. */
export function stepFor(unit: string, bulk = false): number {
  if (unit === "kg") return bulk ? 5 : 0.5;
  return bulk ? 5 : 1;
}

/**
 * @param listing - product to add
 * @param bulk - bulk-buyer step sizes
 * @param size - "sm" for cards, "lg" for the detail page
 */
export function AddToCart({
  listing,
  bulk = false,
  size = "sm",
  className,
}: {
  listing: SerializedListing;
  bulk?: boolean;
  size?: "sm" | "lg";
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const line = useCart((s) => s.items.find((i) => i.listingId === listing.id));
  const add = useCart((s) => s.add);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const step = stepFor(listing.unit, bulk);
  const min = Math.max(listing.minOrderQty, step > listing.availableQty ? listing.minOrderQty : bulk ? step : listing.minOrderQty);
  const qty = mounted ? line?.qty ?? 0 : 0;
  const h = size === "lg" ? "h-12" : "h-10";

  function addFirst(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    add(
      {
        listingId: listing.id,
        title: listing.title,
        crop: listing.crop,
        unit: listing.unit,
        price: listing.price,
        minQty: min,
        maxQty: listing.availableQty,
        farmerId: listing.farmer.id,
        farmerName: listing.farmer.name,
        imageUrl: listing.imageUrl,
        area: listing.area,
      },
      min,
    );
    flyToCart(ref.current?.closest("[data-fly-from]") as HTMLElement | null, listing.imageUrl);
  }

  function change(e: React.MouseEvent, delta: number) {
    e.preventDefault();
    e.stopPropagation();
    const next = Math.round((qty + delta) * 100) / 100;
    if (next < min) return remove(listing.id);
    if (next > listing.availableQty) return toast(`Only ${listing.availableQty} ${listing.unit} available`);
    setQty(listing.id, next);
  }

  return (
    <div className={cn("relative", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        {qty === 0 ? (
          <motion.button
            key="add"
            ref={ref}
            type="button"
            onClick={addFirst}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileTap={{ scale: 0.9 }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 font-medium text-background shadow-lg",
              h,
              size === "lg" ? "w-full justify-center text-base" : "text-sm",
            )}
            aria-label={`Add ${listing.title} to cart`}
          >
            <Plus className="size-4" /> Add
          </motion.button>
        ) : (
          <motion.div
            key="stepper"
            initial={{ opacity: 0, scale: 0.8, width: 60 }}
            animate={{ opacity: 1, scale: 1, width: "auto" }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={cn("flex items-center rounded-full bg-lime text-lime-foreground shadow-lg", h, size === "lg" && "w-full justify-between")}
          >
            <button type="button" onClick={(e) => change(e, -step)} className={cn("grid place-items-center", h, size === "lg" ? "w-14" : "w-10")} aria-label="Less">
              <Minus className="size-4" />
            </button>
            <motion.span key={qty} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="tabular min-w-12 text-center text-sm font-semibold">
              {qty} {listing.unit === "kg" ? "kg" : listing.unit === "litre" ? "L" : "dz"}
            </motion.span>
            <button type="button" onClick={(e) => change(e, step)} className={cn("grid place-items-center", h, size === "lg" ? "w-14" : "w-10")} aria-label="More">
              <Plus className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
