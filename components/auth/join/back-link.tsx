// "← Back" link used at the top of the join screens.
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/** Small back link. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex min-h-9 items-center gap-1.5 rounded-full pr-3 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> {label}
    </Link>
  );
}
