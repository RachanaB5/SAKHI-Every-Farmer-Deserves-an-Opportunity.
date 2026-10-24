// StatusBadge with the label in the farmer's chosen language. The shared
// StatusBadge stays hook-free so server components can keep using it.
"use client";

import { StatusBadge, statusLabel } from "@/components/common/status-badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { en, type MessageKey } from "@/lib/i18n/en";

/** Status label in the current language (shared English label when untranslated). */
export function statusText(t: (key: MessageKey) => string, status: string): string {
  const key = `status.${status}`;
  return key in en ? t(key as MessageKey) : statusLabel(status);
}

/** Translated status pill; falls back to the shared English label. */
export function FarmerStatusBadge({ status, label, pulse, className }: { status: string; label?: string; pulse?: boolean; className?: string }) {
  const { t } = useI18n();
  const translated = label ?? statusText(t, status);
  return <StatusBadge status={status} label={translated} pulse={pulse} className={className} />;
}
