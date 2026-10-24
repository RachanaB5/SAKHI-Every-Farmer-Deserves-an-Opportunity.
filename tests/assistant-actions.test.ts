// Sakhi server guarantees: confirm tokens are signed, expiring,
// per-farmer and single-use; actions are scoped to the farmer's own data;
// earnings never call pending money settled; drafts need a photo before
// review; and the model being down never breaks understanding.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";
import { executeConfirmed, handleIntent } from "@/lib/assistant/actions";
import { runOnce, signConfirm, verifyConfirm } from "@/lib/assistant/confirm";
import { understand } from "@/lib/assistant/understand";
import { createDraftBatch, submitBatch } from "@/lib/batches";
import { db } from "@/lib/db";
import { farmerEarnings } from "@/lib/farmer/earnings";
import { setAvailableStock } from "@/lib/inventory";
import { confirmOrder } from "@/lib/orders/lifecycle";
import { makeListing, makeUser, placeOrder } from "./helpers";

let a: User;
let b: User;
let buyer: User;
let listingId: string;

beforeAll(async () => {
  a = await makeUser("FARMER");
  b = await makeUser("FARMER");
  buyer = await makeUser("CONSUMER");
  listingId = (await makeListing(a.id, 20, 30)).id;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("confirm tokens", () => {
  it("verifies for the same farmer only", async () => {
    const token = await signConfirm(a.id, { intent: "UPDATE_PRICE", lang: "en", listingId, price: 31 });
    await expect(verifyConfirm(token, a.id)).resolves.toMatchObject({ payload: { intent: "UPDATE_PRICE", listingId, price: 31 } });
    await expect(verifyConfirm(token, b.id)).rejects.toMatchObject({ status: 403 });
  });
  it("rejects a tampered token", async () => {
    const token = await signConfirm(a.id, { intent: "UPDATE_PRICE", lang: "en", listingId, price: 31 });
    const [h, p, s] = token.split(".");
    const forged = JSON.parse(Buffer.from(p, "base64url").toString());
    forged.p.price = 1;
    await expect(verifyConfirm(`${h}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${s}`, a.id)).rejects.toMatchObject({ status: 403 });
  });
  it("expires after five minutes", async () => {
    const token = await signConfirm(a.id, { intent: "UPDATE_PRICE", lang: "en", listingId, price: 31 });
    vi.useFakeTimers({ now: Date.now() + 6 * 60_000 });
    await expect(verifyConfirm(token, a.id)).rejects.toMatchObject({ status: 410 });
  });
  it("runs a confirmed action exactly once (a double confirm is a no-op)", async () => {
    const token = await signConfirm(a.id, { intent: "UPDATE_PRICE", lang: "en", listingId, price: 34 });
    const { jti, payload } = await verifyConfirm(token, a.id);
    const [first, second] = await Promise.all([runOnce(jti, a.id, payload.intent, () => executeConfirmed(a, payload)), runOnce(jti, a.id, payload.intent, () => executeConfirmed(a, payload))].map((p) => p.catch((e: Error) => e)));
    const ok = [first, second].filter((r) => !(r instanceof Error));
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const again = await runOnce(jti, a.id, payload.intent, () => executeConfirmed(a, payload));
    expect(again.replayed).toBe(true);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).pricePerUnit).toBe(34);
    expect(await db.auditLog.count({ where: { entity: "Listing", entityId: listingId, action: "LISTING_UPDATED" } })).toBe(1);
  });
});

describe("ownership", () => {
  it("never changes another farmer's listing, even with a forged payload", async () => {
    await expect(executeConfirmed(b, { intent: "UPDATE_PRICE", lang: "en", listingId, price: 1 })).rejects.toMatchObject({ status: 403 });
    await expect(setAvailableStock(b.id, listingId, 1)).rejects.toMatchObject({ status: 403 });
  });
  it("answers price and stock questions only from the farmer's own listings", async () => {
    const r = await handleIntent(b, { intent: "UPDATE_PRICE", entities: { crop: "tomato", price: 40 }, confidence: 1, missing: [] }, "en", undefined, "");
    expect(r.needsConfirmation).toBeFalsy();
    expect(r.display).toMatch(/don't have a live Tomato listing/);
  });
  it("keeps earnings per farmer", async () => {
    const order = await placeOrder(buyer.id, a.id, [{ listingId, qty: 2 }]);
    await confirmOrder(order.id);
    expect((await farmerEarnings(a.id, "all")).orders).toBeGreaterThanOrEqual(1);
    expect((await farmerEarnings(b.id, "all")).orders).toBe(0);
  });
});

describe("data honesty", () => {
  it("counts a pending settlement as pending, never as settled", async () => {
    const order = await placeOrder(buyer.id, a.id, [{ listingId, qty: 1 }]);
    await confirmOrder(order.id);
    await db.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
    await db.settlement.create({ data: { orderId: order.id, farmerId: a.id, gross: 30, platformFee: 1.5, deliveryCost: 0, net: 28.5, status: "PENDING" } });
    const e = await farmerEarnings(a.id, "all");
    expect(e.pending).toBeGreaterThanOrEqual(28.5);
    expect(e.settled).toBe(0);
  });
  it("won't send a draft for review without a photo", async () => {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const draft = await createDraftBatch(a, { crop: "tomato", quantity: 10, unit: "kg", harvestDate: iso, price: 25 });
    await expect(submitBatch(a, draft.id)).rejects.toMatchObject({ status: 400 });
    expect((await db.batch.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("DRAFT");
  });
  it("caps stock at the verified harvest quantity", async () => {
    await expect(setAvailableStock(a.id, listingId, 999)).rejects.toMatchObject({ status: 409 });
    const before = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    const sold = before.totalQty - before.availableQty - before.reservedQty;
    const r = await setAvailableStock(a.id, listingId, 5);
    expect(r.after).toBe(5);
    const l = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    // Sold and reserved quantities are untouched; only what's on offer moves.
    expect(l.availableQty).toBe(5);
    expect(l.reservedQty).toBe(before.reservedQty);
    expect(l.totalQty - l.availableQty - l.reservedQty).toBeCloseTo(sold);
  });
});

describe("model outage", () => {
  it("falls back to the rule parser when the AI provider fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));
    const vague = await understand("umm tomato something", "en");
    expect(vague.source).toBe("rules");
    const clear = await understand("How much did I earn this week?", "en");
    expect(clear).toMatchObject({ intent: "CHECK_EARNINGS", source: "rules" });
  });
});
