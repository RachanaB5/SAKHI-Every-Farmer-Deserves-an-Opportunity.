// Delivery interface layout: role guard + the phone-style rider app shell.
import { AppShell } from "@/components/shell/app-shell";
import { requirePageUser } from "@/lib/auth/page-guard";
import { publicUser } from "@/lib/auth/public-user";

/** Wraps every /delivery page in the delivery shell. */
export default async function DeliveryLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser(["DELIVERY"], "/delivery");
  return (
    <AppShell role={"DELIVERY"} user={publicUser(user)}>
      {children}
    </AppShell>
  );
}
