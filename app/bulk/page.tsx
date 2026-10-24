// /bulk — restaurant & community kitchen home: requirements and offers.
import type { Metadata } from "next";
import { BulkHome } from "@/components/bulk/bulk-home";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Bulk procurement" };

/** Bulk buyer dashboard. */
export default async function BulkPage() {
  const user = await getCurrentUser();
  return <BulkHome orgName={user?.orgName ?? user?.name ?? ""} />;
}
