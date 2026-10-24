// "One marketplace, five apps": compact cards for each way of using FoodFlow,
// each with a small photo, a one-line pitch and a real call to action that
// starts that kind of sign-up. (The rider app is mentioned underneath: riders
// are onboarded by the team, not self-serve.)
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Photo } from "@/components/common/photo";
import { Reveal } from "@/components/motion/reveal";
import type { Role } from "@/lib/auth/token";
import type { PhotoName } from "@/lib/photos";
import { ROLE_ICON } from "@/lib/role-icons";

const CARDS: { role: Role; title: string; body: string; points: string[]; photo: PhotoName; position: string; cta: { href: string; label: string } }[] = [
  {
    role: "FARMER",
    title: "Farmers",
    body: "List a harvest by voice in your language and get a fair, indicative price.",
    points: ["Voice listing", "AI visual check"],
    photo: "farmer-lettuce",
    position: "60% 40%",
    cta: { href: "/join/seller", label: "Start selling" },
  },
  {
    role: "CONSUMER",
    title: "Households",
    body: "Snap a grocery list and get the freshest basket from nearby farms.",
    points: ["Smart basket", "OTP doorstep handover"],
    photo: "market-woman",
    position: "30% 40%",
    cta: { href: "/join/buyer/household", label: "Start shopping" },
  },
  {
    role: "BULK_BUYER",
    title: "Restaurants & kitchens",
    body: "Post what your kitchen needs and compare ranked offers from farmers.",
    points: ["Recurring demand", "Invoices"],
    photo: "chef-hands",
    position: "50% 45%",
    cta: { href: "/join/buyer/restaurant", label: "Register your kitchen" },
  },
  {
    role: "ADMIN",
    title: "Trust & safety",
    body: "A person verifies every harvest. Duplicate photos and price outliers are flagged.",
    points: ["Review queue", "Disputes & refunds"],
    photo: "crate-hands",
    position: "50% 60%",
    cta: { href: "#how", label: "How we verify" },
  },
];

/** Section with the four main interfaces + rider note. */
export function Interfaces() {
  return (
    <section id="interfaces" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <Reveal>
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">One marketplace, five apps</p>
        <h2 className="mt-3 max-w-3xl text-3xl leading-[1.05] font-semibold tracking-tight sm:text-4xl">
          Built for everyone who <span className="font-serif font-normal italic">feeds</span> a city.
        </h2>
      </Reveal>
      <div className="mt-8 grid gap-3 md:grid-cols-2">
        {CARDS.map((c, i) => {
          const Icon = ROLE_ICON[c.role];
          return (
            <Reveal key={c.role} delay={i * 0.06} className="h-full">
              <article className="flex h-full gap-4 rounded-3xl border bg-card p-3 sm:p-4">
                <Photo name={c.photo} position={c.position} sizes="112px" className="size-24 shrink-0 rounded-2xl sm:size-28" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                    <span className="grid size-7 place-items-center rounded-lg bg-lime/40">
                      <Icon className="size-4" />
                    </span>
                    {c.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {c.points.map((p) => (
                      <li key={p} className="rounded-full border px-2.5 py-0.5 text-xs">
                        {p}
                      </li>
                    ))}
                  </ul>
                  <Link href={c.cta.href} className="group mt-auto inline-flex min-h-9 items-center gap-1.5 self-start pt-2 text-sm font-semibold">
                    {c.cta.label}
                    <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
      <Reveal delay={0.15}>
        <p className="mt-4 rounded-3xl border bg-card px-5 py-4 text-sm text-muted-foreground">
          <b className="text-foreground">…and a rider app that can&apos;t be faked.</b> An order code or voice alone never marks a delivery done. Only the customer&apos;s OTP does.
        </p>
      </Reveal>
    </section>
  );
}
