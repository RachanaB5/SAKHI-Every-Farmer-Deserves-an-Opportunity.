// /register — kept so old links work; joining now starts at /login (buy or sell).
import { redirect } from "next/navigation";

/** Redirects to the sign-in / join gateway. */
export default function RegisterPage() {
  redirect("/login");
}
