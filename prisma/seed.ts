// Seed script: a realistic, deterministic Bengaluru pilot so every dashboard
// and demo flow has data on first run. Re-runnable — it wipes tables first.
//
// Demo logins (PIN 1234 for everyone) are printed at the end and listed in
// README.md. Randomness is seeded so screenshots stay stable between resets.
import { PrismaClient, Prisma, type Fulfilment, type OrderStatus, type User } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CROPS, CATEGORIES, type CropSlug } from "../lib/crops";
import { SERVICE_AREAS, VILLAGES, MANDIS, haversineKm, coordsFor } from "../lib/areas";
import { hashPin } from "../lib/auth/password";
import { orderTotals, settlementFor, courierCost, DEFAULT_COMMISSION_PCT, round2 } from "../lib/fees";
import { nextRun } from "../lib/subscription-schedule";

const prisma = new PrismaClient();

// ─── Deterministic helpers ────────────────────────────────────────────────

/** mulberry32 PRNG — tiny, seedable, good enough for demo data. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261020);
const between = (a: number, b: number) => a + rand() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);
const daysAgo = (d: number) => hoursAgo(d * 24);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

let codeCounter = 0;
/** Deterministic, unique order codes for seed data (live codes are random). */
function seedCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let n = 7919 * ++codeCounter + 104729;
  let s = "";
  for (let i = 0; i < 5; i++) {
    s += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return `FF-${s}`;
}

// ─── Seed images ──────────────────────────────────────────────────────────

const SEED_DIR = path.join(process.cwd(), "public", "seed");

/** Lists /public/seed/<crop>-<n>.jpg variants for a crop. */
function imageVariants(crop: CropSlug): string[] {
  if (!fs.existsSync(SEED_DIR)) return [];
  return fs
    .readdirSync(SEED_DIR)
    .filter((f) => f.startsWith(`${crop}-`) && /\.(jpe?g|png|webp)$/.test(f))
    .sort()
    .map((f) => `/seed/${f}`);
}

const hashCache = new Map<string, string>();
/** Real SHA-256 of a seed image so duplicate detection works on seed data too. */
function sha256Of(url: string): string {
  const cached = hashCache.get(url);
  if (cached) return cached;
  const file = path.join(process.cwd(), "public", url);
  const h = fs.existsSync(file)
    ? createHash("sha256").update(fs.readFileSync(file)).digest("hex")
    : createHash("sha256").update(url).digest("hex");
  hashCache.set(url, h);
  return h;
}

/** Hands out a different image variant per batch until a crop runs out. */
const variantCursor = new Map<CropSlug, number>();
function nextImage(crop: CropSlug): string {
  const variants = imageVariants(crop);
  if (variants.length === 0) return CROPS[crop].image;
  const i = variantCursor.get(crop) ?? 0;
  variantCursor.set(crop, i + 1);
  return variants[i % variants.length];
}

// ─── People ───────────────────────────────────────────────────────────────

const FARMERS = [
  { name: "Ramesh Gowda", phone: "9000000101", village: "Doddaballapur", farm: "Gowda Natural Farm", crops: ["tomato", "spinach", "beans", "cabbage"], lang: "en", reliability: 0.95 },
  { name: "Lakshmamma", phone: "9000000102", village: "Devanahalli", farm: "Lakshmi Tota", crops: ["spinach", "carrot", "brinjal"], lang: "kn", reliability: 0.92 },
  { name: "Suresh Yadav", phone: "9000000103", village: "Hoskote", farm: "Yadav Krishi Kendra", crops: ["onion", "potato"], lang: "hi", reliability: 0.9 },
  { name: "Manjunath Reddy", phone: "9000000104", village: "Chikkajala", farm: "Reddy Farms", crops: ["tomato", "onion", "brinjal"], lang: "kn", reliability: 0.88 },
  { name: "Savitri Devi", phone: "9000000105", village: "Rajanukunte", farm: "Savitri Dairy & Poultry", crops: ["milk", "eggs", "chicken"], lang: "hi", reliability: 0.97 },
  { name: "Basavaraj Patil", phone: "9000000106", village: "Nelamangala", farm: "Patil Bagh", crops: ["potato", "cabbage", "carrot"], lang: "kn", reliability: 0.86 },
  { name: "Kavitha Naik", phone: "9000000107", village: "Kanakapura", farm: "Naik Greens", crops: ["spinach", "beans", "tomato"], lang: "kn", reliability: 0.91 },
  { name: "Ravi Kumar Sharma", phone: "9000000108", village: "Anekal", farm: "Sharma Kisan Farm", crops: ["onion", "brinjal", "carrot", "potato"], lang: "hi", reliability: 0.72 },
] as const;

const CONSUMERS = [
  { name: "Ananya Rao", phone: "9000000201", area: "Yelahanka", address: "14, 4th Cross, Yelahanka New Town" },
  { name: "Rahul Mehta", phone: "9000000202", area: "Hebbal", address: "Flat 302, Lakeview Apts, Hebbal Kempapura" },
  { name: "Priya Nair", phone: "9000000203", area: "Jayanagar", address: "221, 9th Block, Jayanagar" },
  { name: "Arjun Iyer", phone: "9000000204", area: "Yelahanka", address: "7, Attur Layout, Yelahanka" },
  { name: "Fatima Khan", phone: "9000000205", area: "Hebbal", address: "88, RT Nagar Main Rd, Hebbal" },
  { name: "Deepak Joshi", phone: "9000000206", area: "Jayanagar", address: "3rd Floor, 41 South End Rd, Jayanagar" },
] as const;

const BULK_BUYERS = [
  { name: "Vikram Shetty", org: "The Green Ladle", type: "RESTAURANT", phone: "9000000301", area: "Hebbal", address: "12, Bellary Rd, Hebbal" },
  { name: "Mohan Das", org: "Sahyadri Hostel Canteen", type: "HOSTEL", phone: "9000000302", area: "Jayanagar", address: "Sahyadri Hostel, 4th Block, Jayanagar" },
  { name: "Shanthi Prakash", org: "Annapurna Community Kitchen", type: "COMMUNITY_KITCHEN", phone: "9000000303", area: "Yelahanka", address: "Ward 3 Community Hall, Yelahanka" },
] as const;

const WORKERS = [
  { name: "Imran Pasha", phone: "9000000401", area: "Yelahanka" },
  { name: "Naveen Kumar", phone: "9000000402", area: "Jayanagar" },
] as const;

// ─── Main ─────────────────────────────────────────────────────────────────

async function wipe() {
  // Children before parents so foreign keys never block the reset.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.feedback.deleteMany(),
    prisma.deliveryAttempt.deleteMany(),
    prisma.delivery.deleteMany(),
    prisma.settlement.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.orderEvent.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.offer.deleteMany(),
    prisma.demandRequest.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.listing.deleteMany(),
    prisma.mediaAsset.deleteMany(),
    prisma.batch.deleteMany(),
    prisma.farmerProfile.deleteMany(),
    prisma.user.deleteMany(),
    prisma.marketPrice.deleteMany(),
    prisma.serviceArea.deleteMany(),
    prisma.category.deleteMany(),
    prisma.platformSetting.deleteMany(),
  ]);
}

async function main() {
  console.log("Seeding FoodFlow pilot data…");
  await wipe();
  const pinHash = await hashPin("1234");

  // Platform controls
  await prisma.platformSetting.createMany({
    data: [
      { key: "commissionPct", value: String(DEFAULT_COMMISSION_PCT) },
      { key: "surplusSellThroughPct", value: "30" },
      { key: "surplusMinAgeHours", value: "24" },
      { key: "surplusShelfLifePct", value: "70" },
    ],
  });
  await prisma.serviceArea.createMany({
    data: SERVICE_AREAS.map((a) => ({ ...a, active: true })),
  });
  // Special categories (milk/eggs/chicken) start enabled only in the pilot area.
  const pilot = SERVICE_AREAS.filter((a) => a.isPilot).map((a) => a.name);
  await prisma.category.createMany({
    data: CATEGORIES.map((c, i) => ({
      slug: c.slug,
      name: c.name,
      special: c.special,
      enabledAreas: c.special ? pilot : SERVICE_AREAS.map((a) => a.name),
      sortOrder: i,
    })),
  });

  // ── Users
  const admin = await prisma.user.create({
    data: { name: "Meera Krishnan", phone: "9000000001", pinHash, role: "ADMIN", area: "Hebbal" },
  });

  type SeedFarmer = Omit<(typeof FARMERS)[number], "village"> & { user: User; village: (typeof VILLAGES)[number] };
  const farmers: SeedFarmer[] = [];
  for (const f of FARMERS) {
    const v = VILLAGES.find((x) => x.name === f.village)!;
    const user = await prisma.user.create({
      data: {
        name: f.name,
        phone: f.phone,
        pinHash,
        role: "FARMER",
        language: f.lang,
        lat: v.lat,
        lng: v.lng,
        area: v.nearestArea,
        address: `${f.farm}, ${f.village}`,
        reliabilityScore: f.reliability,
        createdAt: daysAgo(int(60, 120)),
        farmerProfile: {
          create: { farmName: f.farm, village: f.village, crops: [...f.crops], upiId: `${f.phone}@upi` },
        },
      },
    });
    farmers.push({ ...f, user, village: v });
  }

  const consumers: User[] = [];
  for (const c of CONSUMERS) {
    const at = coordsFor(c.area)!;
    consumers.push(
      await prisma.user.create({
        data: {
          name: c.name,
          phone: c.phone,
          pinHash,
          role: "CONSUMER",
          area: c.area,
          address: c.address,
          lat: at.lat + between(-0.01, 0.01),
          lng: at.lng + between(-0.01, 0.01),
        },
      }),
    );
  }

  const bulkBuyers: User[] = [];
  for (const b of BULK_BUYERS) {
    const at = coordsFor(b.area)!;
    bulkBuyers.push(
      await prisma.user.create({
        data: {
          name: b.name,
          phone: b.phone,
          pinHash,
          role: "BULK_BUYER",
          orgName: b.org,
          orgType: b.type,
          area: b.area,
          address: b.address,
          lat: at.lat,
          lng: at.lng,
        },
      }),
    );
  }

  const workers: User[] = [];
  for (const w of WORKERS) {
    const at = coordsFor(w.area)!;
    workers.push(
      await prisma.user.create({
        data: { name: w.name, phone: w.phone, pinHash, role: "DELIVERY", area: w.area, lat: at.lat, lng: at.lng },
      }),
    );
  }

  // ── Market prices: 30 days × crop × mandi, with per-crop trend shapes.
  const trend: Partial<Record<CropSlug, number>> = { tomato: 0.28, onion: -0.12, spinach: 0.05, beans: 0.1, chicken: 0.04 };
  const mandiBias = [1, 1.04, 0.97];
  const priceRows: Prisma.MarketPriceCreateManyInput[] = [];
  const todayModal = new Map<CropSlug, number>();
  for (const slug of Object.keys(CROPS) as CropSlug[]) {
    const base = CROPS[slug].basePrice;
    const phase = rand() * 14;
    for (let d = 29; d >= 0; d--) {
      const progress = (29 - d) / 29;
      const wave = 0.08 * Math.sin((2 * Math.PI * (d + phase)) / 14);
      const drift = (trend[slug] ?? 0) * progress;
      MANDIS.forEach((mandi, mi) => {
        const modal = round2(base * (1 + wave + drift + between(-0.03, 0.03)) * mandiBias[mi]);
        if (d === 0 && mi === 0) todayModal.set(slug, modal);
        priceRows.push({
          crop: slug,
          area: mandi,
          modalPrice: modal,
          minPrice: round2(modal * between(0.8, 0.88)),
          maxPrice: round2(modal * between(1.12, 1.2)),
          date: startOfDay(daysAgo(d)),
        });
      });
    }
  }
  await prisma.marketPrice.createMany({ data: priceRows });

  // ── Batches + listings
  type ListingRef = { id: string; farmerIdx: number; crop: CropSlug; price: number; unit: string; title: string; available: number; reserved: number; total: number };

  async function createListing(opts: {
    farmerIdx: number;
    crop: CropSlug;
    available: number;
    soldQty?: number;
    harvestHoursAgo: number;
    createdHoursAgo?: number;
    priceFactor?: number;
    grade?: string;
    status?: "ACTIVE" | "PAUSED" | "SOLD_OUT";
    withMedia?: boolean;
    score?: number;
    flags?: string[];
  }): Promise<ListingRef> {
    const f = farmers[opts.farmerIdx];
    const info = CROPS[opts.crop];
    const area = f.village.nearestArea;
    const modal = todayModal.get(opts.crop) ?? info.basePrice;
    // Retail on FoodFlow sits ~15% above wholesale modal — still below street retail.
    const suggested = round2(modal * 1.15);
    const price = Math.round(suggested * (opts.priceFactor ?? between(0.94, 1.06)));
    const total = round2(opts.available + (opts.soldQty ?? 0));
    const image = opts.withMedia === false ? info.image : nextImage(opts.crop);
    const score = opts.score ?? int(80, 96);
    const createdAt = hoursAgo(opts.createdHoursAgo ?? opts.harvestHoursAgo - 2);
    const batch = await prisma.batch.create({
      data: {
        farmerId: f.user.id,
        crop: opts.crop,
        category: info.category,
        title: `${info.names.en}, ${f.farm}`,
        quantityKg: total,
        unit: info.unit,
        harvestDate: hoursAgo(opts.harvestHoursAgo),
        proposedPrice: price,
        grade: opts.grade ?? (score >= 88 ? "A" : "B"),
        status: "APPROVED",
        aiQualityScore: score,
        aiFlags: opts.flags ?? [],
        aiSummary: `Uniform colour and firm skin across visible ${info.names.en.toLowerCase()}; no rot or mould detected in sampled frames.`,
        aiSource: "fallback",
        reviewedById: admin.id,
        reviewedAt: createdAt,
        createdAt: hoursAgo((opts.createdHoursAgo ?? opts.harvestHoursAgo - 2) + 1),
        media:
          opts.withMedia === false
            ? undefined
            : {
                create: {
                  url: image,
                  type: "IMAGE",
                  mimeType: "image/jpeg",
                  sha256: sha256Of(image),
                  capturedAt: hoursAgo(opts.harvestHoursAgo),
                  provenanceNote: "Seed image (CC0)",
                },
              },
      },
    });
    const listing = await prisma.listing.create({
      data: {
        batchId: batch.id,
        farmerId: f.user.id,
        title: `${info.names.en}${opts.grade === "A" || score >= 88 ? " · Grade A" : ""}`,
        crop: opts.crop,
        category: info.category,
        unit: info.unit,
        pricePerUnit: price,
        suggestedPrice: suggested,
        totalQty: total,
        availableQty: opts.available,
        status: opts.status ?? (opts.available <= 0 ? "SOLD_OUT" : "ACTIVE"),
        area,
        grade: batch.grade,
        harvestDate: batch.harvestDate,
        imageUrl: image,
        minOrderQty: info.unit === "dozen" ? 1 : info.unit === "litre" ? 1 : 0.5,
        createdAt,
      },
    });
    await prisma.auditLog.create({
      data: { actorId: admin.id, action: "BATCH_APPROVED", entity: "Batch", entityId: batch.id, meta: { listingId: listing.id }, createdAt },
    });
    return { id: listing.id, farmerIdx: opts.farmerIdx, crop: opts.crop, price, unit: info.unit, title: listing.title, available: opts.available, reserved: 0, total };
  }

  // 25 active listings. Ramesh's spinach is deliberately slow-selling (surplus demo).
  const active: ListingRef[] = [];
  const plan: [number, CropSlug, number, number, number?][] = [
    // [farmerIdx, crop, available, harvestHoursAgo, priceFactor?]
    [0, "tomato", 96, 14],
    [0, "spinach", 52, 40, 1.02],
    [0, "beans", 34, 20],
    [0, "cabbage", 70, 30],
    [1, "spinach", 28, 10],
    [1, "carrot", 60, 26],
    [1, "brinjal", 45, 18],
    [2, "onion", 240, 70],
    [2, "potato", 300, 90],
    [3, "tomato", 110, 22],
    [3, "onion", 180, 60],
    [3, "brinjal", 38, 16],
    [4, "milk", 40, 6],
    [4, "eggs", 30, 20],
    [4, "chicken", 18, 5],
    [5, "potato", 220, 80],
    [5, "cabbage", 90, 28],
    [5, "carrot", 75, 34],
    [6, "spinach", 24, 8],
    [6, "beans", 30, 22],
    [6, "tomato", 85, 18],
    [7, "onion", 160, 75],
    [7, "brinjal", 40, 30],
    [7, "carrot", 55, 40, 2.2], // price outlier → trust & safety flag
    [7, "potato", 140, 96],
  ];
  for (const [fi, crop, available, harvestH, pf] of plan) {
    active.push(await createListing({ farmerIdx: fi, crop, available, harvestHoursAgo: harvestH, priceFactor: pf, createdHoursAgo: crop === "spinach" && fi === 0 ? 30 : undefined }));
  }

  // Historical sold-out listings (one per farmer×crop) that past orders draw from.
  const historical = new Map<string, ListingRef>();
  for (let fi = 0; fi < farmers.length; fi++) {
    for (const crop of farmers[fi].crops as readonly CropSlug[]) {
      historical.set(
        `${fi}:${crop}`,
        await createListing({ farmerIdx: fi, crop, available: 0, harvestHoursAgo: 24 * 32, createdHoursAgo: 24 * 31, withMedia: false, status: "SOLD_OUT" }),
      );
    }
  }

  // ── Orders
  const areaFee = new Map(SERVICE_AREAS.map((a) => [a.name, a.baseDeliveryFee]));
  const soldPerListing = new Map<string, number>();

  async function createOrder(opts: {
    buyer: { id: string; area: string | null; lat: number | null; lng: number | null; address: string | null };
    farmerIdx: number;
    items: { listing: ListingRef; qty: number }[];
    status: OrderStatus;
    fulfilment: Fulfilment;
    placedAt: Date;
    type?: "RETAIL" | "BULK";
    offerId?: string;
    workerIdx?: number;
    settled?: boolean;
  }) {
    const f = farmers[opts.farmerIdx];
    const area = opts.buyer.area ?? "Hebbal";
    const totals = orderTotals({
      items: opts.items.map((i) => ({ qty: i.qty, unitPrice: i.listing.price })),
      fulfilment: opts.fulfilment,
      baseFee: areaFee.get(area) ?? 30,
      commissionPct: DEFAULT_COMMISSION_PCT,
      type: opts.type ?? "RETAIL",
    });
    const t = opts.placedAt.getTime();
    const at = (h: number) => new Date(t + h * 3_600_000);
    const flow: OrderStatus[] =
      opts.status === "CANCELLED"
        ? ["PLACED", "CANCELLED"]
        : opts.fulfilment === "PICKUP"
          ? ["PLACED", "CONFIRMED", "PACKED", "READY_FOR_PICKUP", "COLLECTED"]
          : ["PLACED", "CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"];
    const stopAt = opts.status === "DISPUTED" ? flow.length - 1 : flow.indexOf(opts.status);
    const reached = flow.slice(0, stopAt + 1);
    const delivered = opts.status === "DELIVERED" || opts.status === "COLLECTED" || opts.status === "DISPUTED";
    const distance = opts.buyer.lat && opts.buyer.lng ? haversineKm(f.village, { lat: opts.buyer.lat, lng: opts.buyer.lng }) : 12;
    const runCost = opts.fulfilment === "PICKUP" ? 0 : courierCost(round2(distance));

    const order = await prisma.order.create({
      data: {
        code: seedCode(),
        buyerId: opts.buyer.id,
        farmerId: f.user.id,
        type: opts.type ?? "RETAIL",
        status: opts.status,
        fulfilment: opts.fulfilment,
        slot: pick(["7–9 AM", "9–11 AM", "5–7 PM", "7–9 PM"]),
        addressLine: opts.fulfilment === "DELIVERY" ? opts.buyer.address : null,
        area,
        lat: opts.buyer.lat,
        lng: opts.buyer.lng,
        ...totals,
        offerId: opts.offerId,
        cancelReason: opts.status === "CANCELLED" ? "Buyer cancelled before packing" : null,
        createdAt: opts.placedAt,
        items: {
          create: opts.items.map((i) => ({
            listingId: i.listing.id,
            farmerId: f.user.id,
            title: i.listing.title,
            unit: i.listing.unit,
            qty: i.qty,
            unitPrice: i.listing.price,
          })),
        },
        events: {
          create: [
            ...reached.map((s, idx) => ({ status: s, createdAt: at(idx * 2 + (idx > 2 ? 6 : 0)) })),
            ...(opts.status === "DISPUTED" ? [{ status: "DISPUTED" as OrderStatus, note: "Buyer reported quality issue", createdAt: at(20) }] : []),
          ],
        },
        payment: {
          create: {
            status: opts.status === "CANCELLED" ? "REFUNDED" : opts.status === "PLACED" ? "AUTHORISED" : "CAPTURED",
            amount: totals.total,
            ref: `SIM-${randomBytes(4).toString("hex").toUpperCase()}`,
            authorisedAt: opts.placedAt,
            capturedAt: opts.status === "PLACED" ? null : at(0.1),
            refundedAt: opts.status === "CANCELLED" ? at(1) : null,
          },
        },
      },
    });

    // Stock accounting: delivered → sold, in-flight → reserved, cancelled → nothing.
    for (const i of opts.items) {
      if (opts.status === "CANCELLED") continue;
      if (delivered) soldPerListing.set(i.listing.id, (soldPerListing.get(i.listing.id) ?? 0) + i.qty);
      else i.listing.reserved = round2(i.listing.reserved + i.qty);
    }

    const needsHandover = ["PACKED", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "DELIVERED", "COLLECTED", "DISPUTED"].includes(opts.status);
    if (needsHandover) {
      const worker = opts.fulfilment === "DELIVERY" && opts.workerIdx !== undefined ? workers[opts.workerIdx] : null;
      const deliveryStatus = delivered ? "DELIVERED" : opts.status === "OUT_FOR_DELIVERY" ? "PICKED_UP" : worker ? "ASSIGNED" : "UNASSIGNED";
      const delivery = await prisma.delivery.create({
        data: {
          orderId: order.id,
          mode: opts.fulfilment,
          workerId: worker?.id,
          status: deliveryStatus,
          distanceKm: round2(distance),
          cost: runCost,
          assignedAt: worker ? at(5) : null,
          pickedUpAt: opts.status === "OUT_FOR_DELIVERY" || delivered ? at(7) : null,
          verifiedAt: delivered ? at(9) : null,
          otpAttempts: delivered ? 1 : 0,
        },
      });
      if (delivered) {
        // A sprinkle of failed first attempts so the admin OTP log has content.
        if (rand() < 0.15) {
          await prisma.deliveryAttempt.create({
            data: { deliveryId: delivery.id, actorId: worker?.id ?? f.user.id, method: "OTP", success: false, reason: "Incorrect OTP", createdAt: at(8.9) },
          });
        }
        await prisma.deliveryAttempt.create({
          data: { deliveryId: delivery.id, actorId: worker?.id ?? f.user.id, method: opts.fulfilment === "PICKUP" ? pick(["OTP", "QR"]) : "OTP", success: true, createdAt: at(9) },
        });
        const s = settlementFor({ subtotal: totals.subtotal, platformFee: totals.platformFee, buyerDeliveryFee: totals.deliveryFee, actualCourierCost: runCost });
        await prisma.settlement.create({
          data: {
            farmerId: f.user.id,
            orderId: order.id,
            ...s,
            status: opts.settled ? "SETTLED" : "PENDING",
            settledAt: opts.settled ? at(36) : null,
            createdAt: at(9),
          },
        });
      }
    }
    return order;
  }

  const buyerShape = (u: { id: string; area: string | null; lat: number | null; lng: number | null; address: string | null }) => u;

  // 30 days of retail history from the sold-out listings.
  for (let d = 29; d >= 3; d--) {
    const ordersToday = int(1, 3);
    for (let k = 0; k < ordersToday; k++) {
      const buyer = pick(consumers);
      // Prefer farmers serving the buyer's area, as the shop does.
      const candidates = farmers.map((f, i) => ({ f, i })).filter(({ f }) => f.village.nearestArea === buyer.area || rand() < 0.25);
      const { i: fi } = pick(candidates.length ? candidates : farmers.map((f, i) => ({ f, i })));
      const crops = farmers[fi].crops as readonly CropSlug[];
      const chosen = [...new Set([pick(crops), pick(crops)])];
      const items = chosen.map((c) => {
        const l = historical.get(`${fi}:${c}`)!;
        const qty = l.unit === "kg" ? pick([1, 1.5, 2, 3, 5]) : l.unit === "litre" ? pick([1, 2]) : 1;
        return { listing: l, qty };
      });
      const r = rand();
      const status: OrderStatus = r < 0.06 ? "CANCELLED" : r < 0.09 ? "DISPUTED" : "DELIVERED";
      const pickup = rand() < 0.2;
      await createOrder({
        buyer: buyerShape(buyer),
        farmerIdx: fi,
        items,
        status: pickup && status === "DELIVERED" ? "COLLECTED" : status,
        fulfilment: pickup ? "PICKUP" : "DELIVERY",
        placedAt: hoursAgo(d * 24 + int(0, 10)),
        workerIdx: buyer.area === "Jayanagar" ? 1 : 0,
        settled: d > 4,
      });
    }
  }

  // Recent deliveries from active listings (realistic sell-through).
  const recentPlan: [number, number, number][] = [
    // [activeListingIdx, consumerIdx, qty]
    [0, 0, 3], [0, 3, 2], [0, 1, 5], // Ramesh tomato
    [1, 3, 5], [1, 0, 3], // Ramesh spinach (only 8 of 60 sold → surplus risk)
    [2, 0, 2], [3, 4, 2],
    [7, 1, 10], [8, 4, 8], [9, 1, 4], [12, 0, 4], [13, 3, 2], [15, 5, 6], [20, 2, 3], [21, 5, 5],
  ];
  for (const [li, ci, qty] of recentPlan) {
    const l = active[li];
    await createOrder({
      buyer: buyerShape(consumers[ci]),
      farmerIdx: l.farmerIdx,
      items: [{ listing: l, qty }],
      status: "DELIVERED",
      fulfilment: "DELIVERY",
      placedAt: hoursAgo(int(10, 40)),
      workerIdx: consumers[ci].area === "Jayanagar" ? 1 : 0,
      settled: false,
    });
  }

  // In-flight orders for the live demo.
  await createOrder({ buyer: buyerShape(consumers[0]), farmerIdx: 0, items: [{ listing: active[0], qty: 2 }, { listing: active[2], qty: 1 }], status: "CONFIRMED", fulfilment: "DELIVERY", placedAt: hoursAgo(1.5) });
  await createOrder({ buyer: buyerShape(consumers[1]), farmerIdx: 0, items: [{ listing: active[3], qty: 1.5 }], status: "OUT_FOR_DELIVERY", fulfilment: "DELIVERY", placedAt: hoursAgo(5), workerIdx: 0 });
  await createOrder({ buyer: buyerShape(consumers[3]), farmerIdx: 4, items: [{ listing: active[12], qty: 2 }, { listing: active[13], qty: 1 }], status: "PACKED", fulfilment: "DELIVERY", placedAt: hoursAgo(3), workerIdx: 0 });
  await createOrder({ buyer: buyerShape(consumers[2]), farmerIdx: 6, items: [{ listing: active[20], qty: 2 }, { listing: active[19], qty: 1 }], status: "READY_FOR_PICKUP", fulfilment: "PICKUP", placedAt: hoursAgo(4) });

  // Bulk history: awarded demands with accepted offers → BULK orders.
  const bulkHistory: [number, number, CropSlug, number][] = [
    [0, 0, "tomato", 60], [0, 3, "onion", 80], [1, 2, "potato", 120], [1, 5, "cabbage", 50], [2, 1, "spinach", 25], [2, 6, "beans", 20],
  ];
  for (const [bi, fi, crop, qty] of bulkHistory) {
    const buyer = bulkBuyers[bi];
    const l = historical.get(`${fi}:${crop}`)!;
    const placed = daysAgo(int(6, 25));
    const demand = await prisma.demandRequest.create({
      data: { buyerId: buyer.id, crop, qtyKg: qty, grade: "A", targetPrice: Math.round(l.price * 0.92), deadline: new Date(placed.getTime() + 2 * 86_400_000), area: buyer.area!, status: "AWARDED", createdAt: new Date(placed.getTime() - 86_400_000) },
    });
    const offer = await prisma.offer.create({
      // Community-kitchen orders of perishables came through the surplus-rescue flow.
      data: { demandId: demand.id, farmerId: farmers[fi].user.id, qtyKg: qty, pricePerKg: Math.round(l.price * 0.95), etaHours: 24, status: "ACCEPTED", fromSurplus: bi === 2, aiScore: round2(between(78, 92)), aiRank: 1, aiReason: "Best delivered cost with full quantity coverage", createdAt: placed },
    });
    await createOrder({ buyer: buyerShape(buyer), farmerIdx: fi, items: [{ listing: { ...l, price: offer.pricePerKg }, qty }], status: "DELIVERED", fulfilment: "DELIVERY", placedAt: placed, type: "BULK", offerId: offer.id, workerIdx: buyer.area === "Jayanagar" ? 1 : 0, settled: true });
  }

  // Write back stock: total = available + reserved + sold.
  for (const l of [...active, ...historical.values()]) {
    const sold = round2(soldPerListing.get(l.id) ?? 0);
    const total = round2(l.available + l.reserved + sold);
    await prisma.listing.update({
      where: { id: l.id },
      data: { totalQty: total, reservedQty: l.reserved, status: l.available > 0 ? undefined : "SOLD_OUT" },
    });
    await prisma.batch.updateMany({ where: { listing: { id: l.id } }, data: { quantityKg: total } });
  }

  // ── Pending review queue (4 batches, one re-using another farmer's photo)
  const rameshTomatoImage = (await prisma.mediaAsset.findFirst({ where: { batch: { listing: { id: active[0].id } } } }))!;
  const pending: { fi: number; crop: CropSlug; qty: number; score: number; flags: string[]; summary: string; notes: string; dup?: boolean; transcript?: string; lang?: string }[] = [
    { fi: 0, crop: "tomato", qty: 120, score: 91, flags: [], summary: "Deep red, uniformly sized tomatoes with taut skin. No visible bruising or rot spots in sampled frames.", notes: "Harvested this morning, naati variety.", transcript: "आज 120 किलो टमाटर तोड़े, 28 रुपये किलो", lang: "hi-IN" },
    { fi: 3, crop: "onion", qty: 200, score: 84, flags: ["mixed_sizes"], summary: "Dry outer skins and firm bulbs; noticeable size variation between bulbs.", notes: "Bellary red, sun-dried for 3 days." },
    { fi: 6, crop: "beans", qty: 40, score: 72, flags: ["mixed_sizes", "minor_blemishes"], summary: "Mostly bright green pods; a few pods show surface blemishes and uneven length.", notes: "Second picking." },
    { fi: 7, crop: "tomato", qty: 80, score: 89, flags: [], summary: "Red, glossy tomatoes; image matches another farmer's earlier upload (see duplicate flag).", notes: "Fresh harvest.", dup: true },
  ];
  for (const p of pending) {
    const f = farmers[p.fi];
    const info = CROPS[p.crop];
    const image = p.dup ? rameshTomatoImage.url : nextImage(p.crop);
    const created = hoursAgo(int(1, 6));
    await prisma.batch.create({
      data: {
        farmerId: f.user.id,
        crop: p.crop,
        category: info.category,
        title: `${info.names.en}, ${f.farm}`,
        quantityKg: p.qty,
        unit: info.unit,
        harvestDate: hoursAgo(int(4, 12)),
        declaredNotes: p.notes,
        proposedPrice: Math.round((todayModal.get(p.crop) ?? info.basePrice) * 1.15),
        grade: p.score >= 88 ? "A" : p.score >= 75 ? "B" : "C",
        status: "PENDING_REVIEW",
        aiQualityScore: p.score,
        aiFlags: p.flags,
        aiSummary: p.summary,
        aiSource: "fallback",
        voiceTranscript: p.transcript,
        inputLanguage: p.lang,
        createdAt: created,
        media: {
          create: {
            url: image,
            type: "IMAGE",
            mimeType: "image/jpeg",
            sha256: sha256Of(image),
            isDuplicate: Boolean(p.dup),
            duplicateOfBatchId: p.dup ? rameshTomatoImage.batchId : null,
            capturedAt: p.dup ? rameshTomatoImage.capturedAt : created,
            provenanceNote: p.dup ? "Same file hash as a photo on another farmer's approved batch" : "Captured in app",
          },
        },
      },
    });
  }

  // ── Open bulk demands with offers
  const d1 = await prisma.demandRequest.create({
    data: { buyerId: bulkBuyers[0].id, crop: "tomato", qtyKg: 80, grade: "A", targetPrice: 27, deadline: hoursAgo(-48), recurring: true, frequency: "WEEKLY", notes: "Firm, for salads and gravies. Delivery before 10 AM.", area: "Hebbal", createdAt: hoursAgo(8) },
  });
  const d2 = await prisma.demandRequest.create({
    data: { buyerId: bulkBuyers[1].id, crop: "potato", qtyKg: 150, grade: "B", targetPrice: 30, deadline: hoursAgo(-72), area: "Jayanagar", notes: "Medium size preferred.", createdAt: hoursAgo(20) },
  });
  const d3 = await prisma.demandRequest.create({
    data: { buyerId: bulkBuyers[2].id, crop: "spinach", qtyKg: 30, grade: "ANY", targetPrice: 32, deadline: hoursAgo(-20), urgent: true, area: "Yelahanka", notes: "For tomorrow's 300 meals. Leafy greens of any grade welcome.", createdAt: hoursAgo(6) },
  });
  await prisma.offer.createMany({
    data: [
      { demandId: d1.id, farmerId: farmers[0].user.id, listingId: active[0].id, qtyKg: 80, pricePerKg: 29, etaHours: 18, note: "Can deliver by 8 AM." },
      { demandId: d1.id, farmerId: farmers[3].user.id, listingId: active[9].id, qtyKg: 60, pricePerKg: 26, etaHours: 30 },
      { demandId: d1.id, farmerId: farmers[6].user.id, listingId: active[20].id, qtyKg: 80, pricePerKg: 27.5, etaHours: 40, note: "Kanakapura, longer haul." },
      { demandId: d2.id, farmerId: farmers[2].user.id, listingId: active[8].id, qtyKg: 150, pricePerKg: 31, etaHours: 24 },
      { demandId: d2.id, farmerId: farmers[5].user.id, listingId: active[15].id, qtyKg: 120, pricePerKg: 29, etaHours: 20 },
      { demandId: d3.id, farmerId: farmers[6].user.id, listingId: active[18].id, qtyKg: 20, pricePerKg: 34, etaHours: 16 },
    ],
  });

  // ── Subscriptions (milk/eggs only exist in the pilot area)
  await prisma.subscription.createMany({
    data: [
      { buyerId: consumers[0].id, listingId: active[12].id, crop: "milk", qty: 1, unit: "litre", frequency: "DAILY", preferredSlot: "6–8 AM", nextRunAt: nextRun("DAILY", null, "6–8 AM").runAt },
      { buyerId: consumers[0].id, listingId: active[0].id, crop: "tomato", qty: 2, unit: "kg", frequency: "WEEKLY", dayOfWeek: 0, preferredSlot: "9–11 AM", nextRunAt: nextRun("WEEKLY", 0, "9–11 AM").runAt },
      { buyerId: consumers[3].id, listingId: active[13].id, crop: "eggs", qty: 1, unit: "dozen", frequency: "WEEKLY", dayOfWeek: 3, preferredSlot: "7–9 AM", nextRunAt: nextRun("WEEKLY", 3, "7–9 AM").runAt, active: false },
    ],
  });

  // ── Feedback on delivered orders; Ravi (idx 7) collects complaints for trust & safety.
  const deliveredOrders = await prisma.order.findMany({ where: { status: { in: ["DELIVERED", "COLLECTED", "DISPUTED"] }, type: "RETAIL" }, select: { id: true, buyerId: true, farmerId: true, status: true, createdAt: true } });
  const ravi = farmers[7].user.id;
  for (const o of deliveredOrders) {
    if (rand() > 0.7 && o.farmerId !== ravi && o.status !== "DISPUTED") continue;
    const bad = o.farmerId === ravi ? rand() < 0.6 : o.status === "DISPUTED" || rand() < 0.06;
    await prisma.feedback.create({
      data: {
        orderId: o.id,
        buyerId: o.buyerId,
        rating: bad ? int(1, 3) : int(4, 5),
        issue: bad ? pick(["NOT_FRESH", "SHORT_QTY", "DAMAGED"]) : "NONE",
        comment: bad ? pick(["Leaves were wilted on arrival", "Received less than ordered", "Some pieces were crushed"]) : pick(["Super fresh!", "Tasted like home-grown", "Great quality, on time", null]),
        createdAt: new Date(o.createdAt.getTime() + 12 * 3_600_000),
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    listings: await prisma.listing.count({ where: { status: { not: "SOLD_OUT" } } }),
    orders: await prisma.order.count(),
    pending: await prisma.batch.count({ where: { status: "PENDING_REVIEW" } }),
    prices: await prisma.marketPrice.count(),
  };
  console.log("Done:", counts);
  console.log(`
Demo logins (PIN 1234)
  Farmer      9000000101  Ramesh Gowda
  Consumer    9000000201  Ananya Rao
  Restaurant  9000000301  The Green Ladle
  Community   9000000303  Annapurna Community Kitchen
  Admin       9000000001  Meera Krishnan
  Delivery    9000000401  Imran Pasha`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
