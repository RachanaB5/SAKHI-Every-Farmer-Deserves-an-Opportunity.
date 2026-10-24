// /login — "buy or sell?" first; existing members can sign in with phone + PIN.
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { Gateway } from "@/components/auth/gateway";
import { getPendingJoinProfile } from "@/lib/auth/firebase-pending";
import { getPendingGoogle } from "@/lib/auth/google";

export const metadata: Metadata = { title: "Sign in" };

/** Sign-in screen. `?next=` carries the page the proxy bounced the visitor from. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; google?: string; firebase?: string }> }) {
  const { next, error, google, firebase } = await searchParams;
  const pending = google ? await getPendingGoogle() : firebase ? await getPendingJoinProfile() : null;
  return (
    <AuthShell>
      <Gateway next={next} google={pending && { name: pending.name, email: pending.email }} error={error} />
    </AuthShell>
  );
}
