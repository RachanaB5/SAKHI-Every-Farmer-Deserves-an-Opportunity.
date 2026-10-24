// /api/addresses — a signed-in user's saved addresses.
//   GET   list them (newest first) and say which one is active
//   POST  add one; by default it becomes the active location
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { activateAddress, MAX_ADDRESSES } from "@/lib/addresses";
import { coordsFor } from "@/lib/areas";
import { addressSchema } from "@/lib/validators/onboarding";

/** Lists the user's addresses. */
export const GET = handler({ roles: ["FARMER", "CONSUMER", "BULK_BUYER"] }, async ({ user }) => {
  const rows = await db.address.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const active = rows.find((r) => r.line === user.address && (r.lat ?? null) === (user.lat ?? null)) ?? rows.find((r) => r.line === user.address);
  return { addresses: rows, activeId: active?.id ?? null };
});

/** Adds an address (a detected "Current location" replaces the previous detected one). */
export const POST = handler({ roles: ["FARMER", "CONSUMER", "BULK_BUYER"], body: addressSchema }, async ({ user, body }) => {
  if (body.isCurrentLocation) await db.address.deleteMany({ where: { userId: user.id, isCurrentLocation: true } });
  const count = await db.address.count({ where: { userId: user.id } });
  if (count >= MAX_ADDRESSES) throw new HttpError(400, `You can save up to ${MAX_ADDRESSES} addresses, remove one first`);
  // Typed addresses carry no GPS fix: fall back to the centre of the chosen service area.
  const at = body.lat != null && body.lng != null ? { lat: body.lat, lng: body.lng } : coordsFor(body.area);
  const address = await db.address.create({
    data: { userId: user.id, label: body.label, line: body.line, area: body.area ?? null, lat: at?.lat ?? null, lng: at?.lng ?? null, isCurrentLocation: body.isCurrentLocation },
  });
  if (body.makeActive) await activateAddress(user.id, address);
  return { address, activeId: body.makeActive ? address.id : null };
});
