// /bulk/orders — the bulk buyer's orders (from offers and Browse & buy).
import type { Metadata } from "next";
import { OrdersList } from "@/components/shop/orders-list";

export const metadata: Metadata = { title: "Bulk orders" };

/** Orders list for bulk buyers. */
export default function BulkOrdersPage() {
  return <OrdersList basePath="/bulk/orders" title="Bulk *orders*" shopHref="/bulk/browse" />;
}
