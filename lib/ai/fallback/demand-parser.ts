// Offline parser for spoken bulk requirements, e.g.
//   "50 kilo pyaz kal tak chahiye, urgent, 30 rupaye tak"
//   "ನಾಳೆಗೆ 80 ಕೆಜಿ ಟೊಮೇಟೊ ಬೇಕು, ಪ್ರತಿ ವಾರ"
// Reuses the listing parser for crop/quantity/price, then reads demand-
// specific cues: deadline ("kal tak" = BY TOMORROW here, unlike a harvest
// where "kal" means yesterday), urgency, repeat schedule and grade.
import type { ParsedDemand } from "../schemas";
import { parseListingFallback } from "./listing-parser";
import { normaliseNumbers } from "./numbers";

const URGENT = /(urgent|asap|jaldi|jaldee|turant|तुरंत|जल्दी|अर्जेंट|ತುರ್ತು|ಬೇಗ)/;
const TOMORROW = /(kal tak|kal subah|tomorrow|कल तक|कल सुबह|ನಾಳೆ|நாளை|రేపు)/;
const DAY_AFTER = /(parso|day after|परसों|ನಾಡಿದ್ದು)/;
const TODAY = /(aaj|today|tonight|आज|ಇಂದು|ಇವತ್ತು)/;
const IN_DAYS = /(\d+)\s*(din|days?|दिन|ದಿನ)/;
const WEEKLY = /(every week|weekly|har hafte|हर हफ्ते|हर हफ़्ते|ಪ್ರತಿ ವಾರ|ವಾರಕ್ಕೊಮ್ಮೆ)/;
const DAILY = /(every day|daily|roz|rozana|रोज़|रोज|हर दिन|ಪ್ರತಿದಿನ|ದಿನಾ)/;
const GRADE_A = /(grade a|a grade|best quality|top quality|achha maal|बढ़िया|ಉತ್ತಮ)/;

/**
 * @param transcript - raw speech or typed text
 * @param now - reference time (injectable for tests)
 */
export function parseDemandFallback(transcript: string, now: Date = new Date()): ParsedDemand {
  const base = parseListingFallback(transcript, now);
  const text = normaliseNumbers(transcript);

  let deadline: Date | null = null;
  const d = new Date(now);
  const inDays = text.match(IN_DAYS);
  if (inDays) {
    d.setDate(d.getDate() + Number(inDays[1]));
    d.setHours(10, 0, 0, 0);
    deadline = d;
  } else if (DAY_AFTER.test(text)) {
    d.setDate(d.getDate() + 2);
    d.setHours(10, 0, 0, 0);
    deadline = d;
  } else if (TOMORROW.test(text)) {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    deadline = d;
  } else if (TODAY.test(text)) {
    d.setHours(Math.max(d.getHours() + 3, 18), 0, 0, 0);
    deadline = d;
  }

  const frequency = WEEKLY.test(text) ? "WEEKLY" : DAILY.test(text) ? "DAILY" : null;
  const qtyKg = base.qty === null ? null : base.unit === "dozen" ? base.qty : base.qty;
  const result = {
    crop: base.crop,
    qtyKg,
    targetPrice: base.price,
    deadline: deadline ? deadline.toISOString() : null,
    urgent: URGENT.test(text),
    recurring: frequency !== null,
    frequency: frequency as ParsedDemand["frequency"],
    grade: GRADE_A.test(text) ? ("A" as const) : ("ANY" as const),
  };
  const missing = (["crop", "qtyKg", "targetPrice", "deadline"] as const).filter((k) => result[k] === null);
  return { ...result, missing: [...missing] };
}
