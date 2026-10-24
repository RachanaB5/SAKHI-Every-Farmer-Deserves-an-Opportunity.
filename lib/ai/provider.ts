// Provider-agnostic contract for JSON-producing models. Swapping Gemini for
// another vendor means implementing `AIProvider` and changing getProvider().
import type { ZodType } from "zod";

export interface AIImage {
  mimeType: string;
  /** Base64 without the data: prefix. */
  base64: string;
}

export interface JSONRequest<T> {
  /** Stable task name for logs, e.g. "quality". */
  task: string;
  system: string;
  prompt: string;
  images?: AIImage[];
  schema: ZodType<T>;
  temperature?: number;
}

export interface AIProvider {
  readonly name: string;
  /** Returns schema-valid JSON or throws (timeout, HTTP error, invalid output). */
  generateJSON<T>(req: JSONRequest<T>): Promise<T>;
}

/** Thrown when no provider is configured — callers go straight to fallback. */
export class AIUnavailableError extends Error {
  constructor(message = "No AI provider configured") {
    super(message);
  }
}
