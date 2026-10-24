// Re-mounts on navigation inside /admin so each page animates in.
import { PageTransition } from "@/components/motion/page-transition";

/** Page enter transition for the admin interface. */
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
