// Tests the offline visual heuristic on real seed photos and on garbage input.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { qualityHeuristic } from "@/lib/ai/fallback/quality-heuristic";
import { qualitySchema } from "@/lib/ai/schemas";

const seed = (f: string) => fs.readFileSync(path.join(process.cwd(), "public", "seed", f));

describe("qualityHeuristic", () => {
  it("returns schema-valid, deterministic results for produce photos", async () => {
    const a = await qualityHeuristic([seed("tomato-1.jpg"), seed("tomato-2.jpg")], "tomato");
    const b = await qualityHeuristic([seed("tomato-1.jpg"), seed("tomato-2.jpg")], "tomato");
    expect(qualitySchema.parse(a)).toEqual(a);
    expect(a).toEqual(b);
    expect(a.score).toBeGreaterThanOrEqual(70);
  });

  it("does not penalise naturally brown crops for brown pixels", async () => {
    const r = await qualityHeuristic([seed("potato-1.jpg")], "potato");
    expect(r.flags).not.toContain("rot_spots");
    expect(r.flags).not.toContain("bruising");
  });

  it("degrades gracefully on undecodable bytes", async () => {
    const r = await qualityHeuristic([Buffer.from("not an image")], "tomato");
    expect(r.score).toBeGreaterThanOrEqual(35);
    expect(r.summary).toMatch(/admin will review/);
  });
});
