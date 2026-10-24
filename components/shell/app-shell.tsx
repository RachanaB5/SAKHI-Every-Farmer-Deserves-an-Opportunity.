// Phone-style app shell for the delivery rider app: compact top bar +
// floating glass tab bar with an animated active pill and centre action,
// and a "More" sheet for overflow items. The other roles use TopNavShell.
"use client";

import { LayoutGroup, motion } from "framer-motion";
import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { SiteFooter } from "@/components/common/site-footer";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { I18nProvider, useI18n } from "@/components/providers/i18n-provider";
import { UserMenu } from "@/components/shell/user-menu";
import { useNavBadges } from "@/components/shell/use-nav-badges";
import type { PublicUser } from "@/lib/auth/public-user";
import type { Role } from "@/lib/auth/token";
import { NAV, activeHref, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * @param role - which navigation to render
 * @param user - signed-in user (from the role layout)
 */
export function AppShell({ role, user, children }: { role: Role; user: PublicUser; children: React.ReactNode }) {
  return (
    <I18nProvider initial="en" persist={false}>
      <ShellInner role={role} user={user}>
        {children}
      </ShellInner>
    </I18nProvider>
  );
}

function ShellInner({ role, user, children }: { role: Role; user: PublicUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const items = NAV[role];
  const active = activeHref(items, pathname);

  return (
    <div className="min-h-dvh">
      <div className="flex min-w-0 flex-col">
        <TopBar user={user} items={items} active={active} />
        <main className="mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-6 sm:px-6 print:p-0">{children}</main>
        <SiteFooter variant="compact" className="pb-24" />
      </div>
      <BottomNav role={role} items={items} active={active} />
    </div>
  );
}

function TopBar({ user, items, active }: { user: PublicUser; items: NavItem[]; active: string | null }) {
  const { t } = useI18n();
  const current = items.find((i) => i.href === active);
  return (
    <header className="glass sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-4 sm:px-6 print:hidden">
      <Link href={items[0].href} aria-label="Home" className="mr-auto sm:mr-0">
        <LogoMark />
      </Link>
      <motion.span
        key={current?.href}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="hidden min-w-0 flex-1 truncate text-[15px] font-semibold sm:block"
      >
        {current ? t(current.labelKey) : ""}
      </motion.span>
      <ThemeToggle />
      <UserMenu user={user} compact />
    </header>
  );
}

function BottomNav({ role, items, active }: { role: Role; items: NavItem[]; active: string | null }) {
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const tabs = items.filter((i) => i.tab);
  const fab = items.find((i) => i.fab);
  const more = items.filter((i) => !i.tab && !i.fab);
  const badges = useNavBadges(role);
  const moreActive = more.some((i) => i.href === active);

  // Centre the FAB: split tabs into left/right halves.
  const half = Math.ceil(tabs.length / 2);
  const left = fab ? tabs.slice(0, half) : tabs;
  const right = fab ? tabs.slice(half) : [];

  return (
    <>
      <nav
        aria-label="Tabs"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-md print:hidden"
      >
        <LayoutGroup id="tabs">
          <div className="glass flex items-stretch justify-around rounded-[26px] border px-1.5 py-1.5 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.35)]">
            {left.map((item) => (
              <Tab key={item.href} item={item} on={item.href === active} label={t(item.labelKey)} count={item.badge ? badges[item.badge] : 0} />
            ))}
            {fab && (
              <div className="relative -mt-6 size-14 shrink-0 self-start">
                {/* Pulse ring sits behind the button so it never tints it. */}
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-lime/70 motion-reduce:hidden" />
                <Link
                  href={fab.href}
                  aria-label={t(fab.labelKey)}
                  className="relative grid size-14 place-items-center rounded-full bg-foreground text-background shadow-xl ring-4 ring-background transition-transform active:scale-95"
                >
                  <fab.icon className={cn("size-6 transition-transform duration-300", pathname === fab.href && "rotate-45")} />
                </Link>
              </div>
            )}
            {right.map((item) => (
              <Tab key={item.href} item={item} on={item.href === active} label={t(item.labelKey)} count={item.badge ? badges[item.badge] : 0} />
            ))}
            {more.length > 0 && (
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={cn(
                  "relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px]",
                  moreActive ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {moreActive && <motion.span layoutId="tab-pill" className="absolute inset-0 -z-10 rounded-2xl bg-lime/35" />}
                <Ellipsis className="size-5" />
                {t("nav.more")}
              </button>
            )}
          </div>
        </LayoutGroup>
      </nav>
      {more.length > 0 && (
        <ResponsiveModal open={moreOpen} onOpenChange={setMoreOpen} title={t("nav.more")}>
          <div className="grid grid-cols-2 gap-3">
            {more.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex min-h-24 flex-col justify-between rounded-2xl border p-4 transition-colors hover:bg-muted",
                    item.href === active && "border-foreground bg-lime/20",
                  )}
                >
                  <Icon className="size-5" />
                  <span className="text-sm font-medium">{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </div>
        </ResponsiveModal>
      )}
    </>
  );
}

function Tab({ item, on, label, count }: { item: NavItem; on: boolean; label: string; count: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      className={cn(
        "relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[11px] leading-tight transition-colors",
        on ? "font-semibold text-foreground" : "text-muted-foreground",
      )}
    >
      {on && (
        <motion.span
          layoutId="tab-pill"
          className="absolute inset-0 -z-10 rounded-2xl bg-lime/35"
          transition={{ type: "spring", stiffness: 500, damping: 36 }}
        />
      )}
      <span className="relative" data-cart-target={item.badge === "cart" ? "" : undefined}>
        <Icon className="size-5" />
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 0.4 }}
            animate={{ scale: 1 }}
            className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-tomato px-1 text-[10px] font-bold text-white"
          >
            {count}
          </motion.span>
        )}
      </span>
      <span className="max-w-full text-center whitespace-nowrap">{label}</span>
    </Link>
  );
}

