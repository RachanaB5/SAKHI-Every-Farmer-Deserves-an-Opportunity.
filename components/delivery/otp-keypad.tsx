// Six-box OTP entry with a big phone-style keypad and "speak digits".
// Shakes on a wrong code. Shared by the rider app and farmer pickup check.
"use client";

import { Delete, Loader2, Mic } from "lucide-react";
import { motion, useAnimationControls } from "framer-motion";
import { useEffect } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { useSpeech } from "@/hooks/use-speech";
import { normaliseNumbers } from "@/lib/ai/fallback/numbers";
import { LANGS } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * @param value - digits entered so far
 * @param onSubmit - fired with 6 digits
 * @param shakeKey - change it to trigger the error shake
 */
export function OtpKeypad({
  value,
  onChange,
  onSubmit,
  busy,
  shakeKey,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (otp: string) => void;
  busy?: boolean;
  shakeKey?: number;
  error?: string | null;
}) {
  const { t, lang } = useI18n();
  const controls = useAnimationControls();
  useEffect(() => {
    if (shakeKey) controls.start({ x: [0, -12, 12, -8, 8, -4, 0], transition: { duration: 0.45 } });
  }, [shakeKey, controls]);

  // Spoken digits: "four two seven…" / "चार दो सात…" → 427…
  const speech = useSpeech((said) => {
    const digits = normaliseNumbers(said).replace(/\D/g, "").slice(0, 6);
    onChange(digits);
    if (digits.length === 6) onSubmit(digits);
  });

  const press = (d: string) => {
    if (busy || value.length >= 6) return;
    const next = value + d;
    onChange(next);
    if (next.length === 6) onSubmit(next);
  };

  return (
    <div>
      <motion.div animate={controls} className="flex justify-center gap-2" aria-live="polite" aria-label={t("otp.entered", { n: value.length })}>
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "tabular grid h-14 w-11 place-items-center rounded-xl border-2 font-mono text-2xl font-semibold transition-colors",
              i < value.length ? "border-foreground bg-foreground text-background" : i === value.length ? "border-lime" : "border-border",
              error && "border-destructive",
            )}
          >
            {value[i] ?? ""}
          </span>
        ))}
      </motion.div>
      <p className={cn("mt-2 min-h-5 text-center text-sm", error ? "text-destructive" : "text-muted-foreground")}>{busy ? t("otp.checking") : error ?? t("otp.ask")}</p>
      <div className="mx-auto mt-3 grid max-w-xs grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} onClick={() => press(d)} disabled={busy}>
            {d}
          </Key>
        ))}
        <Key onClick={() => (speech.listening ? speech.stop() : speech.start(LANGS.find((l) => l.code === lang)?.speech ?? "en-IN"))} disabled={busy || !speech.supported} label={t("otp.speak")} active={speech.listening}>
          <Mic className="size-5" />
        </Key>
        <Key onClick={() => press("0")} disabled={busy}>
          0
        </Key>
        <Key onClick={() => onChange(value.slice(0, -1))} disabled={busy || !value} label={t("otp.delete")}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Delete className="size-5" />}
        </Key>
      </div>
    </div>
  );
}

function Key({ children, onClick, disabled, label, active }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label?: string; active?: boolean }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn("tabular grid h-14 place-items-center rounded-2xl bg-muted text-xl font-semibold transition-colors hover:bg-muted/70 disabled:opacity-40", active && "bg-lime text-lime-foreground")}
    >
      {children}
    </motion.button>
  );
}
