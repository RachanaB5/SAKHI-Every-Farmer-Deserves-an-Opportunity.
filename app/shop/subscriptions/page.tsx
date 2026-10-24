// /shop/subscriptions — recurring orders for households.
import type { Metadata } from "next";
import { SubscriptionsView } from "@/components/shop/subscriptions-view";

export const metadata: Metadata = { title: "Subscriptions" };

/** Subscriptions page. */
export default function SubscriptionsPage() {
  return <SubscriptionsView />;
}
