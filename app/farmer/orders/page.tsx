// /farmer/orders — pack, book riders, hand over.
import type { Metadata } from "next";
import { OrdersBoard } from "@/components/farmer/orders-board";

export const metadata: Metadata = { title: "Orders" };

/** Farmer orders board. */
export default function FarmerOrdersPage() {
  return <OrdersBoard />;
}
