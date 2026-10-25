import { PageTransition } from "@/components/motion/page-transition";

export default function ShopTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
