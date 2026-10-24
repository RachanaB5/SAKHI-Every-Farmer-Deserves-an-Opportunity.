// Phone verification before sign-up / PIN reset: codes are single-use, expire,
// limit tries and resends, and only a proven number can create an account.
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
}));

const { db } = await import("@/lib/db");
const { checkPhoneCode, phoneIsVerified, rememberVerifiedPhone, sendPhoneCode, CODE_MAX_ATTEMPTS } = await import("@/lib/auth/phone-code");
const { accountCredentials } = await import("@/lib/auth/new-account");

let n = 0;
const freshPhone = () => `9${String(Date.now()).slice(-7)}${String(++n).padStart(2, "0")}`;

beforeEach(() => jar.clear());

describe("phone codes", () => {
  it("texts a code (shown on screen without an SMS provider) that proves the number once", async () => {
    const phone = freshPhone();
    const { demoCode, resendInSeconds } = await sendPhoneCode(phone, "SIGNUP");
    expect(demoCode).toMatch(/^\d{6}$/);
    expect(resendInSeconds).toBe(30);
    const row = await db.phoneCode.findFirstOrThrow({ where: { phone } });
    expect(row.codeHash).not.toContain(demoCode!);
    await checkPhoneCode(phone, "SIGNUP", demoCode!);
    await expect(checkPhoneCode(phone, "SIGNUP", demoCode!)).rejects.toThrow(/expired/);
  });

  it("counts wrong tries and locks the code after five", async () => {
    const phone = freshPhone();
    const { demoCode } = await sendPhoneCode(phone, "SIGNUP");
    const wrong = demoCode === "000000" ? "111111" : "000000";
    await expect(checkPhoneCode(phone, "SIGNUP", wrong)).rejects.toThrow(/4 tries left/);
    for (let i = 1; i < CODE_MAX_ATTEMPTS; i++) await expect(checkPhoneCode(phone, "SIGNUP", wrong)).rejects.toThrow();
    await expect(checkPhoneCode(phone, "SIGNUP", demoCode!)).rejects.toThrow(/Too many wrong tries/);
  });

  it("makes people wait before another code, and retires the old one", async () => {
    const phone = freshPhone();
    const first = await sendPhoneCode(phone, "RESET");
    await expect(sendPhoneCode(phone, "RESET")).rejects.toThrow(/wait/);
    await db.phoneCode.updateMany({ where: { phone }, data: { createdAt: new Date(Date.now() - 60_000) } });
    const second = await sendPhoneCode(phone, "RESET");
    if (first.demoCode !== second.demoCode) await expect(checkPhoneCode(phone, "RESET", first.demoCode!)).rejects.toThrow();
    await checkPhoneCode(phone, "RESET", second.demoCode!);
  });

  it("keeps a sign-up proof apart from a reset proof and from other numbers", async () => {
    const phone = freshPhone();
    await rememberVerifiedPhone(phone, "SIGNUP");
    expect(await phoneIsVerified(phone, "SIGNUP")).toBe(true);
    expect(await phoneIsVerified(phone, "RESET")).toBe(false);
    expect(await phoneIsVerified(freshPhone(), "SIGNUP")).toBe(false);
  });

  it("won't create an account for a number that wasn't proven", async () => {
    const phone = freshPhone();
    await expect(accountCredentials("1234", phone)).rejects.toThrow(/Verify your mobile number/);
    await rememberVerifiedPhone(phone, "SIGNUP");
    const creds = await accountCredentials("1234", phone);
    expect(creds.phoneVerifiedAt).toBeInstanceOf(Date);
    await creds.done();
    expect(await phoneIsVerified(phone, "SIGNUP")).toBe(false);
  });
});
