// /farmer/listings — the farmer's live, paused and sold-out listings.
import type { Metadata } from "next";
import { FarmerListings } from "@/components/farmer/listings";

export const metadata: Metadata = { title: "My listings" };

/** Listings page. */
export default function ListingsPage() {
  return <FarmerListings />;
}
