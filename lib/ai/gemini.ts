// Gemini implementation of AIProvider over the REST API (no SDK, so model
// upgrades never break the build). Requests strict JSON and validates it.
import "server-only";
import { ZodError } from "zod";
import { AIUnavailableError, type AIProvider, type JSONRequest } from "./provider";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** Strips ```json fences some models still wrap around JSON. */
function extractJSON(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

/** HTTP failure from Gemini; `status` decides whether a retry is worthwhile. */
export class GeminiHttpError extends Error {
  constructor(readonly status: number) {
    super(`Gemini HTTP ${status}`);
  }
}

/** Transient server-side problems worth one more try. */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
/** "Too busy" answers: the fallback model (its own quota) is tried at once instead. */
const BUSY_STATUS = new Set([429, 503]);
const MAX_ATTEMPTS = 2;
/** Photos make requests slower, so they get a longer per-attempt timeout. */
const IMAGE_TIMEOUT_FACTOR = 2;
/** All attempts together may use at most this multiple of one timeout. */
const BUDGET_FACTOR = 1.75;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True when the model's output (not the network) was unusable. */
export function isBadOutput(e: unknown): boolean {
  return e instanceof SyntaxError || e instanceof ZodError;
}

/** True for infrastructure trouble (timeouts, HTTP errors, network) that should count against the circuit breaker. */
export function isOutage(e: unknown): boolean {
  return !isBadOutput(e) && !(e instanceof AIUnavailableError);
}

/** One retry is allowed for transient HTTP errors, dropped connections and unusable output. */
function isRetryable(e: unknown): boolean {
  if (e instanceof GeminiHttpError) return RETRYABLE_STATUS.has(e.status);
  if (isBadOutput(e)) return true;
  // fetch() rejects with a TypeError on connection failures; timeouts are not retried (budget).
  return e instanceof TypeError;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  /**
   * @param models - the main model first, then fallbacks tried when it is rate-limited or overloaded
   */
  constructor(
    private apiKey: string,
    private models: string[],
    private timeoutMs: number,
  ) {}

  /**
   * Calls generateContent with JSON response mode. Transient failures get
   * one retry within a bounded time budget; invalid JSON gets one retry
   * that tells the model what was wrong.
   * @throws on timeout (TimeoutError), non-2xx, safety block, or invalid output after the retry
   */
  async generateJSON<T>(req: JSONRequest<T>): Promise<T> {
    const perAttempt = this.timeoutMs * (req.images?.length ? IMAGE_TIMEOUT_FACTOR : 1);
    const deadline = Date.now() + perAttempt * BUDGET_FACTOR;
    let prompt = req.prompt;
    let lastError: unknown;
    let model = 0;
    for (let attempt = 0; attempt < MAX_ATTEMPTS + this.models.length - 1; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 1000) break;
      try {
        const text = await this.call(req, this.models[model], prompt, Math.min(perAttempt, remaining));
        return req.schema.parse(extractJSON(text));
      } catch (e) {
        lastError = e;
        if (!isRetryable(e)) break;
        if (e instanceof GeminiHttpError && BUSY_STATUS.has(e.status) && model + 1 < this.models.length) {
          model++; // a busy model won't recover within this request; its fallback has its own quota
          continue;
        }
        if (isBadOutput(e)) {
          const why = e instanceof ZodError ? e.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ") : (e as Error).message;
          prompt = `${req.prompt}\n\nYour previous reply was rejected (${why.slice(0, 300)}). Reply again with ONLY the JSON object described above.`;
        } else {
          await sleep(300);
        }
      }
    }
    throw lastError;
  }

  /** One generateContent round trip; returns the raw model text. */
  private async call<T>(req: JSONRequest<T>, model: string, prompt: string, timeoutMs: number): Promise<string> {
    const parts: Record<string, unknown>[] = [{ text: prompt }];
    for (const img of req.images ?? []) {
      parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
    }
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: req.temperature ?? 0.2 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new GeminiHttpError(res.status);
    const body = (await res.json()) as GeminiResponse;
    if (body.promptFeedback?.blockReason) throw new Error(`Gemini blocked: ${body.promptFeedback.blockReason}`);
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) throw new Error("Gemini returned no text");
    return text;
  }
}

/** Builds the configured provider, or throws AIUnavailableError when no key is set. */
export function geminiFromEnv(): GeminiProvider {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AIUnavailableError("GEMINI_API_KEY not set");
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const fallback = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.1-flash-lite";
  const timeout = Number(process.env.AI_TIMEOUT_MS) || 8000;
  return new GeminiProvider(key, [...new Set([model, fallback].filter(Boolean))], timeout);
}
