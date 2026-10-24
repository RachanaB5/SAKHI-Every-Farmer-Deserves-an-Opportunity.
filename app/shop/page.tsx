// /shop — consumer marketplace browse.
import type { Metadata } from "next";
import { Browse } from "@/components/shop/browse";
import { getCurrentUser } from "@/lib/auth/session";
import { categoryChips } from "@/lib/categories";

export const metadata: Metadata = { title: "Shop" };

/** Loads the buyer's area and category availability, then renders browse (`?q=` from the top-bar search). */
export default async function ShopPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q = "" }, user] = await Promise.all([searchParams, getCurrentUser()]);
  const area = user?.area ?? null;
  return <Browse key={q} initialQuery={q} area={area} categories={await categoryChips(area)} bulk={user?.role === "BULK_BUYER"} />;
}
