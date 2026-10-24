// /admin/orders — order monitoring, disputes and refunds.
import type { Metadata } from "next";
import { Suspense } from "react";
import { OrdersMonitor } from "@/components/admin/orders-monitor";

export const metadata: Metadata = { title: "Orders" };

/** Admin orders (Suspense for the ?status= filter; remounts when the top-bar search changes ?q=). */
export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  return (
    <Suspense>
      <OrdersMonitor key={q} />
    </Suspense>
  );
}
