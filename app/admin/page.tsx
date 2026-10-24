// /admin — marketplace analytics overview.
import type { Metadata } from "next";
import { AdminOverview } from "@/components/admin/overview";

export const metadata: Metadata = { title: "Overview" };

/** Admin home. */
export default function AdminHome() {
  return <AdminOverview />;
}
