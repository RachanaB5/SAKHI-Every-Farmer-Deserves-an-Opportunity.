// /api/assistant/settings — Sakhi preferences on the farmer
// profile: whether the welcome was shown, auto voice, and the suggested
// language order for the farmer's registered location.
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { suggestLanguages } from "@/lib/assistant/language";
import { assistantSettingsSchema, type AssistantSettingsInput } from "@/lib/validators/assistant";

async function view(userId: string, area: string | null, language: string) {
  const p = await db.farmerProfile.findUnique({ where: { userId }, select: { assistantWelcomeSeen: true, assistantAutoVoice: true, village: true } });
  return {
    welcomeSeen: p?.assistantWelcomeSeen ?? true,
    autoVoice: p?.assistantAutoVoice ?? true,
    language,
    suggested: suggestLanguages({ village: p?.village, area }, language),
  };
}

/** Current settings. */
export const GET = handler({ roles: ["FARMER"] }, async ({ user }) => view(user.id, user.area, user.language));

/** Updates welcome / auto-voice flags. */
export const PATCH = handler<AssistantSettingsInput>({ roles: ["FARMER"], body: assistantSettingsSchema }, async ({ user, body }) => {
  await db.farmerProfile.updateMany({
    where: { userId: user.id },
    data: { ...(body.welcomeSeen !== undefined && { assistantWelcomeSeen: body.welcomeSeen }), ...(body.autoVoice !== undefined && { assistantAutoVoice: body.autoVoice }) },
  });
  return view(user.id, user.area, user.language);
});
