// /bulk/schedule — recurring procurement.
import type { Metadata } from "next";
import { Schedule } from "@/components/bulk/schedule";

export const metadata: Metadata = { title: "Schedule" };

/** Recurring schedule page. */
export default function SchedulePage() {
  return <Schedule />;
}
