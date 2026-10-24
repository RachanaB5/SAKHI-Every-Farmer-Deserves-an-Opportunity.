// The photo-quality check (sharpness, light) that sets confidence, never a
// score: clear seed photos pass, blur is caught, a dark photo isn't called blurry.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { checkPhoto } from "@/lib/ai/vision/photo";
import { normaliseForAI } from "@/lib/media";

const seed = (f: string) => normaliseForAI(fs.readFileSync(path.join(process.cwd(), "public", "seed", f)));

describe("photo quality check", () => {
  it("passes clear seed photos", async () => {
    for (const f of ["tomato-2.jpg", "onion-2.jpg", "cabbage-1.jpg", "spinach-1.jpg"]) expect((await checkPhoto(await seed(f))).issues, f).not.toContain("blurry_photo");
  });

  it("flags blur, and doesn't call a dark photo blurry", async () => {
    const photo = await seed("tomato-2.jpg");
    expect((await checkPhoto(await sharp(photo).blur(8).jpeg().toBuffer())).issues).toContain("blurry_photo");
    const dark = await checkPhoto(await sharp(photo).linear(0.35, 0).gamma(1.4).jpeg().toBuffer());
    expect(dark.issues).toContain("low_light");
    expect(dark.issues).not.toContain("blurry_photo");
  });
});
