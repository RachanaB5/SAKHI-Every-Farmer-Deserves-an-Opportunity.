// Route-level loading skeleton (title + cards) shown inside the app shell
// while a page segment streams in.
import { SkeletonBlock, SkeletonCards } from "./states";

/** Generic page skeleton. */
export function RouteLoading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-2/3 max-w-sm" />
        <SkeletonBlock className="h-5 w-full max-w-md" />
      </div>
      <SkeletonCards count={6} />
    </div>
  );
}
