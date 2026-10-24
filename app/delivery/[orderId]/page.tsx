// /delivery/[orderId] — one run: route, items, OTP handover.
import type { Metadata } from "next";
import { RunDetail } from "@/components/delivery/run-detail";

export const metadata: Metadata = { title: "Run" };

/** Run detail. */
export default async function RunPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <RunDetail id={orderId} />;
}
