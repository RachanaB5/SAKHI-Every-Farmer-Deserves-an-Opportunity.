// /farmer/pickup — verify self-pickup handovers (QR or code + OTP).
import type { Metadata } from "next";
import { Suspense } from "react";
import { PickupVerify } from "@/components/farmer/pickup-verify";

export const metadata: Metadata = { title: "Verify pickup" };

/** Pickup counter (Suspense for the ?code= search param). */
export default function PickupPage() {
  return (
    <Suspense>
      <PickupVerify />
    </Suspense>
  );
}
