// Re-mounts on navigation inside /delivery so each page animates in.
import { PageTransition } from "@/components/motion/page-transition";

/** Page enter transition for the delivery interface. */
export default function DeliveryTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
