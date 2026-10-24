// Gemini provider + fallback orchestration, against a stubbed fetch (no API key needed).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GeminiProvider } from "@/lib/ai/gemini";
import { clearAIAnswers, explainPrice, resetAIBreaker, withFallback } from "@/lib/ai";

const schema = z.object({ basis: z.array(z.string()).min(1) });
const reply = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
const status = (code: number) => new Response("{}", { status: code });
const req = { task: "t", system: "s", prompt: "p", schema };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  resetAIBreaker();
  clearAIAnswers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GeminiProvider", () => {
  it("returns schema-valid JSON on the first try", async () => {
    fetchMock.mockResolvedValueOnce(reply({ basis: ["ok"] }));
    await expect(new GeminiProvider("k", ["m"], 5000).generateJSON(req)).resolves.toEqual({ basis: ["ok"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on a transient 503", async () => {
    fetchMock.mockResolvedValueOnce(status(503)).mockResolvedValueOnce(reply({ basis: ["ok"] }));
    await expect(new GeminiProvider("k", ["m"], 5000).generateJSON(req)).resolves.toEqual({ basis: ["ok"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 400", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(status(400)));
    await expect(new GeminiProvider("k", ["m"], 5000).generateJSON(req)).rejects.toThrow("HTTP 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-asks with the validation error when the output is invalid", async () => {
    fetchMock.mockResolvedValueOnce(reply({ wrong: true })).mockResolvedValueOnce(reply({ basis: ["fixed"] }));
    await expect(new GeminiProvider("k", ["m"], 5000).generateJSON(req)).resolves.toEqual({ basis: ["fixed"] });
    const second = JSON.parse(fetchMock.mock.calls[1][1].body as string).contents[0].parts[0].text as string;
    expect(second).toContain("previous reply was rejected");
  });

  it("switches to the fallback model when the main one is rate-limited", async () => {
    fetchMock.mockResolvedValueOnce(status(429)).mockResolvedValueOnce(reply({ basis: ["lite"] }));
    await expect(new GeminiProvider("k", ["main", "lite"], 5000).generateJSON(req)).resolves.toEqual({ basis: ["lite"] });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/main:generateContent");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/lite:generateContent");
  });

  it("gives up after two bad outputs", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reply({ wrong: true })));
    await expect(new GeminiProvider("k", ["m"], 5000).generateJSON(req)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("withFallback", () => {
  it("falls back when no key is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const r = await withFallback("t", async () => "ai", () => "offline");
    expect(r).toMatchObject({ data: "offline", source: "fallback" });
  });

  it("pauses the model after three outages in a row, then skips it", async () => {
    const ai = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    for (let i = 0; i < 3; i++) await withFallback("t", ai, () => "offline");
    expect(ai).toHaveBeenCalledTimes(3);
    const r = await withFallback("t", ai, () => "offline");
    expect(ai).toHaveBeenCalledTimes(3); // breaker open: model not called
    expect(r.note).toContain("paused");
  });

  it("does not trip the breaker on unusable output", async () => {
    const ai = vi.fn().mockRejectedValue(new SyntaxError("bad json"));
    for (let i = 0; i < 5; i++) await withFallback("t", ai, () => "offline");
    expect(ai).toHaveBeenCalledTimes(5);
  });
});

describe("explainPrice", () => {
  it("asks for the farmer's language and caches the model's answer", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reply({ basis: ["आज भाव ₹30 है"] })));
    const a = await explainPrice("facts", ["offline"], "hi");
    const b = await explainPrice("facts", ["offline"], "hi");
    expect(a).toMatchObject({ data: ["आज भाव ₹30 है"], source: "ai" });
    expect(b.data).toEqual(a.data);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).contents[0].parts[0].text).toContain("Hindi");
    // A different language is a different question.
    await explainPrice("facts", ["offline"], "kn");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache offline answers", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(status(400)));
    await explainPrice("facts2", ["offline"], "en");
    await explainPrice("facts2", ["offline"], "en");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
