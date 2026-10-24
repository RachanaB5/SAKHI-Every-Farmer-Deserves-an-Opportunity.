// Avatar menu: who you are, sign out.
"use client";

import { ChevronDown, ChevronsUpDown, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PublicUser } from "@/lib/auth/public-user";
import type { Role } from "@/lib/auth/token";
import { sendJSON } from "@/lib/fetcher";
import { ROLE_META } from "@/lib/roles";
import { useCart } from "@/lib/store/cart";
import { cn } from "@/lib/utils";

/** Two-letter initials for the avatar. */
function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Signs out, clears the local cart and returns to the landing page. */
export function useSignOut() {
  const router = useRouter();
  const { t } = useI18n();
  const clearCart = useCart((s) => s.clear);
  return async function signOut() {
    await sendJSON("/api/auth/logout").catch(() => {});
    clearCart();
    toast(t("menu.signedOut"));
    router.push("/");
    router.refresh();
  };
}

/**
 * @param compact - avatar-only trigger (mobile top bar)
 * @param greeting - "Hello, name / Account" trigger (farmer top bar); avatar-only on phones
 * @param side - where the menu opens
 */
export function UserMenu({
  user,
  compact = false,
  greeting = false,
  side = "bottom",
}: {
  user: PublicUser;
  compact?: boolean;
  greeting?: boolean;
  side?: "top" | "bottom";
}) {
  const { t } = useI18n();
  const signOut = useSignOut();
  const meta = ROLE_META[user.role as Role];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-3 rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact && "size-11 justify-center",
          greeting && "min-h-11 gap-2 px-1.5 hover:bg-muted/60 md:px-2.5",
          !compact && !greeting && "w-full border bg-background/60 p-2.5 hover:bg-muted/60",
        )}
        aria-label={t("menu.accountMenu")}
      >
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-lime text-[13px] font-semibold text-lime-foreground", greeting && "md:hidden")}>
          {initials(user.name)}
        </span>
        {greeting && (
          <span className="hidden leading-tight md:block">
            <span className="block text-xs text-muted-foreground">{t("shell.hello", { name: user.name.split(" ")[0] })}</span>
            <span className="flex items-center gap-0.5 text-sm font-semibold">
              {t("shell.account")} <ChevronDown className="size-3.5 text-muted-foreground" />
            </span>
          </span>
        )}
        {!compact && !greeting && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-tight font-medium break-words">
                {user.orgName ?? user.name}
              </span>
              <span className="block text-xs text-muted-foreground">
                {meta.label}
                {user.area ? ` · ${user.area}` : ""}
              </span>
            </span>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-64 rounded-2xl p-1.5">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">{user.name}</span>
          <span className="block text-xs text-muted-foreground">
            {user.orgName ? `${user.orgName} · ` : ""}+91 {user.phone}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11 rounded-xl" variant="destructive" onSelect={signOut}>
          <LogOut /> {t("menu.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
