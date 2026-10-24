// Animated circular score gauge (0–100) with a counting number. Colour
// shifts tomato → amber → lime as the score rises.
"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useId } from "react";
import { cn } from "@/lib/utils";

/**
 * @param score - 0–100
 * @param size - diameter in px
 * @param label - small caption under the number
 */
export function ScoreGauge({ score, size = 132, label, className }: { score: number; size?: number; label?: string; className?: string }) {
  const reduce = useReducedMotion();
  const id = useId();
  const value = useMotionValue(reduce ? score : 0);
  const display = useTransform(value, (v) => Math.round(v));
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = useTransform(value, (v) => c * (1 - v / 100));

  useEffect(() => {
    const controls = animate(value, score, { duration: reduce ? 0 : 1.4, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [score, value, reduce]);

  const color = score >= 85 ? "var(--lime)" : score >= 70 ? "var(--warning)" : "var(--tomato)";
  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--muted)" strokeWidth="10" />
        <motion.circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={`url(#g-${id})`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          style={{ strokeDashoffset: offset }}
        />
      </svg>
      <div className="text-center">
        <motion.span className="tabular block text-4xl leading-none font-semibold tracking-tight">{display}</motion.span>
        {label && <span className="mx-auto mt-1 block max-w-[72%] text-[10px] leading-tight text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}
