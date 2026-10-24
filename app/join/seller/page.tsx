// /join/seller — the guided seller setup (six short screens).
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { getPendingGoogle } from "@/lib/auth/google";
import { getPendingJoinProfile } from "@/lib/auth/firebase-pending";
import { BackLink } from "@/components/auth/join/back-link";
import { SellerWizard } from "@/components/auth/join/seller-wizard";

export const metadata: Metadata = { title: "Sell on FoodFlow" };

/** Seller setup screen. */
export default async function SellerJoinPage() {
  const google = (await getPendingGoogle()) ?? (await getPendingJoinProfile());
  return (
    <AuthShell width="max-w-2xl">
      <BackLink href="/login" label="Back" />
      <h1 className="mt-4 text-[2.2rem] leading-[1] font-semibold tracking-tight sm:text-5xl">Set up your seller account</h1>
      <p className="mt-3 mb-7 text-muted-foreground">A few quick questions so we can match you with the right buyers. It takes about five minutes.</p>
      <SellerWizard google={google && { name: google.name, email: google.email }} />
    </AuthShell>
  );
}
