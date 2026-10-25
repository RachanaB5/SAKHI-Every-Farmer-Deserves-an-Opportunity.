// Two-bar app shell for farmers, households, bulk buyers and admins (the
// delivery app keeps its phone shell). Bar one holds the brand, location,
// search, language, cart (buyers) and account; bar two lists
// every service. On phones both collapse into a hamburger drawer, while
// the language icon, cart and avatar stay in the top bar.
"use client";

import { LayoutGroup, motion } from "framer-motion";
import { LogOut, Menu, Search, ShoppingBag, Sprout, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { FarmerFriend, openFarmerFriend } from "@/components/assistant/farmer-friend";
import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/common/site-footer";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { useI18n } from "@/components/providers/i18n-provider";
import { BuyerFilterButton, BuyerFilterProvider } from "@/components/shop/buyer-filter-context";
import { LanguageMenu, LanguageSwitch } from "@/components/shell/language-switch";
import { NotificationBell } from "@/components/shell/notification-bell";
import { AutoLocation, LocationPicker } from "@/components/shell/location-picker";
import { useNavBadges } from "@/components/shell/use-nav-badges";
import { UserMenu, useSignOut } from "@/components/shell/user-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { PublicUser } from "@/lib/auth/public-user";
import type { Role } from "@/lib/auth/token";
import { translate, type Lang, type MessageKey } from "@/lib/i18n";
import { NAV, activeHref, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

export type TopNavRole = Exclude<Role, "DELIVERY">;

/** Per-role behaviour: where search lands and whether there's a cart. */
const SHELL: Record<TopNavRole, { search: string; searchPh: MessageKey; cart: boolean }> = {
  FARMER: { search: "/farmer", searchPh: "shell.searchPh", cart: false },
  CONSUMER: { search: "/shop", searchPh: "shell.searchShop", cart: true },
  BULK_BUYER: { search: "/bulk/browse", searchPh: "shell.searchShop", cart: true },
  ADMIN: { search: "/admin/orders", searchPh: "shell.searchAdmin", cart: false },
};

type Badges = ReturnType<typeof useNavBadges>;

/**
 * @param role - which navigation and top-bar extras to render
 * @param user - signed-in user (from the role layout)
 * @param village - farm village (farmers), shown as the location
 */
export function TopNavShell({
  role,
  user,
  village = null,
  children,
}: {
  role: TopNavRole;
  user: PublicUser;
  village?: string | null;
  children: React.ReactNode;
}) {
  const shell = <ShellInner role={role} user={user} village={village}>{children}</ShellInner>;
  return (
    <>
      {role === "CONSUMER" ? <BuyerFilterProvider>{shell}</BuyerFilterProvider> : shell}
      {role === "FARMER" && <FarmerFriend />}
    </>
  );
}

function ShellInner({ role, user, village, children }: { role: TopNavRole; user: PublicUser; village: string | null; children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const config = SHELL[role];
  // The cart lives in the first bar, so it isn't repeated among the services.
  const items = NAV[role].filter((i) => i.badge !== "cart");
  const active = activeHref(NAV[role], pathname);
  const badges = useNavBadges(role);
  const [menuOpen, setMenuOpen] = useState(false);
  const first = user.name.split(" ")[0];
  // The active address (set from the location picker), shortened for the bar.
  const short = shortAddress(user.address);
  const place =
    role === "FARMER"
      ? { label: t("shell.yourFarm"), value: short ?? [village, user.area].filter(Boolean).join(", ") }
      : role === "ADMIN"
        ? null
        : { label: t("shell.deliverTo", { name: user.orgName ?? first }), value: short ?? user.area ?? "" };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 print:hidden">
        <div className="border-b bg-card/95 text-foreground backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:px-6 md:gap-4">
            <Button variant="ghost" size="icon" className="-ml-1 size-11 md:hidden" aria-label={t("shell.menu")} onClick={() => setMenuOpen(true)}>
              <Menu className="size-6" />
            </Button>
            <Logo href={NAV[role][0].href} className="shrink-0" />
            {place && <LocationPicker label={place.label} value={place.value} defaultLabel={role === "FARMER" ? "Farm" : role === "BULK_BUYER" ? "Kitchen" : "Home"} className="hidden lg:flex" />}
            <AutoLocation enabled={role === "CONSUMER" || role === "BULK_BUYER"} />
            {role === "CONSUMER" && pathname === "/shop" ? (
              <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
                <Suspense fallback={<div className="h-11 min-w-0 flex-1" />}>
                  <SearchBox role={role} items={items} className="flex flex-1" />
                </Suspense>
                <BuyerFilterButton />
              </div>
            ) : (
              <Suspense fallback={<div className="hidden flex-1 md:block" />}>
                <SearchBox role={role} items={items} className="hidden flex-1 md:flex" />
              </Suspense>
            )}
            <div className="ml-auto flex items-center gap-1 md:ml-0 md:gap-2">
              <LanguageMenu />
              {role === "FARMER" && <NotificationBell />}
              <ThemeToggle className="hidden md:inline-flex" />
              <UserMenu user={user} greeting />
              {config.cart && <CartLink count={badges.cart} />}
            </div>
          </div>
        </div>
        {role === "CONSUMER" && pathname === "/shop" && (
          <div className="border-b bg-card/95 px-3 py-2 text-foreground backdrop-blur md:hidden">
            <div className="mx-auto flex max-w-7xl items-center gap-2">
              <Suspense fallback={<div className="h-11 min-w-0 flex-1" />}>
                <SearchBox role={role} items={items} className="flex flex-1" />
              </Suspense>
              <BuyerFilterButton />
            </div>
          </div>
        )}
        <ServicesBar items={items} active={active} badges={badges} />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-16 print:p-0">{children}</main>

      <SiteFooter variant="compact" className="pb-24" />

      <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} role={role} user={user} place={place} items={items} active={active} badges={badges} />
    </div>
  );
}

/** First two parts of an address ("Flat 4, Hebbal, Bengaluru 560024" → "Flat 4, Hebbal"), or null. */
function shortAddress(address: string | null): string | null {
  if (!address) return null;
  return address.split(",").map((p) => p.trim()).filter(Boolean).slice(0, 2).join(", ") || null;
}

/** A service whose name (in the UI language or English) starts with the query. */
function findService(items: NavItem[], q: string, lang: Lang): NavItem | undefined {
  const needle = q.toLowerCase();
  return items.find((item) =>
    [translate(lang, item.labelKey), translate("en", item.labelKey)].some((label) => label.toLowerCase().startsWith(needle)),
  );
}

/**
 * Search box: a service name jumps straight to it, anything else opens the
 * role's search page with `?q=` (harvests, the shop, or admin orders).
 * @param onDone - called after navigating (closes the phone menu)
 */
function SearchBox({ role, items, className, onDone }: { role: TopNavRole; items: NavItem[]; className?: string; onDone?: () => void }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const current = useSearchParams().get("q") ?? "";
  const { search, searchPh } = SHELL[role];

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    const service = q.length >= 3 ? findService(items, q, lang) : undefined;
    router.push(service ? service.href : q ? `${search}?q=${encodeURIComponent(q)}` : search);
    onDone?.();
  }

  return (
    <form role="search" onSubmit={submit} className={cn("h-11 min-w-0 overflow-hidden rounded-xl border bg-background focus-within:ring-2 focus-within:ring-lime", className)}>
      <input
        key={current}
        name="q"
        type="search"
        defaultValue={current}
        placeholder={t(searchPh)}
        aria-label={t("shell.search")}
        className="min-w-0 flex-1 bg-transparent px-4 text-[15px] outline-none placeholder:text-muted-foreground"
      />
      <button type="submit" aria-label={t("shell.search")} className="grid w-12 shrink-0 place-items-center bg-lime text-lime-foreground transition-colors hover:bg-lime/85">
        <Search className="size-5" />
      </button>
    </form>
  );
}

/** Cart icon with the live line count; also the fly-to-cart animation target. */
function CartLink({ count }: { count: number }) {
  const { t } = useI18n();
  return (
    <Link
      href="/shop/cart"
      aria-label={count ? `${t("nav.cart")} (${count})` : t("nav.cart")}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 hover:bg-muted/60 md:px-2.5"
    >
      <span className="relative" data-cart-target="">
        <ShoppingBag className="size-6" />
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 0.4 }}
            animate={{ scale: 1 }}
            className="absolute -top-1.5 -right-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-lime px-1 text-[11px] font-bold text-lime-foreground"
          >
            {count}
          </motion.span>
        )}
      </span>
      <span className="hidden text-sm font-semibold md:inline">{t("nav.cart")}</span>
    </Link>
  );
}

/** Live count pill for a nav item (admin review queue). */
function Count({ item, badges, className }: { item: NavItem; badges: Badges; className?: string }) {
  const n = item.badge ? badges[item.badge] : 0;
  if (!n) return null;
  return <span className={cn("grid min-w-5 place-items-center rounded-full bg-lime px-1.5 text-[11px] font-semibold text-lime-foreground", className)}>{n}</span>;
}

/** Second bar: every service, the role's primary action (`fab`) first as a lime pill. */
function ServicesBar({ items, active, badges }: { items: NavItem[]; active: string | null; badges: Badges }) {
  const { t } = useI18n();
  const ordered = [...items.filter((i) => i.fab), ...items.filter((i) => !i.fab)];
  return (
    <nav aria-label={t("shell.services")} className="hidden border-b bg-muted/70 text-foreground backdrop-blur md:block">
      <LayoutGroup id="top-services">
        <ul className="mx-auto flex h-12 max-w-7xl items-center gap-1 overflow-x-auto px-3 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
          {ordered.map((item) => {
            const on = item.href === active;
            const Icon = item.icon;
            return (
              <li key={item.href} className={cn("shrink-0", item.fab && "mr-2")}>
                <Link
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-9 items-center gap-1.5 whitespace-nowrap transition-colors",
                    item.fab
                      ? cn("rounded-full bg-lime px-3.5 text-sm font-semibold text-lime-foreground active:scale-95", on && "ring-2 ring-lime/40 ring-offset-2 ring-offset-card")
                      : cn("rounded-lg px-3 text-sm hover:bg-muted", on ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"),
                  )}
                >
                  <Icon className="size-4" strokeWidth={item.fab ? 2.75 : 2} />
                  {t(item.labelKey)}
                  <Count item={item} badges={badges} />
                  {on && !item.fab && (
                    <motion.span
                      layoutId="service-underline"
                      className="absolute inset-x-2 -bottom-1.5 h-0.5 rounded-full bg-lime"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </LayoutGroup>
    </nav>
  );
}

/** Phone drawer: greeting, location, search, every service, language, sign out. */
function MobileMenu({
  open,
  onOpenChange,
  role,
  user,
  place,
  items,
  active,
  badges,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: TopNavRole;
  user: PublicUser;
  place: { label: string; value: string } | null;
  items: NavItem[];
  active: string | null;
  badges: Badges;
}) {
  const { t } = useI18n();
  const signOut = useSignOut();
  const close = () => onOpenChange(false);
  const ordered = [...items.filter((i) => i.fab), ...items.filter((i) => !i.fab)];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" showCloseButton={false} className="w-[88%] max-w-sm gap-0 overflow-y-auto p-0">
        <div className="border-b bg-muted/70 px-5 py-5 text-foreground">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-xl font-semibold text-foreground">{t("shell.hello", { name: user.name.split(" ")[0] })}</SheetTitle>
              <SheetDescription className="sr-only">{t("shell.services")}</SheetDescription>
              {place && <LocationPicker label={place.label} value={place.value} defaultLabel={role === "FARMER" ? "Farm" : role === "BULK_BUYER" ? "Kitchen" : "Home"} className="-ml-1.5 mt-3 flex" />}
            </div>
            <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={close} aria-label={t("common.close")}>
              <X className="size-5" />
            </Button>
          </div>
        </div>

        <div className="space-y-6 p-4">
          {role !== "CONSUMER" && (
            <Suspense>
              <SearchBox role={role} items={items} className="flex" onDone={close} />
            </Suspense>
          )}

          <nav aria-label={t("shell.services")}>
            <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("shell.services")}</p>
            <ul className="space-y-1">
              {ordered.map((item) => {
                const on = item.href === active;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={close}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex min-h-14 items-center gap-3 rounded-2xl px-3 text-base transition-colors",
                        item.fab ? "mb-2 bg-lime font-semibold text-lime-foreground" : on ? "bg-muted font-semibold" : "hover:bg-muted/60",
                      )}
                    >
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", item.fab ? "bg-lime-foreground/10" : "bg-muted")}>
                        <Icon className="size-5" strokeWidth={item.fab ? 2.75 : 2} />
                      </span>
                      <span className="flex-1">{t(item.labelKey)}</span>
                      <Count item={item} badges={badges} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {role === "FARMER" && (
            <Button
              variant="outline"
              className="min-h-14 w-full justify-start gap-3 rounded-2xl text-base"
              onClick={() => {
                close();
                openFarmerFriend();
              }}
            >
              <Sprout className="size-5" /> {t("ff.show")}
            </Button>
          )}

          <section>
            <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("menu.language")}</p>
            <LanguageSwitch className="h-12" />
          </section>

          <div className="flex items-center justify-between border-t pt-4">
            <ThemeToggle />
            <Button variant="ghost" className="min-h-11 text-destructive" onClick={signOut}>
              <LogOut /> {t("menu.signOut")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
