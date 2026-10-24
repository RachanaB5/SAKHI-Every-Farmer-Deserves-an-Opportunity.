// Category chips for buyers, with whether each is sold in their area
// (special categories like milk/eggs/chicken are area-gated by admins).
import "server-only";
import { CATEGORIES } from "@/lib/crops";
import { db } from "@/lib/db";

/** All categories in display order, flagged available/unavailable for `area`. */
export async function categoryChips(area: string | null) {
  const cats = await db.category.findMany({ orderBy: { sortOrder: "asc" } });
  const chips = cats.map((c) => ({
    slug: c.slug,
    name: c.name,
    available: !c.special || ((c.enabledAreas as string[] | null) ?? []).includes(area ?? ""),
  }));
  // Catalogue categories newer than the database's seed (e.g. fruits) slot in by catalogue order.
  CATEGORIES.forEach((c, i) => {
    if (!c.special && !chips.some((x) => x.slug === c.slug))
      chips.splice(Math.min(i, chips.length), 0, { slug: c.slug, name: c.name, available: true });
  });
  return chips;
}
