// /admin/review — on desktop, the empty right pane until a batch is picked.
import type { Metadata } from "next";
import { ReviewEmpty } from "@/components/admin/review-empty";

export const metadata: Metadata = { title: "Harvest review" };

/** Placeholder pane (the queue itself renders from the layout). */
export default function ReviewIndex() {
  return <ReviewEmpty />;
}
