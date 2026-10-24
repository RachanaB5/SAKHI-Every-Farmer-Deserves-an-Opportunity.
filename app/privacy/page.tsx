// /privacy — what FoodFlow collects and why, written to match what the app does today.
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

/** Privacy policy. */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="21 October 2026">
      <p>FoodFlow connects farmers with households, restaurants and community kitchens. This page explains what we collect while you use the FoodFlow pilot, and what we do with it.</p>

      <h2>What we collect</h2>
      <ul>
        <li>Your name, mobile number and language, and a PIN (stored only as a one-way hash, never in readable form).</li>
        <li>Addresses you save, and your location if you allow your browser to share it.</li>
        <li>For sellers: farm or business details, produce, supply and delivery preferences, and any licence number you choose to give.</li>
        <li>For restaurants: business name, address and optional licence or GST numbers.</li>
        <li>Orders, deliveries, payments and settlements made through FoodFlow.</li>
        <li>Photos or videos of produce you list, and the text of voice listings.</li>
        <li>Messages you send us through the contact form.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run your account, show nearby farms and fees, take and deliver orders, and pay sellers.</li>
        <li>To check produce listings, prevent duplicate or misleading listings and resolve disputes.</li>
        <li>To give price guidance and quality checks. These may be produced by an AI service; see below.</li>
        <li>To reply to you and to improve FoodFlow.</li>
      </ul>

      <h2>Location</h2>
      <p>We only ask for your live location after you press the location control in the top bar or when you open the app, and only your browser can grant it. You can say no, and type an address instead. When you share a location we send the coordinates to our server and to OpenStreetMap&apos;s Nominatim service to turn them into a place name.</p>

      <h2>Other services that may see your data</h2>
      <ul>
        <li>An AI provider (currently Google Gemini, when enabled) may receive produce photos and listing text so that it can check quality and suggest prices. When it is not enabled, simpler checks run on our own servers.</li>
        <li>Your browser&apos;s speech recognition may send voice to its vendor to turn it into text.</li>
        <li>OpenStreetMap Nominatim, as described under Location.</li>
      </ul>

      <h2>Bank and payment details</h2>
      <p>The setup forms do not ask for bank account numbers, UPI PINs, passwords or OTPs for payouts, and we will never ask you for them. Payout details are handled by a payment provider&apos;s own secure process.</p>

      <h2>Cookies</h2>
      <p>We use one essential cookie to keep you signed in. We also keep your theme choice and unfinished setup answers on your device.</p>

      <h2>Your choices</h2>
      <p>You can change your language and addresses in the app at any time. To ask us to correct or delete your data, use the contact form on the home page.</p>

      <p>This policy describes the FoodFlow pilot as it works today and will be updated as the service grows.</p>
    </LegalPage>
  );
}
