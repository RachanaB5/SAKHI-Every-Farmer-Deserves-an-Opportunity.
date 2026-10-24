// /farmer/payments — awaiting → pending → settled, with fee breakdowns.
import type { Metadata } from "next";
import { Payments } from "@/components/farmer/payments";

export const metadata: Metadata = { title: "Payments" };

/** Farmer payments timeline. */
export default function PaymentsPage() {
  return <Payments />;
}
