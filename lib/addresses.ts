// Saved addresses and live-location helpers. One address is "active": its
// values are copied onto the User (area / address / lat / lng), which is what
// the shop, delivery fees and farm matching read.
import "server-only";
import type { Address } from "@prisma/client";
import { db } from "@/lib/db";
import { haversineKm, SERVICE_AREAS, type AreaSeed } from "@/lib/areas";

/** Nearest FoodFlow service area to a point, and whether the point is inside (or just beside) one. */
export function nearestArea(lat: number, lng: number): { area: AreaSeed; distanceKm: number; inService: boolean } {
  let best = SERVICE_AREAS[0];
  let bestKm = Infinity;
  for (const a of SERVICE_AREAS) {
    const d = haversineKm({ lat, lng }, a);
    if (d < bestKm) {
      best = a;
      bestKm = d;
    }
  }
  return { area: best, distanceKm: Math.round(bestKm * 10) / 10, inService: bestKm <= best.radiusKm * 1.4 };
}

/** Makes `address` the user's active location. Outside the service area only the text and coordinates change. */
export async function activateAddress(userId: string, address: Address) {
  return db.user.update({
    where: { id: userId },
    data: {
      address: address.line,
      lat: address.lat ?? undefined,
      lng: address.lng ?? undefined,
      ...(address.area ? { area: address.area } : {}),
    },
  });
}

export const MAX_ADDRESSES = 10;
