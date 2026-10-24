// Entrance animations: blur-up reveal for blocks, word-by-word headline
// reveal, and a stagger container. Shared by landing, login and dashboards.
"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Fades/blurs a block in when it scrolls into view.
 * @param delay - seconds before starting
 * @param y - initial vertical offset in px
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  once = true,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once, margin: "-40px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: EASE } },
};

/** Parent that staggers its <StaggerItem> children on mount. */
export function Stagger({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "ul";
}) {
  const reduce = useReducedMotion();
  const Comp = as === "ul" ? motion.ul : motion.div;
  return (
    <Comp className={className} variants={container} initial={reduce ? false : "hidden"} animate="show">
      {children}
    </Comp>
  );
}

/** Child of <Stagger>. */
export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}

/**
 * Headline that reveals word by word with a masked slide-up.
 * Words wrapped in *asterisks* render in the italic serif accent.
 */
export function WordReveal({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  return (
    <span className={cn("inline", className)} aria-label={text.replace(/\*/g, "")}>
      {words.map((w, i) => {
        const accent = w.startsWith("*") && w.endsWith("*");
        const clean = w.replace(/\*/g, "");
        return (
          <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <motion.span
              className={cn("inline-block", accent && "font-serif font-normal italic")}
              initial={reduce ? false : { y: "110%", rotate: 4 }}
              animate={{ y: "0%", rotate: 0 }}
              transition={{ duration: 0.8, delay: delay + i * 0.06, ease: EASE }}
            >
              {clean}
              {i < words.length - 1 ? " " : ""}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}
