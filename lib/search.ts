// Text-search helpers that behave the same on SQLite (case-insensitive
// LIKE) and Postgres (case-sensitive LIKE) without provider-only options.

/**
 * Common casings of a query, e.g. "ravi" → ["ravi", "Ravi", "RAVI"].
 * OR-ing `contains` over these matches names however they were typed.
 */
export function caseVariants(q: string): string[] {
  const lower = q.toLowerCase();
  const title = lower.replace(/(^|\s)(\p{L})/gu, (_, sp: string, c: string) => sp + c.toUpperCase());
  return [...new Set([q, lower, title, q.toUpperCase()])];
}
