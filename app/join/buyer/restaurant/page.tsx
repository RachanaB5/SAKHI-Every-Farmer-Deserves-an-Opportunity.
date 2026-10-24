// /join/buyer/restaurant — business and address details for a restaurant,
// hostel or community kitchen.
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { getPendingGoogle } from "@/lib/auth/google";
import { getPendingJoinProfile } from "@/lib/auth/firebase-pending";
import { BackLink } from "@/components/auth/join/back-link";
import { RestaurantForm } from "@/components/auth/join/restaurant-form";

export const metadata: Metadata = { title: "Restaurant sign-up" };

/** Restaurant sign-up screen. */
export default async function RestaurantJoinPage() {
  const google = (await getPendingGoogle()) ?? (await getPendingJoinProfile());
  return (
    <AuthShell width="max-w-2xl">
      <BackLink href="/join/buyer" label="Back" />
      <h1 className="mt-4 text-[2.2rem] leading-[1] font-semibold tracking-tight sm:text-5xl">Register your kitchen</h1>
      <p className="mt-3 text-muted-foreground">Tell us where to deliver and a little about your business. You can post requirements as soon as you&apos;re in.</p>
      <div className="mt-7">
        <RestaurantForm google={google && { name: google.name, email: google.email }} />
      </div>
    </AuthShell>
  );
}
