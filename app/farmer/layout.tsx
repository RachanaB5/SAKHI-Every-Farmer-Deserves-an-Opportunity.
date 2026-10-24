// Farmer interface layout: role guard + the two-bar top navigation shell.
import { TopNavShell } from "@/components/shell/top-nav-shell";
import { requirePageUser } from "@/lib/auth/page-guard";
import { publicUser } from "@/lib/auth/public-user";
import { db } from "@/lib/db";

/** Wraps every /farmer page in the farmer shell. */
export default async function FarmerLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser(["FARMER"], "/farmer");
  const farm = await db.farmerProfile.findUnique({ where: { userId: user.id }, select: { village: true } });
  return (
    <TopNavShell role="FARMER" user={publicUser(user)} village={farm?.village ?? null}>
      {children}
    </TopNavShell>
  );
}
