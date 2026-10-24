// Shared inventory — the "no double-selling" rule lives here.
//
// Browsing, carts, inquiries and bulk offers NEVER touch stock. Only
// confirming an order does, inside one transaction:
//   for each item: UPDATE listing SET available -= qty, reserved += qty
//                  WHERE id = ? AND status = ACTIVE AND available >= qty
// If any conditional update matches 0 rows, the whole transaction rolls
// back, so an order is either fully reserved or not at all — and two
// buyers racing for the last kilo can't both win.
//
// Reserved stock is later either committed (delivered: reserved -= qty) or
// released back to available (cancelled before handover).
import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";
import { round2 } from "@/lib/fees";

type Tx = Prisma.TransactionClient;

/** Thrown when an order can't be fully reserved. */
export class InsufficientStockError extends Error {
  constructor(
    public listingId: string,
    public title: string,
  ) {
    super(`${title} just sold out or has less stock than you asked for`);
  }
}

/** Transient SQLite/Postgres contention errors worth retrying. */
function isRetryable(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === "P2034" || e.code === "P1008";
  const msg = (e as Error)?.message ?? "";
  return /database is locked|SQLITE_BUSY|could not serialize|deadlock/i.test(msg);
}

/**
 * Runs `fn` in an interactive transaction, retrying on write conflicts.
 * Business errors (e.g. InsufficientStockError) are never retried.
 */
export async function withTxRetry<T>(fn: (tx: Tx) => Promise<T>, client: PrismaClient = db, attempts = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await client.$transaction(fn, { maxWait: 5000, timeout: 10000 });
    } catch (e) {
      if (!isRetryable(e)) throw e;
      last = e;
      await new Promise((r) => setTimeout(r, 25 * 2 ** i + Math.random() * 25));
    }
  }
  throw last;
}

/**
 * Reserves stock for every item of an order (call inside a transaction).
 * @throws InsufficientStockError — caller's transaction then rolls back
 */
export async function reserveItems(tx: Tx, items: { listingId: string; qty: number; title: string }[]) {
  for (const item of items) {
    const res = await tx.listing.updateMany({
      where: { id: item.listingId, status: "ACTIVE", availableQty: { gte: item.qty } },
      data: { availableQty: { decrement: item.qty }, reservedQty: { increment: item.qty } },
    });
    if (res.count !== 1) throw new InsufficientStockError(item.listingId, item.title);
  }
  // Flip fully-reserved listings to SOLD_OUT (tiny float residue counts as zero).
  await tx.listing.updateMany({
    where: { id: { in: items.map((i) => i.listingId) }, status: "ACTIVE", availableQty: { lte: 0.0001 } },
    data: { status: "SOLD_OUT", availableQty: 0 },
  });
}

/**
 * Returns reserved stock to available (order cancelled before handover).
 * Re-activates listings that had sold out.
 */
export async function releaseItems(tx: Tx, items: { listingId: string; qty: number }[]) {
  for (const item of items) {
    await tx.listing.update({
      where: { id: item.listingId },
      data: { availableQty: { increment: item.qty }, reservedQty: { decrement: item.qty } },
    });
  }
  await tx.listing.updateMany({
    where: { id: { in: items.map((i) => i.listingId) }, status: "SOLD_OUT", availableQty: { gt: 0 } },
    data: { status: "ACTIVE" },
  });
}

/** Marks reserved stock as sold (goods handed over). */
export async function commitItems(tx: Tx, items: { listingId: string; qty: number }[]) {
  for (const item of items) {
    await tx.listing.update({ where: { id: item.listingId }, data: { reservedQty: { decrement: item.qty } } });
  }
}

/** Sold quantity for display (total − available − reserved). */
export function soldQty(l: { totalQty: number; availableQty: number; reservedQty: number }): number {
  return round2(l.totalQty - l.availableQty - l.reservedQty);
}

/**
 * Sets how much of a listing is still available (e.g. some was sold at the
 * gate or spoiled). Reserved and sold stock are untouched, and the total can
 * never exceed the quantity the admin verified on the batch. Optimistic:
 * fails with 409 if the stock moved since it was read.
 */
export async function setAvailableStock(farmerId: string, listingId: string, available: number) {
  const l = await db.listing.findUnique({ where: { id: listingId }, include: { batch: { select: { quantityKg: true } } } });
  if (!l) throw new HttpError(404, "Listing not found");
  if (l.farmerId !== farmerId) throw new HttpError(403, "This listing belongs to another farmer");
  if (l.status === "REMOVED") throw new HttpError(409, "You removed this listing, list a new harvest to sell again");
  const sold = soldQty(l);
  const cap = round2(Math.max(0, l.batch.quantityKg - sold - l.reservedQty));
  if (available < 0) throw new HttpError(400, "Stock can't be negative");
  if (available > cap) throw new HttpError(409, `The verified harvest only allows up to ${cap} ${l.unit} available, list a new harvest for more`);
  const totalQty = round2(available + l.reservedQty + sold);
  const status = available === 0 ? "SOLD_OUT" : l.status === "SOLD_OUT" ? "ACTIVE" : l.status;
  const moved = await db.listing.updateMany({
    where: { id: l.id, availableQty: l.availableQty, reservedQty: l.reservedQty },
    data: { availableQty: available, totalQty, status },
  });
  if (moved.count === 0) throw new HttpError(409, "Stock changed just now, check it and try again");
  await audit({ actorId: farmerId, action: "STOCK_SET", entity: "Listing", entityId: l.id, meta: { from: l.availableQty, to: available } });
  publish({ type: "inventory.updated", id: l.id });
  return { before: l.availableQty, after: available, unit: l.unit, status };
}
