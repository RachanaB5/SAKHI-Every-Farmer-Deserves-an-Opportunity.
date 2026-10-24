// /admin/controls — commission, surplus rules, service areas, cold-chain
// categories and payouts.
import type { Metadata } from "next";
import { ControlsPanel } from "@/components/admin/controls-panel";

export const metadata: Metadata = { title: "Controls" };

/** Platform controls page. */
export default function AdminControlsPage() {
  return <ControlsPanel />;
}
