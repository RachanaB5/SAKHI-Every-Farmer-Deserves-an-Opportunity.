// Right-pane placeholder for the review queue on desktop.
"use client";

import { ScanSearch } from "lucide-react";
import { EmptyState } from "@/components/common/states";

/** Shown until a batch is selected. */
export function ReviewEmpty() {
  return <EmptyState icon={ScanSearch} title="Pick a harvest to review" body="Oldest submissions are first in the queue." className="mt-14" />;
}
