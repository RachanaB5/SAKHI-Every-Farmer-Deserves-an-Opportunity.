// Fee and net-earnings math: buyer totals, free-delivery threshold,
// commission withheld from farmers, courier shortfall, rounding.
import { describe, expect, it } from "vitest";
import { buyerDeliveryFee, courierCost, orderTotals, platformFeeOf, round2, settlementFor, subtotalOf } from "@/lib/fees";

describe("order totals", () => {
  it("adds the delivery fee to the buyer's total but not the commission", () => {
    const t = orderTotals({ items: [{ qty: 2, unitPrice: 40 }, { qty: 1.5, unitPrice: 30 }], fulfilment: "DELIVERY", baseFee: 25, commissionPct: 5 });
    expect(t).toEqual({ subtotal: 125, deliveryFee: 25, platformFee: 6.25, total: 150 });
  });

  it("waives retail delivery at the threshold, never for bulk", () => {
    expect(buyerDeliveryFee("DELIVERY", 499, 30)).toBe(0);
    expect(buyerDeliveryFee("DELIVERY", 498.99, 30)).toBe(30);
    expect(buyerDeliveryFee("DELIVERY", 5000, 30, "BULK")).toBe(30);
    expect(buyerDeliveryFee("PICKUP", 50, 30)).toBe(0);
  });

  it("rounds to paise without float drift", () => {
    expect(subtotalOf([{ qty: 0.1, unitPrice: 0.2 }, { qty: 0.2, unitPrice: 0.1 }])).toBe(0.04);
    expect(round2(1.005)).toBe(1.01);
    expect(platformFeeOf(33.33, 5)).toBe(1.67);
  });
});

describe("farmer settlement", () => {
  it("deducts commission and only the courier shortfall", () => {
    expect(settlementFor({ subtotal: 200, platformFee: 10, buyerDeliveryFee: 25, actualCourierCost: 45 })).toEqual({ gross: 200, platformFee: 10, deliveryCost: 20, net: 170 });
  });

  it("charges the farmer nothing for delivery when the buyer's fee covers it", () => {
    expect(settlementFor({ subtotal: 100, platformFee: 5, buyerDeliveryFee: 35, actualCourierCost: 30 }).deliveryCost).toBe(0);
  });

  it("absorbs the full courier cost on free-delivery orders", () => {
    expect(settlementFor({ subtotal: 600, platformFee: 30, buyerDeliveryFee: 0, actualCourierCost: 42 })).toMatchObject({ deliveryCost: 42, net: 528 });
  });

  it("never charges a farmer more than 15% of the order for delivery", () => {
    const s = settlementFor({ subtotal: 100, platformFee: 5, buyerDeliveryFee: 0, actualCourierCost: 60 });
    expect(s).toMatchObject({ deliveryCost: 15, net: 80 });
    expect(settlementFor({ subtotal: 20, platformFee: 1, buyerDeliveryFee: 25, actualCourierCost: 60 }).net).toBeGreaterThan(0);
  });

  it("prices pooled courier runs with a cap", () => {
    expect(courierCost(10)).toBe(30);
    expect(courierCost(200)).toBe(60);
    expect(courierCost(-3)).toBe(15);
  });
});
