// Segmented progress bar for the harvest wizard (Details · Photos · Price · Review).
"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * @param steps - translated step labels
 * @param current - zero-based active step
 * @param onJump - go back to a completed step
 */
export function StepIndicator({
  steps,
  current,
  onJump,
}: {
  steps: string[];
  current: number;
  onJump?: (i: number) => void;
}) {
  return (
    <ol className="mb-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label}>
            <button
              type="button"
              disabled={!done || !onJump}
              onClick={() => onJump?.(i)}
              className="group block w-full min-h-11 text-left disabled:cursor-default"
              aria-current={active ? "step" : undefined}
            >
              <span className="relative block h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.span
                  className={cn("absolute inset-y-0 left-0 rounded-full", done ? "bg-foreground" : "bg-lime")}
                  initial={false}
                  animate={{ width: done ? "100%" : active ? "55%" : "0%" }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
              <span
                className={cn(
                  "mt-2 block text-xs leading-tight break-words",
                  active ? "font-semibold text-foreground" : done ? "text-foreground/80 group-hover:underline" : "text-muted-foreground",
                )}
              >
                <span className="tabular mr-1 text-muted-foreground">0{i + 1}</span>
                {label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
