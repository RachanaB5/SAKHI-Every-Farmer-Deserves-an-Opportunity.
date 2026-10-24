// /shop/orders/[id] — live order tracking for buyers.
import type { Metadata } from "next";
import { BuyerOrder } from "@/components/shop/buyer-order";

export const metadata: Metadata = { title: "Track order" };

/** Tracking page. */
export default async function TrackOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BuyerOrder id={id} />;
}
