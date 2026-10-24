// Route error boundary: friendly message, retry and a way home. The error
// digest is shown so a report can be matched to the server log.
"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Catches render / data errors below the root layout. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </span>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-muted-foreground">Nothing you did, this page hit an error loading. Your cart and orders are safe.</p>
      {error.digest && <p className="mt-3 font-mono text-xs text-muted-foreground">ref {error.digest}</p>}
      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Button size="lg" className="min-h-12" onClick={reset}>
          <RotateCcw /> Try again
        </Button>
        <Button asChild size="lg" variant="outline" className="min-h-12">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </main>
  );
}
