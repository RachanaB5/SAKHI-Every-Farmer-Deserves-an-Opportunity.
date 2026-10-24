// /shop/orders — the buyer's active and past orders.
import type { Metadata } from "next";
import { OrdersList } from "@/components/shop/orders-list";

export const metadata: Metadata = { title: "Orders" };

/** Orders list. */
export default function OrdersPage() {
  return <OrdersList />;
}
