// Server-component guard for role layouts: returns the signed-in user or
// redirects. The proxy already checks the cookie; this re-checks the DB
// (suspended users, deleted accounts) and gives layouts the user row.
import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./session";
import { ROLE_HOME, type Role } from "./token";

/**
 * @param roles - roles allowed on this page tree
 * @param from - path to return to after sign-in
 */
export async function requirePageUser(roles: Role[], from: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(from)}`);
  if (!roles.includes(user.role as Role)) redirect(ROLE_HOME[user.role as Role]);
  return user;
}
