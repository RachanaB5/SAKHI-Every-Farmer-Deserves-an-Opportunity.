// Navigation per role. Farmers, households, bulk buyers and admins get a
// top services bar (hamburger menu on phones) where `fab` is the lime pill
// and the cart moves up beside the account. The delivery app keeps a phone
// tab bar: `tab` items sit in it, `fab` is the raised centre action and
// everything else lives under "More".
import {
  BadgeIndianRupee,
  Bike,
  CalendarClock,
  ChartNoAxesCombined,
  ClipboardList,
  Handshake,
  LayoutGrid,
  Package,
  Plus,
  Recycle,
  Repeat,
  ScanLine,
  ScanSearch,
  Search,
  ShieldAlert,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth/token";
import type { MessageKey } from "@/lib/i18n";

export interface NavItem {
  href: string;
  labelKey: MessageKey;
  icon: LucideIcon;
  /** Shown in the bottom tab bar on phones. */
  tab?: boolean;
  /** Raised centre button on phones. */
  fab?: boolean;
  /** Only highlight on an exact path match (role home routes). */
  exact?: boolean;
  /** Live counter to render on the item. */
  badge?: "cart" | "review" | "runs";
}

export const NAV: Record<Role, NavItem[]> = {
  FARMER: [
    // Home is the harvest list with its own big + button, so neither "New
    // harvest" nor "Harvests" needs a slot; Home stays lit on those pages.
    { href: "/farmer", labelKey: "nav.home", icon: LayoutGrid },
    { href: "/farmer/orders", labelKey: "nav.orders", icon: ClipboardList },
    { href: "/farmer/listings", labelKey: "nav.listings", icon: Package },
    { href: "/farmer/payments", labelKey: "nav.payments", icon: BadgeIndianRupee },
    { href: "/farmer/bulk", labelKey: "nav.bulk", icon: Handshake },
    { href: "/farmer/surplus", labelKey: "nav.surplus", icon: Recycle },
    { href: "/farmer/pickup", labelKey: "nav.pickup", icon: ScanLine },
    { href: "/farmer/insights", labelKey: "nav.insights", icon: ChartNoAxesCombined },
  ],
  CONSUMER: [
    { href: "/shop", labelKey: "nav.shop", icon: Store, tab: true },
    { href: "/shop/assistant", labelKey: "nav.assistant", icon: Sparkles, tab: true },
    { href: "/shop/cart", labelKey: "nav.cart", icon: ShoppingBag, tab: true, badge: "cart" },
    { href: "/shop/orders", labelKey: "nav.orders", icon: Truck, tab: true },
    { href: "/shop/subscriptions", labelKey: "nav.subscriptions", icon: Repeat, tab: true },
  ],
  BULK_BUYER: [
    { href: "/bulk", labelKey: "nav.demands", icon: Handshake, tab: true },
    { href: "/bulk/browse", labelKey: "nav.browse", icon: Store, tab: true },
    { href: "/bulk/demands/new", labelKey: "nav.postDemand", icon: Plus, fab: true },
    { href: "/bulk/orders", labelKey: "nav.orders", icon: Truck, tab: true },
    { href: "/bulk/schedule", labelKey: "nav.schedule", icon: CalendarClock, tab: true },
    // Cart is reached from the floating cart bar, keeping the phone tab bar to five slots.
  ],
  ADMIN: [
    { href: "/admin", labelKey: "nav.overview", icon: ChartNoAxesCombined, tab: true },
    { href: "/admin/review", labelKey: "nav.review", icon: ScanSearch, tab: true, badge: "review" },
    { href: "/admin/orders", labelKey: "nav.orders", icon: ClipboardList, tab: true },
    { href: "/admin/trust", labelKey: "nav.trust", icon: ShieldAlert, tab: true },
    { href: "/admin/deliveries", labelKey: "nav.deliveries", icon: Bike },
    { href: "/admin/controls", labelKey: "nav.controls", icon: SlidersHorizontal },
  ],
  DELIVERY: [
    { href: "/delivery", labelKey: "nav.runs", icon: Bike, tab: true, badge: "runs" },
    { href: "/delivery/find", labelKey: "nav.find", icon: Search, tab: true },
  ],
};

/** True when `pathname` falls under the nav item (exact items match only themselves). */
function matches(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Picks the active item — the longest matching href wins, so
 * /farmer/batches/new lights up "New harvest" rather than "Harvests".
 */
export function activeHref(items: NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const item of items) {
    if (matches(item, pathname) && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}
