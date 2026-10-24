// /bulk/browse — "Browse & buy": the shop with bulk quantity steps.
import type { Metadata } from "next";
import { BulkTabs } from "@/components/bulk/bulk-tabs";
import { Browse } from "@/components/shop/browse";
import { getCurrentUser } from "@/lib/auth/session";
import { categoryChips } from "@/lib/categories";

export const metadata: Metadata = { title: "Browse & buy" };

/** Bulk buyers buy listed stock directly, in bigger steps (`?q=` from the top-bar search). */
export default async function BulkBrowsePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q = "" }, user] = await Promise.all([searchParams, getCurrentUser()]);
  const area = user?.area ?? null;
  return <Browse key={q} initialQuery={q} area={area} categories={await categoryChips(area)} bulk title="Browse & *buy*" top={<BulkTabs />} />;
}
