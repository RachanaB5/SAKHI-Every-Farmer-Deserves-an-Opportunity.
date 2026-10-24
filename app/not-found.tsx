// 404 page: a dropped tomato rolling off the table, plus ways back.
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

/** Shown for unknown routes and `notFound()` calls. */
export default function NotFound() {
  return (
    <main className="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-20 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_40%,color-mix(in_oklch,var(--lime)_22%,transparent),transparent)]" />
      <Logo className="mb-12" />
      <div aria-hidden className="relative mb-8 h-24 w-56">
        <span className="absolute bottom-0 left-0 h-1.5 w-full rounded-full bg-foreground/15" />
        <span className="absolute bottom-1.5 left-4 size-14 animate-roll rounded-full bg-tomato shadow-[inset_-8px_-8px_0_rgb(0_0_0/0.12)]">
          <span className="absolute -top-1.5 left-1/2 h-3 w-5 -translate-x-1/2 rounded-full bg-lime" />
        </span>
      </div>
      <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">404</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
        This one rolled <span className="font-serif font-normal italic">off the table.</span>
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">The page you&apos;re after doesn&apos;t exist, or the listing has sold out and moved on.</p>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Button asChild size="lg" className="min-h-12">
          <Link href="/">Back to FoodFlow</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="min-h-12">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
