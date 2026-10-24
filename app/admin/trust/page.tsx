// /admin/trust — duplicate photos, complaint flags, price outliers and
// suspended accounts.
import type { Metadata } from "next";
import { TrustCenter } from "@/components/admin/trust-center";

export const metadata: Metadata = { title: "Trust & safety" };

/** Trust & safety page. */
export default function AdminTrustPage() {
  return <TrustCenter />;
}
