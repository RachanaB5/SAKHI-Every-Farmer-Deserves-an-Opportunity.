// /delivery — rider home: today's runs.
import type { Metadata } from "next";
import { Runs } from "@/components/delivery/runs";

export const metadata: Metadata = { title: "Runs" };

/** Rider runs. */
export default function DeliveryHome() {
  return <Runs />;
}
