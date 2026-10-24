// /join/buyer/household — sign-in details for a household customer.
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { getPendingGoogle } from "@/lib/auth/google";
import { getPendingJoinProfile } from "@/lib/auth/firebase-pending";
import { BackLink } from "@/components/auth/join/back-link";
import { HouseholdForm } from "@/components/auth/join/household-form";

export const metadata: Metadata = { title: "Household sign-up" };

/** Household sign-up screen. */
export default async function HouseholdJoinPage() {
  const google = (await getPendingGoogle()) ?? (await getPendingJoinProfile());
  return (
    <AuthShell>
      <BackLink href="/join/buyer" label="Back" />
      <h1 className="mt-4 text-[2.2rem] leading-[1] font-semibold tracking-tight sm:text-5xl">Create your account</h1>
      <p className="mt-3 text-muted-foreground">Takes under a minute. Your PIN keeps your account safe.</p>
      <div className="mt-7">
        <HouseholdForm google={google && { name: google.name, email: google.email }} />
      </div>
    </AuthShell>
  );
}
