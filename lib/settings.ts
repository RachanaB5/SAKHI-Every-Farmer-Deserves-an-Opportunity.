// Platform controls stored in PlatformSetting (editable by admins):
// commission %, surplus thresholds, and service-area lookups.
import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_COMMISSION_PCT } from "@/lib/fees";

/** Every admin-editable numeric setting, with its allowed range and default. */
export const SETTING_DEFS = {
  commissionPct: {
    label: "Commission",
    unit: "%",
    min: 0,
    max: 20,
    step: 0.5,
    fallback: DEFAULT_COMMISSION_PCT,
    help: "Withheld from the farmer's payout on every order. Applies to new orders only.",
  },
  surplusSellThroughPct: {
    label: "Slow-selling below",
    unit: "% sold",
    min: 5,
    max: 90,
    step: 5,
    fallback: 30,
    help: "A listing is flagged as surplus when less than this share has sold…",
  },
  surplusMinAgeHours: {
    label: "…after being listed for",
    unit: "hours",
    min: 1,
    max: 168,
    step: 1,
    fallback: 24,
    help: "Gives new listings time to sell before they're flagged.",
  },
  surplusShelfLifePct: {
    label: "Ageing after",
    unit: "% of shelf life",
    min: 30,
    max: 95,
    step: 5,
    fallback: 70,
    help: "Also flagged once the harvest has used this much of the crop's shelf life.",
  },
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;
export const SETTING_KEYS = Object.keys(SETTING_DEFS) as [SettingKey, ...SettingKey[]];

/** Reads a numeric setting with a fallback. */
export async function numberSetting(key: string, fallback: number): Promise<number> {
  const row = await db.platformSetting.findUnique({ where: { key } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Reads a registered setting (falls back to its default). */
export function setting(key: SettingKey): Promise<number> {
  return numberSetting(key, SETTING_DEFS[key].fallback);
}

/** All registered settings with their current values. */
export async function allSettings(): Promise<Record<SettingKey, number>> {
  const rows = await db.platformSetting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const byKey = new Map(rows.map((r) => [r.key, Number(r.value)]));
  return Object.fromEntries(
    SETTING_KEYS.map((k) => {
      const v = byKey.get(k);
      return [k, v !== undefined && Number.isFinite(v) ? v : SETTING_DEFS[k].fallback];
    }),
  ) as Record<SettingKey, number>;
}

/** Commission withheld from farmers, in percent (default 5). */
export function commissionPct(): Promise<number> {
  return setting("commissionPct");
}

/**
 * Active service area by name (case-insensitive), or null when FoodFlow
 * doesn't deliver there yet.
 */
export async function serviceArea(name: string | null | undefined) {
  if (!name) return null;
  const areas = await db.serviceArea.findMany({ where: { active: true } });
  return areas.find((a) => a.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
}
