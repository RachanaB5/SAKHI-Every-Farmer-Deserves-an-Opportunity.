// Pilot geography: the three Bengaluru service areas FoodFlow launches in,
// plus nearby places customers commonly type that are NOT yet served (so
// checkout can block them with a friendly message), and distance helpers.

export interface AreaSeed {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
  isPilot: boolean;
  baseDeliveryFee: number;
}

/** Seeded service areas. Yelahanka is the pilot for special categories. */
export const SERVICE_AREAS: AreaSeed[] = [
  { name: "Yelahanka", lat: 13.1007, lng: 77.5963, radiusKm: 6, isPilot: true, baseDeliveryFee: 25 },
  { name: "Hebbal", lat: 13.0358, lng: 77.597, radiusKm: 5, isPilot: false, baseDeliveryFee: 30 },
  { name: "Jayanagar", lat: 12.925, lng: 77.5938, radiusKm: 5, isPilot: false, baseDeliveryFee: 35 },
];

/** Areas offered in the address picker that are outside the pilot. */
export const UNSERVED_AREAS = ["Whitefield", "Electronic City", "Marathahalli", "Kengeri"];

/** Villages around Bengaluru Rural used for farmer seeds and pickup points. */
export const VILLAGES: { name: string; lat: number; lng: number; nearestArea: string }[] = [
  { name: "Doddaballapur", lat: 13.2957, lng: 77.5373, nearestArea: "Yelahanka" },
  { name: "Devanahalli", lat: 13.2437, lng: 77.712, nearestArea: "Yelahanka" },
  { name: "Rajanukunte", lat: 13.1726, lng: 77.5578, nearestArea: "Yelahanka" },
  { name: "Hoskote", lat: 13.0707, lng: 77.7982, nearestArea: "Hebbal" },
  { name: "Nelamangala", lat: 13.0977, lng: 77.3936, nearestArea: "Hebbal" },
  { name: "Chikkajala", lat: 13.1667, lng: 77.6333, nearestArea: "Hebbal" },
  { name: "Kanakapura", lat: 12.5462, lng: 77.42, nearestArea: "Jayanagar" },
  { name: "Anekal", lat: 12.7105, lng: 77.6953, nearestArea: "Jayanagar" },
];

/** Mandis used for reference prices (APMC-style). */
export const MANDIS = ["Yeshwanthpur APMC", "K.R. Market", "Binny Mill"];

/** Reference mandi for each service area (price advisor looks here first). */
export const MANDI_FOR_AREA: Record<string, string> = {
  Yelahanka: "Yeshwanthpur APMC",
  Hebbal: "Binny Mill",
  Jayanagar: "K.R. Market",
};

/**
 * Great-circle distance between two coordinates.
 * @returns distance in kilometres
 */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Coordinates for a known area or village name (case-insensitive). */
export function coordsFor(name: string | null | undefined): { lat: number; lng: number } | null {
  if (!name) return null;
  const n = name.toLowerCase();
  const hit =
    SERVICE_AREAS.find((a) => a.name.toLowerCase() === n) ??
    VILLAGES.find((v) => v.name.toLowerCase() === n);
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}
