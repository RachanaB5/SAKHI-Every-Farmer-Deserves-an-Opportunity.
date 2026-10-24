// Admin interface layout: role guard + the two-bar top navigation shell.
import { TopNavShell } from "@/components/shell/top-nav-shell";
import { requirePageUser } from "@/lib/auth/page-guard";
import { publicUser } from "@/lib/auth/public-user";

/** Wraps every /admin page in the admin shell. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser(["ADMIN"], "/admin");
  return (
    <TopNavShell role="ADMIN" user={publicUser(user)}>
      {children}
    </TopNavShell>
  );
}
