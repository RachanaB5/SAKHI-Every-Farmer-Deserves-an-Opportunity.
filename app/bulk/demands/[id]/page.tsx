// /bulk/demands/[id] — ranked offers, negotiation and award.
import type { Metadata } from "next";
import { DemandDetail } from "@/components/bulk/demand-detail";

export const metadata: Metadata = { title: "Requirement" };

/** Requirement detail. */
export default async function DemandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DemandDetail id={id} />;
}
