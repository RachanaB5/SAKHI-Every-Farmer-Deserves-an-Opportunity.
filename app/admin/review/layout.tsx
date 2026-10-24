// /admin/review layout — keeps the queue visible beside the detail on desktop.
import { ReviewSplit } from "@/components/admin/review-split";

/** Review queue shell. */
export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return <ReviewSplit>{children}</ReviewSplit>;
}
