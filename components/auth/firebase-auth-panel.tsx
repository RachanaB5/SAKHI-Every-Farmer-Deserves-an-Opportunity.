"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendJSON } from "@/lib/fetcher";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  completeEmailLinkSignIn,
  createEmailAccount,
  sendEmailSignInLink,
  signInWithEmail,
  signInWithGoogle,
} from "@/lib/firebase/auth";
import { sendEmailVerification, signOut } from "firebase/auth";

type Mode = "sign-in" | "create" | "email-link";

function safeNext(next?: string): string | undefined {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
}

export function FirebaseAuthPanel({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didProcessEmailLink = useRef(false);

  const finishSignIn = useCallback(async (credential: Awaited<ReturnType<typeof signInWithGoogle>>) => {
    const result = await sendJSON<{ onboardingRequired: boolean; redirect: string }>("/api/auth/firebase/session", {
      idToken: await credential.user.getIdToken(true),
    });
    toast.success(result.onboardingRequired ? "Choose how you want to use FoodFlow." : `Welcome back, ${credential.user.displayName?.split(" ")[0] || "to FoodFlow"}!`);
    router.replace(result.onboardingRequired ? result.redirect : safeNext(next) ?? result.redirect);
    router.refresh();
  }, [next, router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (didProcessEmailLink.current || params.get("mode") !== "signIn" || !params.has("oobCode")) return;
    didProcessEmailLink.current = true;
    completeEmailLinkSignIn(window.location.href)
      .then((credential) => (credential ? finishSignIn(credential) : null))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Email sign-in failed."))
      .finally(() => setBusy(false));
  }, [finishSignIn]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Firebase:\s*/, "") : "Firebase sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "email-link") {
      await run(async () => {
        await sendEmailSignInLink(email);
        toast.success("Check your inbox for a sign-in link.");
      });
      return;
    }

    await run(async () => {
      if (mode === "create") {
        const credential = await createEmailAccount(email, password);
        await sendEmailVerification(credential.user);
        await signOut(getFirebaseAuth());
        toast.success("Check your inbox to verify your email, then sign in to finish setting up your account.");
        setMode("sign-in");
        setPassword("");
        return;
      }
      await finishSignIn(await signInWithEmail(email, password));
    });
  }

  return (
    <section className="mt-6 rounded-3xl border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Sign in with Firebase</h2>
      <p className="mt-1 text-sm text-muted-foreground">Use Google, email and password, or a passwordless email link.</p>
      <Button
        type="button"
        variant="outline"
        className="mt-4 w-full"
        disabled={busy}
        onClick={() => run(async () => finishSignIn(await signInWithGoogle()))}
      >
        Continue with Google
      </Button>

      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or email
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" variant={mode === "sign-in" ? "secondary" : "ghost"} size="sm" onClick={() => setMode("sign-in")}>Password</Button>
        <Button type="button" variant={mode === "create" ? "secondary" : "ghost"} size="sm" onClick={() => setMode("create")}>Create account</Button>
        <Button type="button" variant={mode === "email-link" ? "secondary" : "ghost"} size="sm" onClick={() => setMode("email-link")}>Email link</Button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="firebase-email">Email</Label>
          <Input id="firebase-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        {mode !== "email-link" && (
          <div className="space-y-1.5">
            <Label htmlFor="firebase-password">Password</Label>
            <Input
              id="firebase-password"
              type="password"
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              minLength={6}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : mode === "create" ? "Create email account" : mode === "email-link" ? <><Mail /> Send sign-in link</> : "Sign in with email"}
        </Button>
      </form>
    </section>
  );
}
