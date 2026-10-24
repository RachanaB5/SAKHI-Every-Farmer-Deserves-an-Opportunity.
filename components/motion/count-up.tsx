// Number that counts up to its value when it enters the viewport — used
// for prices, dashboard KPIs and landing-page impact counters.
"use client";

import { animate, useInView, useMotionValue, useReducedMotion, useTransform, motion } from "framer-motion";
import { useEffect, useRef } from "react";

/**
 * @param value - target number
 * @param format - formatter for the displayed value (e.g. formatINR)
 * @param duration - seconds
 */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString("en-IN"),
  duration = 1.2,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => format(v));

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration: reduce ? 0 : duration, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [inView, value, duration, mv, reduce]);

  return (
    <motion.span ref={ref} className={className} data-numeric>
      {text}
    </motion.span>
  );
}
