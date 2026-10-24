// Page title block used at the top of every in-app screen. Words wrapped
// in *asterisks* get the italic serif accent; actions wrap under the title
// on phones.
"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { WordReveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

/**
 * @param title - heading text (supports *accent* words)
 * @param eyebrow - small label above the title
 * @param back - optional back link
 * @param actions - buttons rendered beside (desktop) or below (mobile) the title
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  back,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-full pr-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> {back.label}
          </Link>
        )}
        {eyebrow && <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</div>}
        <h1 className="text-[1.75rem] leading-[1.05] font-semibold tracking-tight break-words sm:text-4xl">
          <WordReveal text={title} />
        </h1>
        {description && <div className="mt-2 max-w-2xl text-[15px] text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
