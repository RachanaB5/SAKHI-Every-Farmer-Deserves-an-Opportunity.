// Client-side JSON fetch helpers that understand the API envelope
// `{ ok: true, data } | { ok: false, error }` used by every route.

/** Error thrown when an API route responds with `ok: false`. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string; details?: unknown };

/**
 * Fetches a URL and unwraps the API envelope.
 * @param url - API path, e.g. `/api/listings`
 * @param init - optional fetch init
 * @returns the `data` payload
 * @throws ApiError when the response is not ok
 */
export async function fetcher<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError(`Unexpected response (${res.status})`, res.status);
  }
  if (!res.ok || !body || body.ok === false) {
    const msg = body && body.ok === false ? body.error : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, body && body.ok === false ? body.details : undefined);
  }
  return body.data;
}

/**
 * Sends JSON to an API route and unwraps the envelope.
 * @param url - API path
 * @param method - HTTP verb (defaults to POST)
 * @param payload - JSON-serialisable body
 */
export function sendJSON<T = unknown>(
  url: string,
  payload?: unknown,
  method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST",
): Promise<T> {
  return fetcher<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

/**
 * Posts multipart form data (file uploads) and unwraps the envelope.
 * @param url - API path
 * @param form - FormData with files and fields
 */
export function sendForm<T = unknown>(url: string, form: FormData): Promise<T> {
  return fetcher<T>(url, { method: "POST", body: form });
}
