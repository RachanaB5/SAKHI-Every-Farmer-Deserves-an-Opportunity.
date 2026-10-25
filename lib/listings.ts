// Marketplace listing queries shared by the consumer shop, bulk browse,
// AI smart basket and farmer views. Applies visibility rules in one place:
//   • only ACTIVE listings with stock, from admin-APPROVED batches
//   • special categories (milk/eggs/chicken) only where enabled for the buyer's area
import "server-only";
import type { Prisma } from "@prisma/client";
import { coordsFor, haversineKm } from "@/lib/areas";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";
import { caseVariants } from "@/lib/search";
import { round2 } from "@/lib/fees";

/** Categories a buyer in `area` may see (special ones need an explicit enable). */
export async function visibleCategories(area: string | null | undefined): Promise<string[]> {
  const cats = await db.category.findMany();
  return cats
    .filter((c) => !c.special || ((c.enabledAreas as string[] | null) ?? []).includes(area ?? ""))
    .map((c) => c.slug);
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
      score: l.batch.aiQualityScore,
      grade: l.batch.grade,
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
