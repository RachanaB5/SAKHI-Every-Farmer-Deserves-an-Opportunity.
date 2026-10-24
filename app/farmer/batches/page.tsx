// /farmer/batches — the farmer's harvests and their verification status.
import type { Metadata } from "next";
import { BatchList } from "@/components/farmer/batch-list";

export const metadata: Metadata = { title: "Harvests" };

/** Harvest list page. */
export default function BatchesPage() {
  return <BatchList />;
}
