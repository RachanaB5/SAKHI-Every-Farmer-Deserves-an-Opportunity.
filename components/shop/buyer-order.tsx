// Buyer tracking page composition: order detail + the handover code panel
// while a rider is on the way / ready for pickup, and feedback afterwards.
"use client";

import type { SerializedOrder } from "@/lib/orders/queries";
import { FeedbackPanel } from "./feedback-panel";
import { HandoverPanel, needsHandover } from "./handover-panel";
import { OrderDetail } from "./order-detail";

/** Buyer view of one order. */
export function BuyerOrder({ id, backHref, actions }: { id: string; backHref?: string; actions?: (o: SerializedOrder) => React.ReactNode }) {
  return (
    <OrderDetail
      id={id}
      backHref={backHref}
      actions={actions}
      handover={(order, refresh) => (needsHandover(order) ? <HandoverPanel order={order} onChange={refresh} /> : null)}
      after={(order, refresh) => <FeedbackPanel order={order} onDone={refresh} />}
    />
  );
}
