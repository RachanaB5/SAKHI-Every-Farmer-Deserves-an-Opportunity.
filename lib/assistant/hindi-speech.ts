// Numbers for the Hindi voice: "2500" → "दो हज़ार पाँच सौ", "1,25,000" →
// "एक लाख पच्चीस हज़ार", and halves the way people say them (डेढ़, ढाई,
// साढ़े तीन), so a Hindi voice never reads digits with an English accent.
import { HINDI_1_99 } from "./numbers";

const below100 = (n: number) => (n === 0 ? "" : HINDI_1_99[n - 1]);

function whole(n: number): string {
  if (n === 0) return "शून्य";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (crore) parts.push(`${whole(crore)} करोड़`);
  if (lakh) parts.push(`${below100(lakh)} लाख`);
  if (thousand) parts.push(`${below100(thousand)} हज़ार`);
  if (hundred) parts.push(`${below100(hundred)} सौ`);
  if (rest) parts.push(below100(rest));
  return parts.join(" ");
}

/** One number in Hindi words. */
export function hindiNumber(n: number): string {
  const int = Math.floor(n);
  const frac = Math.round((n - int) * 100) / 100;
  if (frac === 0) return whole(int);
  if (frac === 0.5) return int === 0 ? "आधा" : int === 1 ? "डेढ़" : int === 2 ? "ढाई" : `साढ़े ${whole(int)}`;
  const digits = String(frac).slice(2).split("").map((d) => (d === "0" ? "शून्य" : below100(Number(d))));
  return `${whole(int)} दशमलव ${digits.join(" ")}`;
}

/** Every number in `text` written out in Hindi words (Indian grouping commas are ignored). */
export function hindiNumbersToWords(text: string): string {
  return text.replace(/\d+(?:,\d{2,3})*(?:\.\d+)?/g, (m) => hindiNumber(Number(m.replace(/,/g, ""))));
}
