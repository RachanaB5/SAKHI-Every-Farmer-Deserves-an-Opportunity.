// /bulk/orders/[id]/invoice — printable invoice (Download PDF = print).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Invoice } from "@/components/bulk/invoice";
import { HttpError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { loadOrderFor, serializeOrder } from "@/lib/orders/queries";

export const metadata: Metadata = { title: "Invoice" };

/** Loads the order (buyer, farmer or admin); 404s for anyone else. */
async function loadInvoice(id: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const order = await loadOrderFor(user, id);
    return { order: serializeOrder(order, user), address: user.id === order.buyerId ? user.address : order.addressLine };
  } catch (e) {
    if (e instanceof HttpError) return null;
    throw e;
  }
}

/** Invoice page. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadInvoice(id);
  if (!data) notFound();
  return <Invoice order={data.order} backHref={`/bulk/orders/${id}`} buyerAddress={data.address} />;
}
