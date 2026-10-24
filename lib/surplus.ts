// Surplus rescue: spot listings that are selling too slowly for their
// shelf life and suggest where the produce could go instead — open bulk
// demands (community kitchens first), a price drop, or the nearest mandi.
// Suggestions never move stock on their own; the farmer chooses and acts.
import "server-only";
import { MANDI_FOR_AREA, MANDIS, coordsFor, haversineKm } from "@/lib/areas";
import { CROPS, isCropSlug } from "@/lib/crops";
import { db } from "@/lib/db";
import { round2 } from "@/lib/fees";
import { soldQty } from "@/lib/inventory";
import { setting } from "@/lib/settings";

const HOUR = 3_600_000;

export type SurplusSuggestion =
  | {
      kind: "DEMAND";
      demandId: string;
      buyer: string;
      orgType: string | null;
      remainingKg: number;
      targetPrice: number;
      deadline: string;
      urgent: boolean;
      distanceKm: number | null;
      offerQty: number;
      offerPrice: number;
      label: string;
    }
  | { kind: "PRICE_DROP"; price: number; label: string }
  | { kind: "MANDI"; mandi: string; modalPrice: number; label: string };

export interface SurplusItem {
  listingId: string;
  title: string;
  crop: string;
  unit: string;
  imageUrl: string | null;
  price: number;
  available: number;
  total: number;
  sellThrough: number;
  hoursListed: number;
  harvestAgeDays: number;
  shelfLifeDays: number;
  atRisk: boolean;
  /** 0–1: how urgent (shelf life used × slow sales). */
  urgency: number;
  reasons: string[];
  /** Which reasons apply, so the farmer UI can word them in its own language. */
  reasonCodes: SurplusReason[];
  suggestions: SurplusSuggestion[];
}

export type SurplusReason = "slow" | "ageing" | "unsold";

/**
 * Evaluates a farmer's live listings.
 * At risk when sell-through is below the threshold after the minimum
 * listing age, or the harvest has used the configured share (default 70%)
 * of the crop's shelf life. Thresholds are admin controls (lib/settings.ts).
 * @param onlyListingId - evaluate a single listing (AI endpoint)
 */
export async function detectSurplus(farmerId: string, onlyListingId?: string): Promise<SurplusItem[]> {
  const [threshold, minAge, shelfPct, farmer] = await Promise.all([
    setting("surplusSellThroughPct"),
    setting("surplusMinAgeHours"),
    setting("surplusShelfLifePct"),
    db.user.findUnique({ where: { id: farmerId }, select: { lat: true, lng: true, area: true } }),
  ]);
  const listings = await db.listing.findMany({
    where: { farmerId, status: "ACTIVE", availableQty: { gt: 0 }, ...(onlyListingId && { id: onlyListingId }) },
  });
  if (!listings.length) return [];
  const crops = [...new Set(listings.map((l) => l.crop))];
  const [demands, prices] = await Promise.all([
    db.demandRequest.findMany({
      where: { status: "OPEN", deadline: { gt: new Date() }, crop: { in: crops } },
      include: { buyer: { select: { orgName: true, name: true, orgType: true, lat: true, lng: true, area: true } }, offers: { select: { farmerId: true, status: true, qtyKg: true } } },
    }),
    db.marketPrice.findMany({ where: { crop: { in: crops } }, orderBy: { date: "desc" }, take: crops.length * 3 }),
  ]);
  const me = farmer?.lat && farmer.lng ? { lat: farmer.lat, lng: farmer.lng } : coordsFor(farmer?.area);
  const mandi = (farmer?.area && MANDI_FOR_AREA[farmer.area]) || MANDIS[0];
  const now = Date.now();

  return listings
    .map((l) => {
      const shelf = isCropSlug(l.crop) ? CROPS[l.crop].shelfLifeDays : 7;
      const sold = soldQty(l);
      const sellThrough = l.totalQty ? Math.round((sold / l.totalQty) * 100) : 0;
      const hoursListed = Math.round((now - l.createdAt.getTime()) / HOUR);
      const harvestAgeDays = round2((now - l.harvestDate.getTime()) / (24 * HOUR));
      const slow = hoursListed >= minAge && sellThrough < threshold;
      const ageing = harvestAgeDays >= shelf * (shelfPct / 100);
      const atRisk = slow || ageing;
      const urgency = round2(Math.min(1, harvestAgeDays / shelf) * 0.6 + (1 - Math.min(1, sellThrough / Math.max(1, threshold))) * 0.4);

      const reasons: string[] = [];
      const reasonCodes: SurplusReason[] = [];
      if (slow) reasonCodes.push("slow");
      if (ageing) reasonCodes.push("ageing");
      if (atRisk) reasonCodes.push("unsold");
      if (slow) reasons.push(`Only ${sellThrough}% sold after ${hoursListed} h listed`);
      if (ageing) reasons.push(`Harvested ${harvestAgeDays < 1 ? "today" : `${Math.round(harvestAgeDays * 10) / 10} days ago`}, ${l.crop} keeps about ${shelf} day${shelf > 1 ? "s" : ""}`);
      if (atRisk) reasons.push(`${l.availableQty} ${l.unit} still unsold`);

      const modal = prices.find((p) => p.crop === l.crop && p.area === mandi)?.modalPrice ?? prices.find((p) => p.crop === l.crop)?.modalPrice ?? null;
      const suggestions: SurplusSuggestion[] = [];
      for (const d of demands.filter((x) => x.crop === l.crop)) {
        if (d.offers.some((o) => o.farmerId === farmerId && ["PENDING", "COUNTERED", "ACCEPTED"].includes(o.status))) continue;
        const accepted = d.offers.filter((o) => o.status === "ACCEPTED").reduce((s, o) => s + o.qtyKg, 0);
        const remaining = round2(d.qtyKg - accepted);
        if (remaining <= 0) continue;
        const there = d.buyer.lat && d.buyer.lng ? { lat: d.buyer.lat, lng: d.buyer.lng } : coordsFor(d.area);
        const distanceKm = me && there ? round2(haversineKm(me, there)) : null;
        // Surplus would otherwise be wasted, so meet the buyer's target — but never
        // below 70% of the mandi rate (farmer floor) or above the listing price.
        const floor = modal ? modal * 0.7 : 0;
        const offerPrice = Math.round(Math.min(l.pricePerUnit, Math.max(d.targetPrice, floor)));
        const offerQty = round2(Math.min(l.availableQty, remaining));
        const who = d.buyer.orgName ?? d.buyer.name;
        suggestions.push({
          kind: "DEMAND",
          demandId: d.id,
          buyer: who,
          orgType: d.buyer.orgType,
          remainingKg: remaining,
          targetPrice: d.targetPrice,
          deadline: d.deadline.toISOString(),
          urgent: d.urgent,
          distanceKm,
          offerQty,
          offerPrice,
          label: `${who} needs ${remaining} kg${d.urgent ? " urgently" : ""}, offer ${offerQty} kg at ₹${offerPrice}/kg`,
        });
      }
      // Community kitchens first, then urgent, then nearest.
      suggestions.sort((a, b) => {
        if (a.kind !== "DEMAND" || b.kind !== "DEMAND") return 0;
        return Number(b.orgType === "COMMUNITY_KITCHEN") - Number(a.orgType === "COMMUNITY_KITCHEN") || Number(b.urgent) - Number(a.urgent) || (a.distanceKm ?? 99) - (b.distanceKm ?? 99);
      });
      if (atRisk) {
        const drop = Math.round(Math.max((modal ?? l.pricePerUnit) * 1.0, l.pricePerUnit * 0.85));
        if (drop < l.pricePerUnit) suggestions.push({ kind: "PRICE_DROP", price: drop, label: `Drop to ₹${drop}/${l.unit} for a quick sale (indicative)` });
        if (modal) suggestions.push({ kind: "MANDI", mandi, modalPrice: modal, label: `Sell the rest at ${mandi} (~₹${Math.round(modal)}/${l.unit} modal today)` });
      }

      return {
        listingId: l.id,
        title: l.title,
        crop: l.crop,
        unit: l.unit,
        imageUrl: l.imageUrl,
        price: l.pricePerUnit,
        available: l.availableQty,
        total: l.totalQty,
        sellThrough,
        hoursListed,
        harvestAgeDays,
        shelfLifeDays: shelf,
        atRisk,
        urgency,
        reasons,
        reasonCodes,
        suggestions,
      };
    })
    .sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || b.urgency - a.urgency);
}
