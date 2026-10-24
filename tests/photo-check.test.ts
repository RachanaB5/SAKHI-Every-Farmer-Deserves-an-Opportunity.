// The Gemini photo check: a score only when the photos clearly show the
// declared produce; otherwise "not detectable" with the reason, never a guess.
import { describe, expect, it } from "vitest";
import type { PhotoContentCheck } from "@/lib/ai/schemas";
import { gradePhotos, readCheck, unavailableGrade } from "@/lib/ai/vision";

const answer = (over: Partial<PhotoContentCheck> = {}): PhotoContentCheck => ({
  scene: "single_produce",
  detected: "beans",
  showsDeclared: true,
  stockOrCollage: false,
  condition: 90,
  flags: [],
  summary: "Fresh green beans in a crate.",
  ...over,
});
const grade = (over: Partial<PhotoContentCheck>, declared = "beans", issues: ("blurry_photo" | "low_light")[] = []) => gradePhotos(readCheck(answer(over), declared), declared, issues);

describe("photo check", () => {
  it("grades clear photos of the declared crop from their visible condition", () => {
    expect(grade({})).toMatchObject({ score: 90, grade: "A", flags: [] });
    expect(grade({ condition: 62, flags: ["bruising"] })).toMatchObject({ score: 62, grade: "C", flags: ["bruising"] });
  });

  it("says not detectable for a collage or stock photo", () => {
    const q = grade({ scene: "mixed_produce", detected: null, showsDeclared: false, stockOrCollage: true, flags: ["multiple_items", "stock_photo"] });
    expect(q).toMatchObject({ score: null, grade: null });
    expect(q.flags).toEqual(expect.arrayContaining(["stock_photo", "multiple_items"]));
    expect(q.summary).toMatch(/^Not detectable\. .*stock photo or a collage/);
  });

  it("says not detectable and names what the photos show when they show another crop", () => {
    const q = grade({ detected: "Tomatoes", showsDeclared: false });
    expect(q).toMatchObject({ score: null, grade: null, flags: ["crop_mismatch"] });
    expect(q.summary).toContain("These photos show tomato, not beans");
    expect(readCheck(answer({ detected: "Tomatoes", showsDeclared: false }), "beans").detected).toEqual({ label: "tomato", crop: "tomato" });
  });

  it("says not detectable for unclear photos, non-produce and unconfirmed crops", () => {
    expect(grade({ scene: "unclear", detected: null, showsDeclared: null, condition: null }).flags).toContain("not_detectable");
    expect(grade({ scene: "not_produce", detected: null, showsDeclared: false }).flags).toContain("not_produce");
    expect(grade({ showsDeclared: null }).flags).toContain("crop_unconfirmed");
  });

  it("leaves eggs, milk and chicken to customer reviews", () => {
    const q = grade({ detected: "eggs", condition: 92 }, "eggs");
    expect(q).toMatchObject({ score: null, grade: null, flags: ["not_detectable"] });
    expect(q.summary).toMatch(/customer reviews/);
  });

  it("never marks a score down for a blurry or dark photo", () => {
    const q = grade({}, "beans", ["blurry_photo", "low_light"]);
    expect(q.score).toBe(90);
    expect(q.flags).toEqual(["blurry_photo", "low_light"]);
  });

  it("gives no score when Gemini isn't available", () => {
    expect(unavailableGrade()).toMatchObject({ score: null, grade: null, flags: ["not_detectable"] });
  });
});
