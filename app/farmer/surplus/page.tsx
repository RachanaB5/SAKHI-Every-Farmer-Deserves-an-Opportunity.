// /farmer/surplus — slow-selling produce and where it could go instead.
import type { Metadata } from "next";
import { SurplusPanel } from "@/components/farmer/surplus-panel";

export const metadata: Metadata = { title: "Surplus rescue" };

/** Surplus page. */
export default function SurplusPage() {
  return <SurplusPanel />;
}
