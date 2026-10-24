// FoodFlow wordmark + badge. Used in
// the landing nav, login and every app shell.
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** The standalone mark: the FoodFlow badge (public/brand/logo.svg — replace the file to change it). */
export function LogoMark({ className }: { className?: string }) {
  return <Image src="/brand/logo.svg" alt="" width={56} height={56} unoptimized priority className={cn("size-8 rounded-full", className)} />;
}

/**
 * Wordmark linking home.
 * @param href - destination (defaults to the landing page)
 * @param compact - hide the text, show only the mark
 */
export function Logo({
  href = "/",
  compact = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex items-center gap-2 font-semibold tracking-tight", className)}
      aria-label="FoodFlow home"
    >
      <LogoMark className="transition-transform duration-500 group-hover:rotate-[-8deg]" />
      {!compact && (
        // Fixed fonts: the wordmark must look identical on every page, whatever the page's own type.
        <span className="font-[family-name:var(--font-geist)] text-[17px] font-semibold tracking-tight">
          Food<span className="font-[family-name:var(--font-instrument)] text-[19px] font-normal italic">flow</span>
        </span>
      )}
    </Link>
  );
}
