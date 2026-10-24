// /terms — pilot terms of use, written to match how the marketplace works today.
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of use" };

/** Terms of use. */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="21 October 2026">
      <p>These terms apply to your use of the FoodFlow pilot. By creating an account or placing an order you agree to them.</p>

      <h2>Accounts</h2>
      <ul>
        <li>Give accurate details and keep your PIN private. You are responsible for what happens under your account.</li>
        <li>FoodFlow may suspend an account that breaks these terms or puts others at risk.</li>
      </ul>

      <h2>Sellers</h2>
      <ul>
        <li>List only produce you are allowed to sell, describe it honestly and keep quantities and availability accurate.</li>
        <li>Every harvest is reviewed by FoodFlow before buyers can see it, and we may ask for changes or decline a listing.</li>
        <li>You are responsible for any licences your activity needs, such as FSSAI registration where it applies.</li>
        <li>FoodFlow keeps a 5% platform fee on each sale. The delivery share is shown on each order. Sellers are paid after the handover is verified, in the next settlement.</li>
      </ul>

      <h2>Buyers</h2>
      <ul>
        <li>Prices and fees are shown before you confirm an order. Delivery happens only in areas FoodFlow serves.</li>
        <li>Deliveries are completed with a one-time code (OTP) that you give the rider. Do not share it with anyone else.</li>
        <li>If something is wrong with an order, report it in the app so that we can look into it and, where appropriate, refund you.</li>
      </ul>

      <h2>AI guidance</h2>
      <p>Price suggestions and visual quality scores are indicative. They are not a certificate of freshness or food safety, and the final decision on price, quality and acceptance is yours.</p>

      <h2>Fair use</h2>
      <p>Do not upload misleading photos, abuse other users, or try to get around the verification or OTP steps.</p>

      <h2>Changes and contact</h2>
      <p>These are pilot terms and will change as FoodFlow grows. We will update the date above when they do. Questions? Use the contact form on the home page.</p>
    </LegalPage>
  );
}
