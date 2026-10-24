// /shop/checkout — fulfilment, slot, simulated payment, order placement.
import type { Metadata } from "next";
import { CheckoutView } from "@/components/shop/checkout-view";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Checkout" };

/** Prefills the buyer's saved area and address. */
export default async function CheckoutPage() {
  const user = await getCurrentUser();
  return <CheckoutView profile={{ area: user?.area ?? null, address: user?.address ?? null }} />;
}
