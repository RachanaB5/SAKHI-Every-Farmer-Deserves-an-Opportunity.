// Re-mounts on navigation inside /bulk so each page animates in.
import { PageTransition } from "@/components/motion/page-transition";

/** Page enter transition for the restaurant & community interface. */
export default function BulkTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
