// /bulk/orders/[id] — live tracking + invoice for a bulk order.
import type { Metadata } from "next";
import { BulkOrder } from "@/components/bulk/bulk-order";

export const metadata: Metadata = { title: "Bulk order" };

/** Bulk order detail. */
export default async function BulkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BulkOrder id={id} />;
}
