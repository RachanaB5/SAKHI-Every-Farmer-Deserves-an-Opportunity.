// Text messages (verification codes). Providers, picked by SMS_PROVIDER:
//   • msg91   — India; needs a DLT-approved template with an {otp} variable
//   • twilio  — any country; plain message body
//   • console — no SMS at all: the code is logged and shown on screen, for
//               development and clearly-labelled demos only
// Without SMS_PROVIDER, development uses `console` and production refuses to
// send (a real deployment must not show codes on screen).
import "server-only";
import { HttpError } from "@/lib/api";

export type SmsProvider = "msg91" | "twilio" | "console";

/** The provider in use, or null when production has none configured. */
export function smsProvider(): SmsProvider | null {
  const p = process.env.SMS_PROVIDER?.trim().toLowerCase();
  if (p === "msg91" || p === "twilio" || p === "console") return p;
  return process.env.NODE_ENV === "production" ? null : "console";
}

/** Whether codes are shown on screen instead of texted (no real SMS). */
export const smsIsDemo = () => smsProvider() === "console";

/**
 * Texts a verification code.
 * @param phone - 10-digit Indian mobile number
 */
export async function sendCodeSms(phone: string, code: string): Promise<void> {
  const provider = smsProvider();
  if (!provider) throw new HttpError(503, "Text messages aren't set up on this server yet. Please try again later.");
  const text = `${code} is your FoodFlow verification code. It expires in 10 minutes. Don't share it with anyone.`;
  if (provider === "console") {
    console.info(`[sms:console] to ${phone.slice(0, 2)}xxxxxx${phone.slice(-2)}: ${text}`);
    return;
  }
  const res =
    provider === "msg91"
      ? await fetch("https://control.msg91.com/api/v5/flow", {
          method: "POST",
          headers: { authkey: required("MSG91_AUTH_KEY"), "content-type": "application/json" },
          body: JSON.stringify({ template_id: required("MSG91_TEMPLATE_ID"), short_url: "0", recipients: [{ mobiles: `91${phone}`, otp: code }] }),
          signal: AbortSignal.timeout(10_000),
        })
      : await fetch(`https://api.twilio.com/2010-04-01/Accounts/${required("TWILIO_ACCOUNT_SID")}/Messages.json`, {
          method: "POST",
          headers: {
            authorization: `Basic ${Buffer.from(`${required("TWILIO_ACCOUNT_SID")}:${required("TWILIO_AUTH_TOKEN")}`).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: `+91${phone}`, From: required("TWILIO_FROM"), Body: text }),
          signal: AbortSignal.timeout(10_000),
        });
  if (!res.ok) {
    console.error(`[sms:${provider}] send failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
    throw new HttpError(502, "We couldn't send the text message. Please try again in a minute.");
  }
}

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new HttpError(503, "Text messages aren't set up on this server yet. Please try again later.");
  return v;
}
