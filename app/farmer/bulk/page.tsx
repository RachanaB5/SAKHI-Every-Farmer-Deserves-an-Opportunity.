// /farmer/bulk — open bulk requirements nearby and the farmer's offers.
import type { Metadata } from "next";
import { BulkFeed } from "@/components/farmer/bulk-feed";

export const metadata: Metadata = { title: "Bulk demand" };

/** Farmer bulk feed. */
export default function FarmerBulkPage() {
  return <BulkFeed />;
}
