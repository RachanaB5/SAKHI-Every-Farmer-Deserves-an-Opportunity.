// Route enter transition (used from each interface's template.tsx, which
// remounts on navigation): a short rise + un-blur.
//
// Deliberately animates `top` (position: relative) instead of `transform`,
// and drops the blur `filter` once finished: a transform or filter on this
// wrapper would turn every `position: fixed` child (cart bar, pay bar,
// overlays) into a child of the page box instead of the viewport.
"use client";

import { motion, useReducedMotion } from "framer-motion";

/** Animates its children in whenever the route changes. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      style={{ position: "relative" }}
      initial={reduce ? false : { opacity: 0, top: 10, filter: "blur(4px)" }}
      animate={{ opacity: 1, top: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
