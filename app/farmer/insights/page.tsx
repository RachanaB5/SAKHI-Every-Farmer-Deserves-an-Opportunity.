// /farmer/insights — sales, earnings and mandi price trends (the former
// farmer home dashboard).
import type { Metadata } from "next";
import { FarmerDashboard } from "@/components/farmer/dashboard";

export const metadata: Metadata = { title: "Sales & prices" };

/** Farmer sales dashboard. */
export default function InsightsPage() {
  return <FarmerDashboard />;
}
