// The first screen after "Sign in": are you here to buy or to sell? Existing
// members can sign in right below without choosing.
"use client";

import { ArrowRight, Mic, ShoppingBasket, Sprout } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FirebaseAuthPanel } from "@/components/auth/firebase-auth-panel";
import { LoginForm } from "@/components/auth/login-form";
import { WordReveal } from "@/components/motion/reveal";
import { sendJSON } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

const CARDS = [
  { href: "/join/buyer", icon: ShoppingBasket, title: "Buyer", body: "Buy fresh produce for yourself, your family or your business." },
  { href: "/join/seller", icon: Sprout, title: "Seller", body: "Sell your produce directly to customers, restaurants and other buyers." },
] as const;

const ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up on this site yet. Please use your mobile number and PIN.",
  google_cancelled: "Google sign-in was cancelled.",
  google_failed: "We couldn't sign you in with Google. Please try again.",
  suspended: "This account is suspended. Please contact us.",
};

/**
 * @param next - path to return to after signing in (from the proxy redirect)
 * @param google - a Google profile waiting to be used for a new account
 * @param error - code from a failed Google attempt
 */
export function Gateway({ next, google, error }: { next?: string; google?: { name: string; email: string } | null; error?: string }) {
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  async function notMe() {
    await sendJSON("/api/auth/google/pending", undefined, "DELETE").catch(() => {});
    router.replace("/login");
    router.refresh();
  }
  return (
    <>
      <h1 className="text-[2.4rem] leading-[1] font-semibold tracking-tight sm:text-5xl">
        <WordReveal text="Welcome to *FoodFlow.*" />
      </h1>
      <p className="mt-3 max-w-md text-lg text-muted-foreground">Who are you joining as?</p>
      {error && ERRORS[error] && (
        <p role="alert" className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {ERRORS[error]}
        </p>
      )}
      {google && (
        <p role="status" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border bg-card px-4 py-3 text-sm">
          <span>
            Signed in with Google as <b>{google.name}</b> ({google.email}). Choose how you&apos;re joining.
          </span>
          <button type="button" onClick={notMe} className="font-medium underline underline-offset-4">
            Not you?
          </button>
        </p>
      )}

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link key={c.title} href={c.href} className="group flex min-h-44 flex-col rounded-3xl border bg-card p-5 transition-all hover:border-foreground/40 hover:shadow-lg">
            <span className="grid size-12 place-items-center rounded-2xl bg-lime/30">
              <c.icon className="size-6" />
            </span>
            <span className="mt-4 text-2xl font-semibold tracking-tight">{c.title}</span>
            <span className="mt-1 text-[15px] text-muted-foreground">{c.body}</span>
            {c.title === "Seller" && (
              <span className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-lime/30 px-2.5 py-1 text-xs font-medium">
                <Mic className="size-3.5" /> Sakhi helps by voice in ಕನ್ನಡ, हिंदी and English
              </span>
            )}
            <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-semibold">
              Continue <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">You can use both later and switch between buying and selling.</p>

      {!google && <FirebaseAuthPanel next={next} />}

      <div className="mt-8 border-t pt-6">
        <button type="button" aria-expanded={signingIn} onClick={() => setSigningIn((v) => !v)} className={cn("text-[15px] font-semibold underline-offset-4 hover:underline", signingIn && "underline")}>
          I already have an account
        </button>
        {signingIn && (
          <div className="mt-5">
            <LoginForm next={next} />
          </div>
        )}
      </div>
    </>
  );
}
