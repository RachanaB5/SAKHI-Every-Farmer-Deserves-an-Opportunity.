// Review-driven grading: the photo score is a prior, customer reviews move
// it, one buyer alone can't change the grade, photo-backed complaints count
// more, and fulfilment issues (late, short weight) don't touch quality.
import { describe, expect, it } from "vitest";
import { verdictFor } from "@/lib/quality/listing";
import { blendWithReviews, gradeFor, priorWeight, startingScore, type ReviewSignal } from "@/lib/quality/score";

let t = 0;
const review = (buyerId: string, rating: number, issue: string | null = "NONE", photoVerdict: ReviewSignal["photoVerdict"] = null): ReviewSignal => ({
  buyerId,
  rating,
  issue,
  photoVerdict,
  createdAt: new Date(1_700_000_000_000 + ++t * 1000),
});

describe("grades and photo scores", () => {
  it("uses fixed bands", () => {
    expect([gradeFor(85), gradeFor(84.9), gradeFor(70), gradeFor(69)]).toEqual(["A", "B", "B", "C"]);
  });

  it("keeps an admin's grade override inside its band", () => {
    expect(startingScore(78, "A")).toBe(85);
    expect(startingScore(91, "B")).toBe(84);
    expect(startingScore(91, "A")).toBe(91);
    expect(startingScore(null, "B")).toBe(77);
    expect(startingScore(null, null)).toBeNull();
  });

  it("gives clear photos more weight than blurry ones", () => {
    expect(priorWeight(1)).toBeGreaterThan(priorWeight(0.4));
    expect(priorWeight(0)).toBe(2);
  });
});

describe("blendWithReviews", () => {
  const clearA = { score: 90, confidence: 0.9 };

  it("returns the photo grade with no reviews", () => {
    expect(blendWithReviews(clearA, [])).toEqual({ score: 90, grade: "A", reviewCount: 0, complaintCount: 0 });
  });

  it("does not let one buyer drop the grade", () => {
    const r = blendWithReviews(clearA, [review("b1", 1, "NOT_FRESH", "supports")]);
    expect(r.grade).toBe("A");
    expect(r.score).toBeLessThan(90);
    expect(r.complaintCount).toBe(1);
  });

  it("counts a buyer's repeated complaints once", () => {
    const r = blendWithReviews(clearA, [review("b1", 1, "NOT_FRESH"), review("b1", 1, "DAMAGED"), review("b1", 1, "NOT_FRESH")]);
    expect(r.grade).toBe("A");
    expect(r.reviewCount).toBe(1);
  });

  it("drops the grade when several buyers complain, further with more", () => {
    const two = blendWithReviews(clearA, [review("b1", 1, "NOT_FRESH", "supports"), review("b2", 2, "DAMAGED", "supports")]);
    expect(two.grade).toBe("B");
    const four = blendWithReviews(clearA, ["b1", "b2", "b3", "b4"].map((b) => review(b, 1, "NOT_FRESH", "supports")));
    expect(four.grade).toBe("C");
    expect(four.score!).toBeLessThan(two.score!);
  });

  it("weighs photo-backed complaints more than contradicted ones", () => {
    const backed = blendWithReviews(clearA, [review("b1", 1, "NOT_FRESH", "supports"), review("b2", 1, "NOT_FRESH", "supports")]);
    const contradicted = blendWithReviews(clearA, [review("b1", 1, "NOT_FRESH", "contradicts"), review("b2", 1, "NOT_FRESH", "contradicts")]);
    expect(backed.score!).toBeLessThan(contradicted.score!);
  });

  it("ignores late delivery and short weight for produce quality", () => {
    const r = blendWithReviews(clearA, [review("b1", 1, "LATE"), review("b2", 1, "SHORT_QTY")]);
    expect(r).toMatchObject({ score: 90, grade: "A", reviewCount: 0 });
  });

  it("lets reviews move an unsure photo grade faster than a confident one", () => {
    const happy = ["b1", "b2", "b3"].map((b) => review(b, 5));
    const blurry = blendWithReviews({ score: 80, confidence: 0.3 }, happy);
    const clear = blendWithReviews({ score: 80, confidence: 1 }, happy);
    expect(blurry.score!).toBeGreaterThan(clear.score!);
    expect(blurry.grade).toBe("A");
  });

  it("leaves an ungraded listing without a score until customers review it", () => {
    const ungraded = { score: null, confidence: 0 };
    expect(blendWithReviews(ungraded, [])).toEqual({ score: null, grade: null, reviewCount: 0, complaintCount: 0 });
    expect(blendWithReviews(ungraded, [review("b1", 5)])).toMatchObject({ score: 95, grade: null });
    expect(blendWithReviews(ungraded, [review("b1", 5), review("b2", 4)]).grade).toBe("A");
    expect(blendWithReviews(ungraded, [review("b1", 1, "NOT_FRESH"), review("b2", 2, "DAMAGED")]).grade).toBe("C");
  });
});

describe("verdictFor (buyer photo evidence)", () => {
  const seen = (condition: number | null, match: "match" | "mismatch" | "unsure" | null = "match") => ({ match, condition, notProduce: false, unclear: false, stock: false });

  it("supports a freshness complaint when the photo shows spoilage", () => {
    expect(verdictFor("NOT_FRESH", seen(30))).toBe("supports");
  });

  it("contradicts it when the photo shows fresh produce", () => {
    expect(verdictFor("NOT_FRESH", seen(95))).toBe("contradicts");
  });

  it("never holds an unreadable photo against the buyer", () => {
    expect(verdictFor("NOT_FRESH", { ...seen(95), unclear: true })).toBe("unclear");
    expect(verdictFor("NOT_FRESH", seen(null))).toBe("unclear");
  });

  it("supports a wrong-item complaint when the photo shows another crop", () => {
    expect(verdictFor("WRONG_ITEM", seen(90, "mismatch"))).toBe("supports");
  });

  it("is unclear without an issue or a reading", () => {
    expect(verdictFor("NONE", seen(10))).toBe("unclear");
    expect(verdictFor("NOT_FRESH", null)).toBe("unclear");
  });
});
