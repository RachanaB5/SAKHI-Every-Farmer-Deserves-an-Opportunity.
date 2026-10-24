// The site footer, in the brand's dark green. `full` (landing and legal pages)
// has the mission line and link columns; `compact` sits under every signed-in
// interface with just the legal and contact links. The logo lives in the top
// bar of each page, so the footer never repeats it.
import Link from "next/link";
import { cn } from "@/lib/utils";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Marketplace",
    links: [
      { href: "/join/seller", label: "Sell on FoodFlow" },
      { href: "/join/buyer/household", label: "Shop as a household" },
      { href: "/join/buyer/restaurant", label: "Register your kitchen" },
      { href: "/login", label: "Sign in" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#interfaces", label: "Who it's for" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/#contact", label: "Connect with us" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of use" },
    ],
  },
];

/**
 * @param variant - "full" with link columns, or "compact" for inside the app
 * @param className - extra classes (e.g. bottom padding above a fixed tab bar)
 */
export function SiteFooter({ variant = "full", className }: { variant?: "full" | "compact"; className?: string }) {
  const year = new Date().getFullYear();
  if (variant === "compact") {
    return (
      <footer className={cn("dark border-t bg-background text-foreground print:hidden", className)}>
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <p>© {year} All rights reserved.</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/#contact" className="hover:text-foreground">
              Contact
            </Link>
          </nav>
        </div>
      </footer>
    );
  }
  return (
    <footer className={cn("dark border-t bg-background text-foreground", className)}>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)] lg:px-8">
        <div>
          <p className="max-w-xs text-lg leading-snug font-semibold tracking-tight">From every harvest to every table.</p>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">A farm-to-table marketplace that connects farmers directly with households, restaurants and community kitchens.</p>
          <p className="mt-4 text-sm text-muted-foreground">Bengaluru, Karnataka, India</p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-sm font-semibold">{c.title}</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-5 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <p>© {year} All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
