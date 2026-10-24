// Smart basket: turns a parsed grocery list into concrete picks. For each
// item, matching listings are scored on price, delivery ETA, harvest
// recency and visual quality, plus a consolidation bonus for farms that
// can supply several items (fewer farms = fewer delivery fees). Pure
// scoring so it is deterministic and testable; no AI needed to rank.
import { CROPS, matchCrop } from "@/lib/crops";
import type { SerializedListing } from "@/lib/listings";

export interface WantedItem {
  name: string;
  qty: number;
  unit: string;
}

export interface BasketPick {
  item: WantedItem;
  crop: string | null;
  best: (SerializedListing & { score: number; reason: string; qty: number }) | null;
  alternatives: (SerializedListing & { score: number; reason: string; qty: number })[];
}

// Price matters most, but a slightly cheaper lot from 60 km away should
// lose to a nearby, fresher one — hence the strong ETA/freshness weights.
const W = { price: 0.3, eta: 0.27, fresh: 0.25, quality: 0.18 };
const CONSOLIDATION_BONUS = 0.12;

/** Converts the wanted quantity into the listing's unit where sensible. */
function qtyFor(item: WantedItem, listing: SerializedListing): number {
  let q = item.qty;
  if (item.unit === "piece" && listing.unit === "dozen") q = Math.max(1, Math.round(item.qty / 12));
  else if (item.unit === "piece" && listing.unit === "kg") q = Math.max(listing.minOrderQty, Math.round(item.qty * 0.2 * 2) / 2);
  q = Math.max(listing.minOrderQty, q);
  return Math.min(listing.availableQty, Math.round(q * 2) / 2);
}

function daysOld(iso: string) {
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Picks the best listing per item.
 * @param items - parsed grocery list
 * @param listings - all listings visible to the buyer
 */
export function buildBasket(items: WantedItem[], listings: SerializedListing[]): BasketPick[] {
  const resolved = items.map((item) => ({ item, crop: matchCrop(item.name) }));
  // How many requested crops each farmer can supply — drives the consolidation bonus.
  const farmerCoverage = new Map<string, number>();
  const wantedCrops = new Set<string>(resolved.map((r) => r.crop).filter((c): c is NonNullable<typeof c> => c !== null));
  for (const l of listings) {
    if (wantedCrops.has(l.crop)) farmerCoverage.set(l.farmer.id, (farmerCoverage.get(l.farmer.id) ?? 0) + 1);
  }

  return resolved.map(({ item, crop }) => {
    const candidates = crop ? listings.filter((l) => l.crop === crop && l.availableQty > 0) : [];
    if (!candidates.length) return { item, crop, best: null, alternatives: [] };
    const prices = candidates.map((c) => c.price);
    const etas = candidates.map((c) => c.etaHours ?? 6);
    const [pMin, pMax] = [Math.min(...prices), Math.max(...prices)];
    const [eMin, eMax] = [Math.min(...etas), Math.max(...etas)];
    const norm = (v: number, lo: number, hi: number) => (hi === lo ? 0 : (v - lo) / (hi - lo));
    const shelf = crop ? CROPS[crop].shelfLifeDays : 7;

    const scored = candidates.map((l) => {
      const price = 1 - norm(l.price, pMin, pMax);
      const eta = 1 - norm(l.etaHours ?? 6, eMin, eMax);
      const fresh = Math.max(0, 1 - daysOld(l.harvestDate) / Math.max(1, shelf));
      const quality = (l.quality.score ?? 70) / 100;
      const coverage = farmerCoverage.get(l.farmer.id) ?? 1;
      const score = W.price * price + W.eta * eta + W.fresh * fresh + W.quality * quality + CONSOLIDATION_BONUS * (coverage - 1);
      // The single strongest reason, phrased for a shopper.
      const reasons: [number, string][] = [
        [W.price * price, l.price === pMin ? "Lowest price" : "Good price"],
        [W.eta * eta, `Arrives in ~${l.etaHours ?? 6} h`],
        [W.fresh * fresh, daysOld(l.harvestDate) < 1 ? "Picked today" : "Freshest harvest"],
        [W.quality * quality, `Quality score ${l.quality.score ?? "-"}`],
        [coverage > 1 ? CONSOLIDATION_BONUS * (coverage - 1) + 0.1 : 0, `Same farm as ${coverage - 1} other item${coverage > 2 ? "s" : ""}, one delivery`],
      ];
      reasons.sort((a, b) => b[0] - a[0]);
      return { ...l, score: Math.min(100, Math.round(score * 100)), rank: score, reason: reasons[0][1], qty: qtyFor(item, l) };
    });
    scored.sort((a, b) => b.rank - a.rank);
    return { item, crop, best: scored[0], alternatives: scored.slice(1, 4) };
  });
}
