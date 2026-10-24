// Shared loading / empty / error states so every data view handles all
// three consistently.
"use client";

import { AlertTriangle, RotateCw, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shimmering placeholder block. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden className={cn("shimmer rounded-2xl", className)} />;
}

/**
 * Grid of skeleton cards while lists load.
 * @param count - number of placeholders
 */
export function SkeletonCards({ count = 6, className }: { count?: number; className?: string }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t("common.loadingShort")} className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-3xl border bg-card p-4">
          <SkeletonBlock className="aspect-[4/3] w-full" />
          <SkeletonBlock className="mt-4 h-4 w-2/3" />
          <SkeletonBlock className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Stack of skeleton rows for list views. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t("common.loadingShort")} className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

/**
 * Friendly empty state.
 * @param icon - lucide icon
 * @param action - optional CTA
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn("flex flex-col items-center rounded-3xl border border-dashed px-6 py-12 text-center", className)}
    >
      <span className="grid size-14 place-items-center rounded-2xl bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </span>
      <p className="mt-4 font-medium">{title}</p>
      {body && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</div>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

/** Error card with retry. */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-center rounded-3xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="size-6 text-destructive" />
      <p className="mt-3 font-medium">{t("state.errorTitle")}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message ?? t("state.errorBody")}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RotateCw /> {t("common.retry")}
        </Button>
      )}
    </div>
  );
}
