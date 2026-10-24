// In-memory sliding-window rate limiter for AI and auth endpoints. Per
// process — good enough for the pilot; swap for Redis when scaling out.
import { HttpError } from "@/lib/api";

const hits = new Map<string, number[]>();

/**
 * Records a hit and throws 429 when `key` exceeds `limit` hits in `windowMs`.
 * @param key - e.g. `ai:quality:<userId>`
 * @param limit - max hits per window
 * @param windowMs - window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    const retry = Math.ceil((windowMs - (now - recent[0])) / 1000);
    throw new HttpError(429, `Too many requests, try again in ${retry < 90 ? `${retry} seconds` : `${Math.ceil(retry / 60)} minutes`}`);
  }
  recent.push(now);
  hits.set(key, recent);
}

/** The client's IP: the first hop of x-forwarded-for, or "local" in dev. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
