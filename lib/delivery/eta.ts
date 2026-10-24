// Rough travel time to the farm, used when Sakhi tells a farmer when
// the rider (or a self-pickup buyer) will arrive. Straight-line distance
// is stretched to road distance and driven at two-wheeler speed, then
// rounded up to 5 minutes so it is said as "about 25 minutes".
import { haversineKm } from "@/lib/areas";

/** Roads are longer than the straight line between two points. */
const ROAD_FACTOR = 1.3;
/** Average two-wheeler speed between the villages and the city (Yelahanka ↔ Doddaballapur ≈ 1 hour). */
const KMPH = 30;
/** Getting going: parking, loading, finding the gate. */
const SETUP_MIN = 5;

/**
 * Minutes to cover `km` of straight-line distance.
 * @returns a multiple of 5, between 5 and 180
 */
export function travelMinutes(km: number): number {
  const raw = ((Math.max(0, km) * ROAD_FACTOR) / KMPH) * 60 + SETUP_MIN;
  return Math.min(180, Math.max(5, Math.ceil(raw / 5) * 5));
}

/** Minutes from `from` to `to`, or null when either place is unknown. */
export function minutesBetween(from: { lat: number; lng: number } | null, to: { lat: number; lng: number } | null): number | null {
  return from && to ? travelMinutes(haversineKm(from, to)) : null;
}
