// Celebration mark: a check that draws itself inside a ring while
// particles burst outward. Used after submitting a harvest, delivering an
// order, and placing an order.
"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const dist = 70 + (i % 3) * 18;
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, size: 6 + (i % 4) * 2, lime: i % 2 === 0 };
});

/** Animated success badge (respects reduced motion). */
export function SuccessBurst({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("relative grid size-28 place-items-center", className)} aria-hidden>
      {!reduce &&
        PARTICLES.map((p, i) => (
          <motion.span
            key={i}
            className={cn("absolute rounded-full", p.lime ? "bg-lime" : "bg-tomato")}
            style={{ width: p.size, height: p.size }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0, 1, 0.4] }}
            transition={{ duration: 1.1, delay: 0.35 + i * 0.015, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      <motion.div
        className="grid size-24 place-items-center rounded-full bg-lime text-lime-foreground shadow-[0_20px_60px_-15px_var(--lime)]"
        initial={reduce ? false : { scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
      >
        <svg viewBox="0 0 24 24" className="size-12" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.25, ease: "easeOut" }}
          />
        </svg>
      </motion.div>
    </div>
  );
}
