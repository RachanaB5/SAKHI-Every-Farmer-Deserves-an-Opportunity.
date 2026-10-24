// Big, thumb-friendly option buttons for the onboarding screens: pick one
// (radio) or several (checkbox), with an optional hint line under each label.
"use client";

import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { Option } from "@/lib/onboarding-options";
import { cn } from "@/lib/utils";

/**
 * @param multi - checkboxes instead of radios
 * @param cols - two columns from the sm breakpoint up
 */
export function Choices<V extends string>({
  options,
  value,
  onChange,
  multi = false,
  cols = false,
  label,
}: {
  options: readonly Option<V>[];
  value: V | V[] | undefined;
  onChange: (next: V | V[]) => void;
  multi?: boolean;
  cols?: boolean;
  label?: string;
}) {
  const selected = (v: V) => (multi ? ((value as V[] | undefined) ?? []).includes(v) : value === v);
  function pick(v: V) {
    if (!multi) return onChange(v);
    const cur = (value as V[] | undefined) ?? [];
    onChange(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  }
  return (
    <div role={multi ? "group" : "radiogroup"} aria-label={label} className={cn("grid gap-2", cols && "sm:grid-cols-2")}>
      {options.map((o) => {
        const on = selected(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={on}
            onClick={() => pick(o.value)}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-2.5 text-left text-[15px] transition-colors",
              on ? "border-foreground bg-lime/25" : "hover:border-foreground/40",
            )}
          >
            <span className={cn("grid size-5 shrink-0 place-items-center border", multi ? "rounded-md" : "rounded-full", on ? "border-foreground bg-foreground text-background" : "border-input")}>
              {on && <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className="block leading-snug font-medium">{o.label}</span>
              {o.hint && <span className="block text-sm text-muted-foreground">{o.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A labelled question block. */
export function Question({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-[15px] leading-snug">{label}</Label>
      {hint && <p className="-mt-1 text-sm text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

/** A yes/no toggle row. */
export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn("flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-left text-[15px] transition-colors", on ? "border-foreground bg-lime/25" : "hover:border-foreground/40")}
    >
      <span className="font-medium">{label}</span>
      <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", on ? "bg-foreground" : "bg-input")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-background transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}
