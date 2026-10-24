// /shop/assistant — AI grocery assistant and smart basket.
import type { Metadata } from "next";
import { GroceryAssistant } from "@/components/shop/assistant";

export const metadata: Metadata = { title: "AI basket" };

/** Assistant page. */
export default function AssistantPage() {
  return <GroceryAssistant />;
}
