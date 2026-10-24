// "How it works" — six steps from field to table. A progress line fills
// as you scroll through the section and each step lights up when reached.
"use client";

import { BadgeCheck, Mic, Recycle, ScanEye, ShoppingBasket, Wallet } from "lucide-react";
import { motion, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { useRef, useState } from "react";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: Mic, title: "Speak the harvest", body: "“50 kilo tamatar, aaj tode, 25 rupaye kilo.” FoodFlow fills the listing, the farmer checks every field." },
  { icon: ScanEye, title: "AI looks closely", body: "Photos or a short video get a visual quality score and flags like bruising or mould. Assistive, never a certificate." },
  { icon: BadgeCheck, title: "A person verifies", body: "Admins approve, reject or ask for changes. Duplicate photos are flagged. Nothing goes live unchecked." },
  { icon: ShoppingBasket, title: "Buyers order direct", body: "Households build smart baskets; kitchens post bulk demand and accept AI-ranked offers. Stock can't be double-sold." },
  { icon: Wallet, title: "OTP handover, then payout", body: "Riders deliver, the customer's code confirms it, and the farmer's settlement is created, with every fee shown." },
  { icon: Recycle, title: "Nothing goes to waste", body: "Slow-selling lots get flagged early and offered to community kitchens in one tap." },
];

/** Six-step explainer with scroll-linked progress. */
export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 55%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const [active, setActive] = useState(-1);
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(STEPS.length - 1, Math.floor(v * STEPS.length + 0.15))));

  return (
    <section id="how" className="scroll-mt-20 border-y bg-card/40 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">How it works</p>
          <h2 className="mt-3 max-w-3xl text-4xl leading-[1.02] font-semibold tracking-tight sm:text-5xl">
            Field to table in <span className="font-serif font-normal italic">six</span> honest steps.
          </h2>
        </Reveal>
        <div ref={ref} className="relative mt-14">
          <div className="absolute top-0 bottom-0 left-[22px] w-0.5 bg-border lg:top-[22px] lg:right-0 lg:bottom-auto lg:left-0 lg:h-0.5 lg:w-auto">
            <motion.div className="absolute inset-0 origin-top bg-lime lg:origin-left" style={{ scaleY: progress }} />
            <motion.div className="absolute inset-0 hidden origin-left bg-lime lg:block" style={{ scaleX: progress }} />
          </div>
          <ol className="grid gap-8 lg:grid-cols-6 lg:gap-5">
            {STEPS.map((s, i) => {
              const on = i <= active;
              return (
                <li key={s.title} className="relative pl-16 lg:pt-16 lg:pl-0">
                  <span
                    className={cn(
                      "absolute top-0 left-0 grid size-11 place-items-center rounded-2xl border-2 transition-all duration-500",
                      on ? "scale-110 border-lime bg-lime text-lime-foreground shadow-[0_0_30px_-6px_var(--lime)]" : "border-border bg-background text-muted-foreground",
                    )}
                  >
                    <s.icon className="size-5" />
                  </span>
                  <p className="font-mono text-xs text-muted-foreground">0{i + 1}</p>
                  <h3 className={cn("mt-1 text-lg leading-tight font-semibold transition-colors", !on && "text-foreground/70")}>{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
