// /delivery/find — find an order by code, QR or voice.
import type { Metadata } from "next";
import { FindOrder } from "@/components/delivery/find-order";

export const metadata: Metadata = { title: "Find order" };

/** Find page. */
export default function FindPage() {
  return <FindOrder />;
}
