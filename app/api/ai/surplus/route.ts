// POST /api/ai/surplus { listingId } — is this listing at risk of going
// unsold, why, and what to do: { atRisk, reasons[], suggestions[] }.
// Detection and options are computed from data; the model (if configured)
// only rewrites them into farmer-friendly advice.
import { z } from "zod";
import { withFallbackCached } from "@/lib/ai";
import { surplusPrompt } from "@/lib/ai/prompts";
import { surplusNarrativeSchema } from "@/lib/ai/schemas";
import { handler, HttpError } from "@/lib/api";
import { toLang } from "@/lib/i18n";
import { rateLimit } from "@/lib/rate-limit";
import { detectSurplus } from "@/lib/surplus";

const body = z.object({ listingId: z.string().min(1) });

/** Advice for one of the farmer's listings. */
export const POST = handler<z.infer<typeof body>>({ roles: ["FARMER"], body }, async ({ user, body }) => {
  rateLimit(`ai:surplus:${user.id}`, 30, 60_000);
  const [item] = await detectSurplus(user.id, body.listingId);
  if (!item) throw new HttpError(404, "Listing not found or not live");
  const facts = [
    `Crop: ${item.crop}, ${item.available} ${item.unit} unsold of ${item.total}, price ₹${item.price}/${item.unit}`,
    `Listed ${item.hoursListed} h ago, ${item.sellThrough}% sold; harvested ${item.harvestAgeDays} days ago; shelf life ~${item.shelfLifeDays} days`,
    `At risk: ${item.atRisk ? "yes" : "no"}, ${item.reasons.join("; ") || "selling normally"}`,
    `Options: ${item.suggestions.map((s) => s.label).join(" | ") || "none"}`,
  ].join("\n");
  const lang = toLang(user.language); // surplus advice is farmer-only
  const fallback = { reasons: item.reasons, suggestions: item.suggestions.map((s) => s.label).slice(0, 4) };
  const result = item.atRisk
    ? await withFallbackCached(
        "surplus",
        `${lang}\n${facts}`,
        (p) => p.generateJSON({ task: "surplus", system: surplusPrompt.system, prompt: surplusPrompt.user(facts, lang), schema: surplusNarrativeSchema }),
        () => fallback,
      )
    : { data: fallback, source: "fallback" as const };
  return { atRisk: item.atRisk, reasons: result.data.reasons, suggestions: result.data.suggestions, source: result.source };
});
