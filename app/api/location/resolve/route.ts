// POST /api/location/resolve { lat, lng } — turns the browser's GPS fix into
// something readable: the nearest FoodFlow service area, whether it is inside
// one, and a human label from OpenStreetMap's Nominatim (best effort, 3 s
// timeout, cached) so the top bar can say "Yelahanka New Town" not coordinates.
import { z } from "zod";
import { handler } from "@/lib/api";
import { nearestArea } from "@/lib/addresses";
import { rateLimit } from "@/lib/rate-limit";

const body = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

const cache = new Map<string, string | null>();

/** Place name for a coordinate, or null when the lookup isn't available. */
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key)!;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${lat}&lon=${lng}`, {
      headers: { "User-Agent": "FoodFlow/1.0 (farm-to-table marketplace)", "Accept-Language": "en" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { address?: Record<string, string> };
    const a = j.address ?? {};
    const parts = [a.road ?? a.neighbourhood, a.suburb ?? a.village ?? a.town, a.city ?? a.state_district].filter(Boolean);
    const label = parts.length ? [...new Set(parts)].join(", ") : null;
    cache.set(key, label);
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return label;
  } catch {
    return null;
  }
}

/** Returns { area, label, inService, distanceKm }. */
export const POST = handler({ roles: [], body }, async ({ user, body }) => {
  rateLimit(`geo:${user.id}`, 20, 60_000);
  const near = nearestArea(body.lat, body.lng);
  const place = await reverseGeocode(body.lat, body.lng);
  return {
    area: near.inService ? near.area.name : null,
    nearestArea: near.area.name,
    distanceKm: near.distanceKm,
    inService: near.inService,
    label: place ?? `Near ${near.area.name}`,
  };
});
