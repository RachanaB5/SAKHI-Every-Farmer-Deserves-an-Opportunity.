// Category chips for buyers, with whether each is sold in their area
// (special categories like milk/eggs/chicken are area-gated by admins).
import "server-only";
import { db } from "@/lib/db";

/** All categories in display order, flagged available/unavailable for `area`. */
export async function categoryChips(area: string | null) {
  const cats = await db.category.findMany({ orderBy: { sortOrder: "asc" } });
  return cats.map((c) => ({
    slug: c.slug,
    name: c.name,
    available: !c.special || ((c.enabledAreas as string[] | null) ?? []).includes(area ?? ""),
  }));
}
