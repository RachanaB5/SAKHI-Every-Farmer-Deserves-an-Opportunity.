// Sign in with Google: authorisation URL, profile exchange (Google stubbed) and matching a profile to a member.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGoogleProfile, findGoogleMember, googleAuthUrl, googleConfigured, googleRedirectUri, safeNext } from "@/lib/auth/google";
import { db } from "@/lib/db";
import { makeUser } from "./helpers";

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-123.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-abc");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("configuration and URLs", () => {
  it("is configured only when both credentials exist", () => {
    expect(googleConfigured()).toBe(true);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(googleConfigured()).toBe(false);
  });

  it("builds Google's consent URL with the state and callback", () => {
    const url = new URL(googleAuthUrl("state-xyz", "http://localhost:3000/api/auth/google/callback"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-123.apps.googleusercontent.com");
    expect(url.searchParams.get("state")).toBe("state-xyz");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/google/callback");
    expect(url.searchParams.get("scope")).toContain("email");
  });

  it("uses the configured app URL for the callback when there is one", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://foodflow.example/");
    expect(googleRedirectUri("http://internal:3000")).toBe("https://foodflow.example/api/auth/google/callback");
  });

  it("only allows same-site destinations after sign-in", () => {
    expect(safeNext("/shop/cart")).toBe("/shop/cart");
    expect(safeNext("//evil.example")).toBeUndefined();
    expect(safeNext("https://evil.example")).toBeUndefined();
  });
});

describe("fetchGoogleProfile", () => {
  const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

  it("exchanges the code and returns a lower-cased verified profile", async () => {
    const fetchMock = vi.fn().mockImplementationOnce(() => reply({ access_token: "tok" })).mockImplementationOnce(() => reply({ sub: "g-1", email: "Asha@Example.com", email_verified: true, name: "Asha K" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchGoogleProfile("code", "http://localhost:3000/cb")).resolves.toEqual({ sub: "g-1", email: "asha@example.com", name: "Asha K" });
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("client_secret=secret-abc");
  });

  it("refuses an unverified email and a failed exchange", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => reply({ access_token: "tok" })).mockImplementationOnce(() => reply({ sub: "g-2", email: "x@y.co", email_verified: false })));
    await expect(fetchGoogleProfile("code", "cb")).rejects.toThrow(/not verified/);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => reply({ error: "invalid_grant" }, 400)));
    await expect(fetchGoogleProfile("code", "cb")).rejects.toThrow(/token exchange failed/);
  });
});

describe("findGoogleMember", () => {
  it("returns null for someone new", async () => {
    expect(await findGoogleMember({ sub: "new-sub", email: "nobody@example.com", name: "N" })).toBeNull();
  });

  it("finds by Google id, and links by email the first time", async () => {
    const byId = await makeUser("CONSUMER", { googleId: "g-known", email: "known@example.com" });
    expect((await findGoogleMember({ sub: "g-known", email: "other@example.com", name: "K" }))?.id).toBe(byId.id);

    const byEmail = await makeUser("FARMER", { email: "linkme@example.com" });
    const linked = await findGoogleMember({ sub: "g-link", email: "linkme@example.com", name: "L" });
    expect(linked?.id).toBe(byEmail.id);
    expect((await db.user.findUnique({ where: { id: byEmail.id } }))?.googleId).toBe("g-link");
  });
});
