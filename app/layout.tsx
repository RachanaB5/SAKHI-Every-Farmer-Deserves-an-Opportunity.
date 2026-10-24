// Root layout: fonts (Latin + Devanagari + Kannada for the farmer UI),
// global providers, metadata and mobile viewport settings.
import type { Metadata, Viewport } from "next";
import {
  Fredoka,
  Geist,
  Geist_Mono,
  Instrument_Serif,
  Noto_Sans_Devanagari,
  Noto_Sans_Kannada,
  Nunito,
} from "next/font/google";
import { Providers } from "@/components/providers/providers";
import "./globals.css";

// Rounded, friendly type to match the storybook illustrations: Fredoka for headings, Nunito for text.
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// The FoodFlow wordmark and the landing page keep the original pairing: Geist with an Instrument Serif italic.
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const deva = Noto_Sans_Devanagari({
  variable: "--font-deva",
  subsets: ["devanagari"],
  preload: false,
});
const knda = Noto_Sans_Kannada({ variable: "--font-knda", subsets: ["kannada"], preload: false });

export const metadata: Metadata = {
  title: { default: "FoodFlow: from every harvest to every table", template: "%s · FoodFlow" },
  description:
    "AI-assisted fresh-produce marketplace connecting farmers directly with households, restaurants and community kitchens, with Sakhi, a voice companion for farmers in Kannada, Hindi and English.",
  applicationName: "FoodFlow",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6faf7" },
    { media: "(prefers-color-scheme: dark)", color: "#2a3a2e" },
  ],
};

/**
 * Root HTML shell shared by every route.
 * @param children - active route segment
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${nunito.variable} ${fredoka.variable} ${geist.variable} ${instrument.variable} ${geistMono.variable} ${deva.variable} ${knda.variable} h-full antialiased`}
    >
      <body className="grain flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
