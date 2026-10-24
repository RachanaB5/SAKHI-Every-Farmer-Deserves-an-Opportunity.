// /shop/cart — multi-farmer basket.
import type { Metadata } from "next";
import { CartView } from "@/components/shop/cart-view";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Cart" };

/** Cart page (bulk buyers get bulk quantity steps). */
export default async function CartPage() {
  const session = await getSession();
  return <CartView bulk={session?.role === "BULK_BUYER"} />;
}
