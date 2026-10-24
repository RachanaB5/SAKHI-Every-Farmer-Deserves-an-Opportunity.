// /admin/review/[id] — full review of one harvest batch.
import type { Metadata } from "next";
import { ReviewDetail } from "@/components/admin/review-detail";

export const metadata: Metadata = { title: "Review harvest" };

/** Detail pane. */
export default async function ReviewBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewDetail key={id} id={id} />;
}
