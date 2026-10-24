// /join/buyer — are you buying for a household or for a restaurant / kitchen?
import type { Metadata } from "next";
import { ArrowRight, Home, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { BackLink } from "@/components/auth/join/back-link";

export const metadata: Metadata = { title: "Join as a buyer" };

const CARDS = [
  { href: "/join/buyer/household", icon: Home, title: "Household customer", body: "Buy fresh produce for your family and get it delivered." },
  { href: "/join/buyer/restaurant", icon: UtensilsCrossed, title: "Restaurant or kitchen", body: "Restaurants, hostels and community kitchens: post what you need and compare offers from farmers." },
] as const;

/** Buyer type choice. */
export default function BuyerChoicePage() {
  return (
    <AuthShell>
      <BackLink href="/login" label="Back" />
      <h1 className="mt-4 text-[2.2rem] leading-[1] font-semibold tracking-tight sm:text-5xl">What kind of buyer are you?</h1>
      <div className="mt-7 grid gap-3">
        {CARDS.map((c) => (
          <Link key={c.title} href={c.href} className="group flex items-start gap-4 rounded-3xl border bg-card p-5 transition-all hover:border-foreground/40 hover:shadow-lg">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-lime/30">
              <c.icon className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-semibold tracking-tight">{c.title}</span>
              <span className="mt-1 block text-[15px] text-muted-foreground">{c.body}</span>
            </span>
            <ArrowRight className="mt-1 size-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </AuthShell>
  );
}
