// Language pickers for the farmer interface: an EN / हि / ಕ segmented
// switch, and a small globe-icon menu for the top bar.
"use client";

import { motion } from "framer-motion";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LANGS } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Small language icon + current code; opens the full language list. */
export function LanguageMenu({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("menu.language")}: ${current.label}`}
        className={cn(
          "inline-flex h-10 items-center gap-1.5 rounded-full border px-2.5 text-sm font-semibold outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Languages className="size-[18px]" />
        <span>{current.short}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-2xl p-1.5">
        <DropdownMenuLabel className="font-normal text-muted-foreground">{t("menu.language")}</DropdownMenuLabel>
        {LANGS.map((l) => (
          <DropdownMenuItem key={l.code} className="min-h-12 rounded-xl text-base" onSelect={() => setLang(l.code)}>
            <span className="flex-1">{l.label}</span>
            {l.code === lang && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * @param compact - tighter variant for the mobile top bar
 */
export function LanguageSwitch({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={t("menu.language")}
      className={cn("flex rounded-full border bg-background/60 p-0.5", compact ? "h-9" : "h-10", className)}
    >
      {LANGS.map((l) => {
        const on = l.code === lang;
        return (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={l.label}
            onClick={() => setLang(l.code)}
            className={cn(
              "relative flex-1 rounded-full font-medium transition-colors",
              compact ? "min-w-9 px-2 text-xs" : "min-w-11 px-3 text-sm",
              on ? "text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {on && (
              <motion.span
                layoutId={compact ? "lang-pill-compact" : "lang-pill"}
                className="absolute inset-0 rounded-full bg-foreground"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative">{l.short}</span>
          </button>
        );
      })}
    </div>
  );
}
