// Marketplace listing queries shared by the consumer shop, bulk browse,
// AI smart basket and farmer views. Applies visibility rules in one place:
//   • only ACTIVE listings with stock, from admin-APPROVED batches
//   • special categories (milk/eggs/chicken) only where enabled for the buyer's area
import "server-only";
import type { Prisma } from "@prisma/client";
import { coordsFor, haversineKm } from "@/lib/areas";
import { CATEGORIES } from "@/lib/crops";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";
import { IN_FLIGHT } from "@/lib/orders/state";
import { caseVariants } from "@/lib/search";
import { round2 } from "@/lib/fees";

/** Categories a buyer in `area` may see (special ones need an explicit enable). */
export async function visibleCategories(area: string | null | undefined): Promise<string[]> {
  const cats = await db.category.findMany();
  // Catalogue categories added after a database was seeded (e.g. fruits) have
  // no row yet; ordinary ones are visible everywhere.
  const missing = CATEGORIES.filter((c) => !c.special && !cats.some((row) => row.slug === c.slug)).map((c) => c.slug);
  return [
    ...cats.filter((c) => !c.special || ((c.enabledAreas as string[] | null) ?? []).includes(area ?? "")).map((c) => c.slug),
    ...missing,
  ];
}

export const listingInclude = {
  farmer: {
    select: {
      id: true,
      name: true,
      lat: true,
      lng: true,
      reliabilityScore: true,
      farmerProfile: { select: { farmName: true, village: true } },
    },
  },
  batch: {
    select: {
      aiQualityScore: true,
      aiFlags: true,
      aiSummary: true,
      aiSource: true,
      reviewedAt: true,
      grade: true,
      media: { where: { type: "IMAGE" as const, isDuplicate: false }, select: { url: true, isFrame: true }, take: 6 },
    },
  },
} satisfies Prisma.ListingInclude;

type ListingRow = Prisma.ListingGetPayload<{ include: typeof listingInclude }>;

/** Rough door-to-door estimate: 2h to pack + ~20 km/h in Bengaluru traffic. */
export function etaHours(distanceKm: number): number {
  return Math.max(2, Math.round(2 + distanceKm / 20));
}

/**
 * Client shape for a listing card/detail.
 * @param buyer - buyer coordinates for distance/ETA (optional)
 */
export function serializeListing(l: ListingRow, buyer?: { lat: number; lng: number } | null) {
  const farmerAt = l.farmer.lat && l.farmer.lng ? { lat: l.farmer.lat, lng: l.farmer.lng } : coordsFor(l.area);
  const distanceKm = buyer && farmerAt ? round2(haversineKm(buyer, farmerAt)) : null;
  const sold = round2(l.totalQty - l.availableQty - l.reservedQty);
  return {
    id: l.id,
    title: l.title,
    crop: l.crop,
    category: l.category,
    unit: l.unit,
    price: l.pricePerUnit,
    suggestedPrice: l.suggestedPrice,
    availableQty: l.availableQty,
    totalQty: l.totalQty,
    soldQty: sold,
    minOrderQty: l.minOrderQty,
    status: l.status,
    area: l.area,
    grade: l.grade,
    harvestDate: l.harvestDate.toISOString(),
    imageUrl: l.imageUrl,
    createdAt: l.createdAt.toISOString(),
    distanceKm,
    etaHours: distanceKm !== null ? etaHours(distanceKm) : null,
    farmer: {
      id: l.farmer.id,
      name: l.farmer.name,
      farmName: l.farmer.farmerProfile?.farmName ?? null,
      village: l.farmer.farmerProfile?.village ?? null,
      reliability: l.farmer.reliabilityScore,
    },
    quality: {
      /** Live score: the photo score blended with customer reviews (lib/quality). */
      score: l.qualityScore !== null ? Math.round(l.qualityScore) : l.batch.aiQualityScore,
      grade: l.grade ?? l.batch.grade,
      /** What the photo check said at approval. */
      photoScore: l.batch.aiQualityScore,
      photoGrade: l.batch.grade,
      reviews: l.reviewCount,
      complaints: l.complaintCount,
      flags: (l.batch.aiFlags as string[] | null) ?? [],
      summary: l.batch.aiSummary,
      source: l.batch.aiSource,
      verifiedAt: l.batch.reviewedAt?.toISOString() ?? null,
    },
    gallery: l.batch.media.map((m) => m.url),
  };
}

export type SerializedListing = ReturnType<typeof serializeListing>;

export interface BrowseFilters {
  q?: string;
  crop?: string;
  category?: string;
  maxPrice?: number;
  /** Only listings harvested within this many days. */
  freshDays?: number;
  gradeA?: boolean;
  sort?: "nearest" | "price" | "fresh" | "quality";
  farmerId?: string;
  limit?: number;
}

/**
 * Browse query for a buyer.
 * @param buyer - the signed-in buyer (area decides special-category visibility)
 */
export async function browseListings(buyer: { area: string | null; lat: number | null; lng: number | null }, f: BrowseFilters) {
  const cats = await visibleCategories(buyer.area);
  const where: Prisma.ListingWhereInput = {
    status: "ACTIVE",
    availableQty: { gt: 0 },
    category: f.category ? { in: cats.filter((c) => c === f.category) } : { in: cats },
    ...(f.crop && { crop: f.crop }),
    ...(f.farmerId && { farmerId: f.farmerId }),
    ...(f.maxPrice && { pricePerUnit: { lte: f.maxPrice } }),
    ...(f.gradeA && { grade: "A" }),
    ...(f.freshDays && { harvestDate: { gte: new Date(Date.now() - f.freshDays * 86_400_000) } }),
    ...(f.q && {
      OR: [
        { crop: { contains: f.q.toLowerCase() } },
        ...caseVariants(f.q).flatMap((v) => [{ title: { contains: v } }, { farmer: { name: { contains: v } } }, { farmer: { farmerProfile: { village: { contains: v } } } }]),
      ],
    }),
  };
  const rows = await db.listing.findMany({ where, include: listingInclude, take: f.limit ?? 120 });
  const at = buyer.lat && buyer.lng ? { lat: buyer.lat, lng: buyer.lng } : coordsFor(buyer.area);
  const items = rows.map((r) => serializeListing(r, at));
  const sorters: Record<NonNullable<BrowseFilters["sort"]>, (a: (typeof items)[number], b: (typeof items)[number]) => number> = {
    nearest: (a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999),
    price: (a, b) => a.price - b.price,
    fresh: (a, b) => b.harvestDate.localeCompare(a.harvestDate),
    quality: (a, b) => (b.quality.score ?? 0) - (a.quality.score ?? 0),
  };
  return items.sort(sorters[f.sort ?? "nearest"]);
}

/**
 * Farmer edits their own listing's price and/or availability. Pausing hides
 * it from buyers but keeps stock reserved for confirmed orders; resuming
 * needs stock left. Audit-logged.
 */
export async function updateOwnListing(farmerId: string, listingId: string, change: { price?: number; status?: "ACTIVE" | "PAUSED" }) {
  const l = await db.listing.findUnique({ where: { id: listingId } });
  if (!l) throw new HttpError(404, "Listing not found");
  if (l.farmerId !== farmerId) throw new HttpError(403, "This listing belongs to another farmer");
  if (l.status === "REMOVED") throw new HttpError(409, "You removed this listing, list a new harvest to sell again");
  if (l.status === "SOLD_OUT" && change.status === "ACTIVE") throw new HttpError(409, "Sold out, list a new harvest to sell more");
  if (change.status === "ACTIVE" && l.availableQty <= 0) throw new HttpError(409, "No stock left to resume");
  const updated = await db.listing.update({
    where: { id: l.id },
    data: { ...(change.price !== undefined && { pricePerUnit: change.price }), ...(change.status && { status: change.status }) },
  });
  await audit({ actorId: farmerId, action: "LISTING_UPDATED", entity: "Listing", entityId: l.id, meta: { from: { price: l.pricePerUnit, status: l.status }, to: change } });
  publish({ type: "inventory.updated", id: l.id });
  return { before: l, after: updated };
}

/**
 * Farmer takes their own listing down for good. The row stays as REMOVED
 * (orders and reviews point at it) but buyers and the farmer's own lists
 * stop showing it. Refused while an order on it is still in progress;
 * open bulk offers made from it are withdrawn. Audit-logged.
 */
export async function removeOwnListing(farmerId: string, listingId: string) {
  const l = await db.listing.findUnique({ where: { id: listingId } });
  if (!l) throw new HttpError(404, "Listing not found");
  if (l.farmerId !== farmerId) throw new HttpError(403, "This listing belongs to another farmer");
  if (l.status === "REMOVED") return { id: l.id, status: l.status };
  const open = await db.orderItem.count({ where: { listingId: l.id, order: { status: { in: IN_FLIGHT } } } });
  if (open > 0 || l.reservedQty > 0) {
    throw new HttpError(409, "This product has orders in progress. Finish or cancel them first, or pause it to stop new orders.");
  }
  const offers = await db.offer.findMany({ where: { listingId: l.id, status: { in: ["PENDING", "COUNTERED"] } }, include: { demand: { select: { buyerId: true } } } });
  await db.$transaction([
    db.listing.update({ where: { id: l.id }, data: { status: "REMOVED" } }),
    db.offer.updateMany({ where: { id: { in: offers.map((o) => o.id) } }, data: { status: "WITHDRAWN" } }),
  ]);
  await audit({ actorId: farmerId, action: "LISTING_REMOVED", entity: "Listing", entityId: l.id, meta: { from: l.status, available: l.availableQty, offersWithdrawn: offers.length } });
  publish({ type: "inventory.updated", id: l.id, userIds: [farmerId], roles: ["CONSUMER", "BULK_BUYER"] });
  publish({ type: "batch.updated", id: l.batchId, userIds: [farmerId] });
  for (const o of offers) publish({ type: "offer.updated", id: o.id, userIds: [o.demand.buyerId, farmerId], roles: ["ADMIN"], data: { demandId: o.demandId } });
  return { id: l.id, status: "REMOVED" as const };
}
