// Landing page: photographic hero, live mandi ticker, the scroll-driven farm-to-table story, who
// FoodFlow is for, how it works, a field-to-plate photo story, a contact form and
// the footer. Data is read live from the database on each request.
import { SiteFooter } from "@/components/common/site-footer";
import { ContactSection } from "@/components/landing/contact";
import { FarmStory } from "@/components/landing/farm-story/farm-story";
import { FieldStory } from "@/components/landing/field-story";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Interfaces } from "@/components/landing/interfaces";
import { LandingNav } from "@/components/landing/nav";
import { MandiTicker } from "@/components/landing/ticker";
import { getImpactStats, getMandiTicker } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** Public home page. */
export default async function Home() {
  const [stats, ticker] = await Promise.all([getImpactStats(), getMandiTicker()]);
  return (
    <div className="theme-classic">
      <LandingNav />
      <main className="flex-1">
        <Hero stats={stats} />
        <MandiTicker items={ticker} />
        <FarmStory />
        <Interfaces />
        <HowItWorks />
        <FieldStory />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}
