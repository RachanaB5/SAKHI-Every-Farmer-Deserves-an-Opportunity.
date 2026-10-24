// Big tap-to-talk microphone button with breathing rings while listening.
// Shared by voice listing, grocery dictation, bulk demands and OTP entry.
"use client";

import { Mic, Square } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * @param listening - currently recording
 * @param size - diameter in px
 */
export function MicOrb({
  listening,
  onClick,
  disabled,
  size = 96,
  label,
  className,
}: {
  listening: boolean;
  onClick: () => void;
  disabled?: boolean;
  size?: number;
  label: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("relative grid place-items-center", className)} style={{ width: size * 1.9, height: size * 1.9 }}>
      {listening &&
        !reduce &&
        [0, 0.5, 1].map((d) => (
          <span
            key={d}
            className="absolute rounded-full border-2 border-lime/70 animate-pulse-ring"
            style={{ width: size, height: size, animationDelay: `${d}s` }}
          />
        ))}
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={listening}
        whileTap={{ scale: 0.92 }}
        animate={listening && !reduce ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={listening ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : { type: "spring" }}
        className={cn(
          "relative grid place-items-center rounded-full shadow-2xl transition-colors disabled:opacity-50",
          listening ? "bg-lime text-lime-foreground shadow-[0_0_60px_-5px_var(--lime)]" : "bg-foreground text-background",
        )}
        style={{ width: size, height: size }}
      >
        {listening ? <Square className="size-7 fill-current" /> : <Mic className="size-9" />}
      </motion.button>
    </div>
  );
}
