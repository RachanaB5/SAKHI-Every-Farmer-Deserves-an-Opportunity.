// Colour-coded status pill for batches, listings, orders, payments,
// settlements and deliveries — one vocabulary across the whole app.
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "lime";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  // Batches
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_REVIEW: { label: "In review", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  RESUBMIT: { label: "Needs changes", tone: "warning" },
  // Listings
  ACTIVE: { label: "Live", tone: "lime" },
  PAUSED: { label: "Paused", tone: "neutral" },
  SOLD_OUT: { label: "Sold out", tone: "neutral" },
  // Orders
  PLACED: { label: "Placed", tone: "info" },
  CONFIRMED: { label: "Confirmed", tone: "info" },
  PACKED: { label: "Packed", tone: "info" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "warning" },
  READY_FOR_PICKUP: { label: "Ready for pickup", tone: "warning" },
  DELIVERED: { label: "Delivered", tone: "success" },
  COLLECTED: { label: "Collected", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  DISPUTED: { label: "Disputed", tone: "danger" },
  // Payments (never imply the farmer has been paid before settlement)
  AUTHORISED: { label: "Authorised", tone: "info" },
  CAPTURED: { label: "Captured", tone: "info" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
  FAILED: { label: "Failed", tone: "danger" },
  // Settlements
  PENDING: { label: "Settlement pending", tone: "warning" },
  SETTLED: { label: "Settled", tone: "success" },
  // Deliveries
  UNASSIGNED: { label: "Unassigned", tone: "neutral" },
  ASSIGNED: { label: "Rider assigned", tone: "info" },
  PICKED_UP: { label: "Picked up", tone: "warning" },
  // Demands / offers
  OPEN: { label: "Open", tone: "lime" },
  AWARDED: { label: "Awarded", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
  COUNTERED: { label: "Countered", tone: "warning" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};

const TONE: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info/12 text-info",
  warning: "bg-warning/18 text-[color-mix(in_oklch,var(--warning),black_35%)] dark:text-warning",
  success: "bg-success/14 text-success",
  danger: "bg-destructive/12 text-destructive",
  lime: "bg-lime/35 text-lime-foreground dark:bg-lime/20 dark:text-lime",
};

/** Human label for a status code. */
export function statusLabel(status: string): string {
  return STATUS[status]?.label ?? status.replace(/_/g, " ").toLowerCase();
}

/**
 * @param status - enum value from any model
 * @param label - override the default label
 * @param pulse - animate a live dot (in-flight states)
 */
export function StatusBadge({
  status,
  label,
  pulse = false,
  className,
}: {
  status: string;
  label?: string;
  pulse?: boolean;
  className?: string;
}) {
  const meta = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        TONE[meta.tone],
        className,
      )}
    >
      {pulse && (
        <span className="relative flex size-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" />
          <span className="relative size-1.5 rounded-full bg-current" />
        </span>
      )}
      {label ?? meta.label}
    </span>
  );
}

/**
 * Offer-specific wording (PENDING on an offer means "waiting for the buyer",
 * not a settlement).
 * @param viewer - whose screen this is, to phrase counters from their side
 */
export function offerStatusLabel(status: string, lastActor: string | null, viewer: "BUYER" | "FARMER"): string {
  if (status === "PENDING") return viewer === "FARMER" ? "Awaiting buyer" : "New offer";
  if (status === "COUNTERED") {
    const mine = (lastActor === "BUYER") === (viewer === "BUYER");
    return mine ? "You countered" : viewer === "FARMER" ? "Buyer countered" : "Farmer countered";
  }
  if (status === "REJECTED") return "Declined";
  return statusLabel(status);
}
