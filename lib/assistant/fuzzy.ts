// Small fuzzy matcher for misrecognised words ("tamato", "onian",
// "patato"): Levenshtein distance scaled to word length. No dependencies.

/** Edit distance between two strings (insert / delete / substitute). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Allowed edits for a word of this length (short words must match exactly). */
function tolerance(len: number): number {
  if (len < 4) return 0;
  if (len < 7) return 1;
  return 2;
}

/**
 * Best fuzzy match of `token` among `terms`, or null.
 * Only Latin-script tokens are fuzzed — Indic scripts are matched by prefix
 * elsewhere, since speech engines rarely misspell them letter by letter.
 */
export function fuzzyFind<T>(token: string, terms: [string, T][]): { term: string; value: T; distance: number } | null {
  if (!/^[a-z]+$/.test(token)) return null;
  let best: { term: string; value: T; distance: number } | null = null;
  for (const [term, value] of terms) {
    if (!/^[a-z]+$/.test(term) || Math.abs(term.length - token.length) > 2) continue;
    const d = levenshtein(token, term);
    if (d <= tolerance(Math.min(term.length, token.length)) && (!best || d < best.distance)) best = { term, value, distance: d };
  }
  return best;
}
