// /admin/deliveries — riders, live handovers and OTP attempt logs.
import type { Metadata } from "next";
import { DeliveriesOps } from "@/components/admin/deliveries-ops";

export const metadata: Metadata = { title: "Deliveries" };

/** Delivery ops page. */
export default function AdminDeliveriesPage() {
  return <DeliveriesOps />;
}
