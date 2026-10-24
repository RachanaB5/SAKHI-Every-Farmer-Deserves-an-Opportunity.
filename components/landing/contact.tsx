// "Connect with us": a real contact form. Messages are saved for the team
// (POST /api/contact); no account is needed.
"use client";

import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { Field, SelectField, TextField } from "@/components/auth/join/fields";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendJSON } from "@/lib/fetcher";

const TOPICS = [
  { value: "FARMER", label: "I'm a farmer or seller" },
  { value: "RESTAURANT", label: "I run a restaurant or kitchen" },
  { value: "HOUSEHOLD", label: "I'm a household customer" },
  { value: "PARTNERSHIP", label: "Partnership or press" },
  { value: "OTHER", label: "Something else" },
] as const;

/** Contact section on the landing page. */
export function ContactSection() {
  const [f, setF] = useState({ name: "", email: "", phone: "", topic: "FARMER", message: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      await sendJSON("/api/contact", f);
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  return (
    <section id="contact" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <Reveal>
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Get in touch</p>
          <h2 className="mt-3 text-3xl leading-[1.05] font-semibold tracking-tight sm:text-4xl">
            Connect with <span className="font-serif font-normal italic">us.</span>
          </h2>
          <p className="mt-4 max-w-md text-muted-foreground">Questions about selling, buying for your kitchen, or working together? Tell us a little and we&apos;ll get back to you.</p>
          <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
            <li>Based in Bengaluru, Karnataka</li>
            <li>Live in Yelahanka, Hebbal and Jayanagar</li>
          </ul>
        </Reveal>

        <Reveal delay={0.1}>
          {state === "sent" ? (
            <div role="status" className="flex flex-col items-center rounded-3xl border bg-card px-6 py-14 text-center">
              <CheckCircle2 className="size-12 text-success" />
              <p className="mt-4 text-xl font-semibold">Thanks, we&apos;ve got your message.</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">We&apos;ll reply using the email or phone number you gave us.</p>
              <Button variant="outline" className="mt-6" onClick={() => { setF({ name: "", email: "", phone: "", topic: "FARMER", message: "" }); setState("idle"); }}>
                Send another message
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-4 rounded-3xl border bg-card p-5 sm:p-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Your name" id="c-name" autoComplete="name" value={f.name} onChange={set("name")} />
                <SelectField label="I'm reaching out as" id="c-topic" value={f.topic} onChange={set("topic")} options={TOPICS} />
                <TextField label="Email" id="c-email" type="email" autoComplete="email" value={f.email} onChange={set("email")} />
                <TextField label="Phone (optional if you gave an email)" id="c-phone" inputMode="tel" autoComplete="tel-national" value={f.phone} onChange={set("phone")} />
              </div>
              <Field label="Message" id="c-msg">
                <Textarea id="c-msg" rows={5} maxLength={1000} value={f.message} onChange={(e) => set("message")(e.target.value)} />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" variant="brand" className="w-full sm:w-auto" disabled={state === "sending"}>
                {state === "sending" ? <Loader2 className="animate-spin" /> : <Send />} Send message
              </Button>
            </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}
