// Live countdown to a demand deadline ("in 46 h", "in 38 min", "passed").
"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

/** Human countdown that refreshes every 30 s; turns red under 6 hours. */
export function Countdown({ to, className }: { to: string; className?: string }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(to).getTime() - now;
  const h = ms / 3_600_000;
  const label =
    ms <= 0
      ? t("time.passed")
      : h < 1
        ? t("time.inMin", { n: Math.max(1, Math.round(ms / 60_000)) })
        : h < 48
          ? t("time.inH", { n: Math.round(h) })
          : t("time.inDays", { n: Math.round(h / 24) });
  return <span className={cn("tabular", h < 6 && "font-semibold text-tomato", className)}>{label}</span>;
}
