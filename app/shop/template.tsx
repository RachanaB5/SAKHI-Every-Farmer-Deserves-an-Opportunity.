// Re-mounts on navigation inside /shop so each page animates in.
import { PageTransition } from "@/components/motion/page-transition";

/** Page enter transition for the consumer interface. */
export default function ShopTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
