// Language suggestion for the Sakhi welcome: farmers registered
// in Karnataka (every FoodFlow pilot village and service area) are offered
// Kannada first, then their saved language, then the rest.
import { SERVICE_AREAS, VILLAGES } from "@/lib/areas";
import type { AssistantLang } from "./intents";

const KARNATAKA_PLACES = new Set([...VILLAGES.map((v) => v.name.toLowerCase()), ...SERVICE_AREAS.map((a) => a.name.toLowerCase()), "bengaluru", "bangalore", "karnataka", "mysuru", "mysore", "hubli", "mangaluru"]);

/** Ordered language suggestions for a farmer's registered location. */
export function suggestLanguages(place: { village?: string | null; area?: string | null }, saved?: string | null): AssistantLang[] {
  const inKarnataka = [place.village, place.area].some((p) => p && KARNATAKA_PLACES.has(p.trim().toLowerCase()));
  const order: AssistantLang[] = inKarnataka ? ["kn", "en", "hi"] : ["hi", "en", "kn"];
  if (saved === "en" || saved === "hi" || saved === "kn") {
    if (!inKarnataka) return [saved, ...order.filter((l) => l !== saved)];
  }
  return order;
}

/** BCP-47 speech code per assistant language. */
export const SPEECH_CODE: Record<AssistantLang, string> = { en: "en-IN", hi: "hi-IN", kn: "kn-IN" };
