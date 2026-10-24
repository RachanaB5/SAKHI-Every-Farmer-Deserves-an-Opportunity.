// Landing hero: real farm-to-table photography with the headline, CTAs and
// live proof points. On desktop the photo fills the section behind the
// text; on phones it sits above it (so it stays sharp) and fades into the
// dark panel. The OTP and admin-verification chips are live links, not
// part of the picture.
"use client";

import { ArrowDown, ArrowRight, BadgeCheck, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Photo } from "@/components/common/photo";
import { CountUp } from "@/components/motion/count-up";
import { WordReveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import type { ImpactStats } from "@/lib/stats";

/** Hero section. The `dark` class re-themes it so the text is light over the photo in both site themes. */
export function Hero({ stats }: { stats: ImpactStats }) {
  return (
    <section className="dark relative isolate overflow-hidden bg-background text-foreground">
      <div className="relative h-72 sm:h-96 lg:absolute lg:inset-0 lg:h-auto">
        <Photo name="field-sunrise" priority sizes="100vw" position="78% 50%" className="size-full" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent lg:bg-gradient-to-r lg:from-background/90 lg:via-background/55 lg:to-background/5" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 hidden h-40 bg-gradient-to-t from-background to-transparent lg:block" />
      </div>

      <div className="relative mx-auto flex max-w-7xl flex-col px-4 pb-14 sm:px-6 lg:min-h-[min(100dvh,50rem)] lg:justify-center lg:px-8 lg:pt-24 lg:pb-16">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="-mt-6 flex flex-wrap gap-2 lg:mt-0">
          <a href="#how" className="glass inline-flex min-h-9 items-center gap-2 rounded-full border px-3 font-mono text-[11px] transition-colors hover:border-lime/60">
            <ShieldCheck className="size-4 text-lime" /> FF-7K2QA · delivered with OTP ✓
          </a>
          <a href="#how" className="glass inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs transition-colors hover:border-lime/60">
            <BadgeCheck className="size-4 text-lime" /> Every listing admin-verified
          </a>
        </motion.div>

        <h1 className="mt-5 max-w-3xl text-[2.65rem] leading-[0.98] font-semibold tracking-[-0.03em] sm:text-6xl lg:text-7xl xl:text-[5.25rem]">
          <WordReveal text="From every *harvest* to every *table.*" />
        </h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-6 max-w-xl text-lg leading-relaxed text-foreground/80">
          Farmers list harvests by voice. AI checks the produce, admins verify it, and households, restaurants and community kitchens buy direct, with every handover OTP-verified and nothing left to rot.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85 }} className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="brand" className="h-14 rounded-2xl px-7 text-base">
            <Link href="/login">
              Get started <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-14 rounded-2xl bg-background/40 px-7 text-base backdrop-blur">
            <a href="#how">
              How it works <ArrowDown />
            </a>
          </Button>
        </motion.div>
        <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-foreground/15 pt-6">
          {[
            { k: "Farmers onboarded", v: stats.farmers, f: (n: number) => Math.round(n).toString() },
            { k: "Kg sold direct", v: stats.kgSold, f: (n: number) => Math.round(n).toLocaleString("en-IN") },
            { k: "Of each ₹ to the farmer", v: stats.farmerShare, f: (n: number) => `${Math.round(n)}%` },
          ].map((s) => (
            <div key={s.k}>
              <dd className="tabular text-2xl font-semibold tracking-tight sm:text-3xl">
                <CountUp value={s.v} format={s.f} />
              </dd>
              <dt className="mt-0.5 text-xs leading-snug text-foreground/70">{s.k}</dt>
            </div>
          ))}
        </motion.dl>
      </div>
    </section>
  );
}
