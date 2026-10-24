// Sakhi avatar: a little sprout drawn in SVG whose pose tells
// the farmer what it's doing — idle sway, listening rings + red mic dot,
// thinking dots, a mouth that moves with each spoken word, a confirm glow,
// and a droop on errors. Honours prefers-reduced-motion.
"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type AvatarState = "idle" | "listening" | "thinking" | "speaking" | "confirm" | "error";

/**
 * @param state - what the assistant is doing
 * @param word - increments on every spoken word (speechSynthesis boundary) to move the mouth
 */
export function FarmerFriendAvatar({ state, word = 0, size = 96, className }: { state: AvatarState; word?: number; size?: number; className?: string }) {
  const still = useReducedMotion() ?? false;
  const loop = (d: number) => (still ? { duration: 0 } : { duration: d, repeat: Infinity, ease: "easeInOut" as const });
  const drooped = state === "error";

  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }} aria-hidden>
      {/* Listening rings / confirm glow */}
      {state === "listening" &&
        !still &&
        [0, 0.6, 1.2].map((delay) => (
          <motion.span
            key={delay}
            className="absolute inset-[8%] rounded-full border-2 border-lime"
            initial={{ scale: 0.7, opacity: 0.8 }}
            animate={{ scale: 1.35, opacity: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, delay, ease: "easeOut" }}
          />
        ))}
      {state === "confirm" && (
        <motion.span className="absolute inset-[6%] rounded-full bg-lime/40 blur-md" animate={still ? {} : { opacity: [0.45, 0.95, 0.45], scale: [0.95, 1.06, 0.95] }} transition={loop(1.6)} />
      )}

      <motion.svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className="relative"
        style={{ transformOrigin: "60px 108px", filter: drooped ? "grayscale(0.55)" : undefined }}
        animate={drooped ? { rotate: -9, y: 4 } : state === "idle" && !still ? { rotate: [-3, 3, -3] } : state === "confirm" ? { rotate: 0, scale: 1.04 } : { rotate: 0, y: 0, scale: 1 }}
        transition={state === "idle" ? loop(4) : { type: "spring", stiffness: 200, damping: 14 }}
      >
        <defs>
          <radialGradient id="ff-body" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#e9ff8a" />
            <stop offset="55%" stopColor="#c6f432" />
            <stop offset="100%" stopColor="#7cbf2a" />
          </radialGradient>
          <linearGradient id="ff-leaf" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5fae3a" />
            <stop offset="100%" stopColor="#2f7a22" />
          </linearGradient>
        </defs>

        {/* Leaves + stem */}
        <motion.g style={{ transformOrigin: "60px 44px" }} animate={drooped ? { rotate: 0, scaleY: 0.8 } : state === "listening" ? { scaleY: 1.12 } : still ? {} : { rotate: [-4, 4, -4] }} transition={state === "listening" || drooped ? { type: "spring", stiffness: 260, damping: 12 } : loop(3)}>
          <path d="M60 46 C60 38 60 32 60 26" stroke="#2f7a22" strokeWidth="4" strokeLinecap="round" fill="none" />
          <motion.path d="M60 30 C48 16 32 18 26 26 C38 34 50 34 60 30 Z" fill="url(#ff-leaf)" style={{ transformOrigin: "60px 30px" }} animate={drooped ? { rotate: 28 } : { rotate: 0 }} />
          <motion.path d="M60 30 C72 14 90 16 95 24 C84 33 70 34 60 30 Z" fill="url(#ff-leaf)" style={{ transformOrigin: "60px 30px" }} animate={drooped ? { rotate: -28 } : { rotate: 0 }} />
        </motion.g>

        {/* Body */}
        <ellipse cx="60" cy="74" rx="36" ry="33" fill="url(#ff-body)" />
        <ellipse cx="47" cy="60" rx="10" ry="6" fill="#fff" opacity="0.35" />

        {/* Eyes (blink while idle, look up while thinking) */}
        <motion.g style={{ transformOrigin: "60px 70px" }} animate={state === "idle" && !still ? { scaleY: [1, 1, 0.1, 1, 1] } : { scaleY: 1 }} transition={state === "idle" ? { duration: 4.5, repeat: Infinity, times: [0, 0.46, 0.5, 0.54, 1] } : { duration: 0.2 }}>
          <ellipse cx="47" cy="70" rx="6.5" ry="7.5" fill="#fff" />
          <ellipse cx="73" cy="70" rx="6.5" ry="7.5" fill="#fff" />
          <motion.g animate={state === "thinking" ? { y: -2.5, x: 1.5 } : drooped ? { y: 2 } : { y: 0, x: 0 }}>
            <circle cx="48" cy="71" r="3.4" fill="#163323" />
            <circle cx="74" cy="71" r="3.4" fill="#163323" />
            <circle cx="49.2" cy="69.6" r="1.1" fill="#fff" />
            <circle cx="75.2" cy="69.6" r="1.1" fill="#fff" />
          </motion.g>
        </motion.g>

        {/* Cheeks */}
        <circle cx="38" cy="82" r="4.5" fill="#f0532d" opacity="0.28" />
        <circle cx="82" cy="82" r="4.5" fill="#f0532d" opacity="0.28" />

        {/* Mouth */}
        {drooped ? (
          <path d="M51 90 Q60 84 69 90" stroke="#163323" strokeWidth="3" strokeLinecap="round" fill="none" />
        ) : state === "thinking" ? (
          <circle cx="60" cy="88" r="3" fill="#163323" />
        ) : (
          <motion.g key={state === "speaking" ? word : "still"} style={{ transformOrigin: "60px 87px" }} initial={state === "speaking" ? { scaleY: 1.9 } : false} animate={state === "speaking" && !still ? { scaleY: [1.9, 1, 1.5, 1] } : { scaleY: 1 }} transition={{ duration: 0.35 }}>
            <path d={state === "speaking" ? "M51 85 Q60 96 69 85 Q60 90 51 85 Z" : "M50 85 Q60 95 70 85"} stroke="#163323" strokeWidth="3" strokeLinecap="round" fill={state === "speaking" ? "#163323" : "none"} />
          </motion.g>
        )}
      </motion.svg>

      {/* Mic-active red dot */}
      {state === "listening" && (
        <span className="absolute top-[8%] right-[8%] flex size-3.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-70" />
          <span className="relative size-3.5 rounded-full border-2 border-background bg-red-500" />
        </span>
      )}

      {/* Thinking dots */}
      {state === "thinking" && (
        <span className="absolute -top-1 right-0 flex gap-1">
          {[0, 0.15, 0.3].map((d) => (
            <motion.span key={d} className="size-2 rounded-full bg-foreground/60" animate={still ? {} : { y: [0, -5, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: d }} />
          ))}
        </span>
      )}
    </div>
  );
}
