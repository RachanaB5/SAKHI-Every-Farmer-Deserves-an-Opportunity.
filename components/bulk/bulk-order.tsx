// Bulk buyer order page: buyer tracking + an Invoice button.
"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { BuyerOrder } from "@/components/shop/buyer-order";
import { Button } from "@/components/ui/button";

/** /bulk/orders/[id] */
export function BulkOrder({ id }: { id: string }) {
  return (
    <BuyerOrder
      id={id}
      backHref="/bulk/orders"
      actions={(o) => (
        <Button asChild variant="outline" size="sm">
          <Link href={`/bulk/orders/${o.id}/invoice`}>
            <FileText /> Invoice
          </Link>
        </Button>
      )}
    />
  );
}
