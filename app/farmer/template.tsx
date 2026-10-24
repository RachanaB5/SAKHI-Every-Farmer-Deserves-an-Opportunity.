// Re-mounts on navigation inside /farmer so each page animates in.
import { PageTransition } from "@/components/motion/page-transition";

/** Page enter transition for the farmer interface. */
export default function FarmerTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
