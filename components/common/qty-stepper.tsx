// Numeric input with large −/+ buttons (touch-friendly). Used for harvest
// quantities, cart lines and offers.
"use client";

import { Minus, Plus } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * @param value - current value as a string (lets users type freely)
 * @param step - increment for the buttons
 * @param min / max - clamp bounds for the buttons
 * @param suffix - unit label shown inside the field
 */
export function QtyStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 100_000,
  suffix,
  id,
  size = "default",
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  id?: string;
  size?: "default" | "lg";
  className?: string;
  ariaLabel?: string;
}) {
  const { t } = useI18n();
  const n = Number(value) || 0;
  const bump = (d: number) => {
    const next = Math.min(max, Math.max(min, Math.round((n + d) * 100) / 100));
    onChange(String(next));
  };
  const big = size === "lg";
  return (
    <div className={cn("flex items-stretch gap-2", className)}>
      <Button type="button" variant="outline" size={big ? "icon-lg" : "icon"} onClick={() => bump(-step)} disabled={n <= min} aria-label={t("common.decrease")}>
        <Minus />
      </Button>
      <div className="relative min-w-0 flex-1">
        <input
          id={id}
          aria-label={ariaLabel}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          className={cn(
            "tabular w-full rounded-xl border border-input bg-background/60 text-center font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            big ? "h-12 text-2xl" : "h-11 text-base",
            suffix && "pr-12",
          )}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      <Button type="button" variant="outline" size={big ? "icon-lg" : "icon"} onClick={() => bump(step)} disabled={n >= max} aria-label={t("common.increase")}>
        <Plus />
      </Button>
    </div>
  );
}
