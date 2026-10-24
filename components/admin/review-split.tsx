// Two-pane layout for the review queue: list + detail side by side on
// desktop; on phones the list and the detail are separate screens.
"use client";

import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";
import { ReviewList } from "./review-list";

/** Wraps /admin/review and /admin/review/[id]. */
export function ReviewSplit({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const detailOpen = pathname !== "/admin/review";
  return (
    <div>
      <div className={cn(detailOpen && "hidden lg:block")}>
        <PageHeader title="Harvest *review*" description="Verify each batch before it reaches buyers. AI flags assist, you decide." />
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] lg:gap-6">
        <div className={cn("lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pr-1", detailOpen && "hidden lg:block")}>
          <ReviewList />
        </div>
        <div className={cn("min-w-0", !detailOpen && "hidden lg:block")}>{children}</div>
      </div>
    </div>
  );
}
