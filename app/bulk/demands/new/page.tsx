// /bulk/demands/new — post a requirement by form, voice or list.
import type { Metadata } from "next";
import { PostDemand } from "@/components/bulk/post-demand";
import { ClientOnly } from "@/components/common/client-only";
import { RouteLoading } from "@/components/common/route-loading";

export const metadata: Metadata = { title: "Post requirement" };

/** Post page (client-only: deadlines use the buyer's local clock). */
export default function NewDemandPage() {
  return (
    <ClientOnly fallback={<RouteLoading />}>
      <PostDemand />
    </ClientOnly>
  );
}
