// /api/assistant/settings — Sakhi preferences on the farmer
// profile: whether the welcome was shown, auto voice, whether Sakhi runs
// the farmer's orders (autopilot), and the suggested language order for
// the farmer's registered location.
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { audit } from "@/lib/audit";
import { suggestLanguages } from "@/lib/assistant/language";
import { assistantSettingsSchema, type AssistantSettingsInput } from "@/lib/validators/assistant";

async function view(userId: string, area: string | null, language: string) {
  const p = await db.farmerProfile.findUnique({ where: { userId }, select: { assistantWelcomeSeen: true, assistantAutoVoice: true, assistantAutopilot: true, village: true } });
  return {
    welcomeSeen: p?.assistantWelcomeSeen ?? true,
    autoVoice: p?.assistantAutoVoice ?? true,
    autopilot: p?.assistantAutopilot ?? false,
    language,
    suggested: suggestLanguages({ village: p?.village, area }, language),
  };
}

/** Current settings. */
export const GET = handler({ roles: ["FARMER"] }, async ({ user }) => view(user.id, user.area, user.language));

/** Updates welcome / auto-voice / autopilot flags. */
export const PATCH = handler<AssistantSettingsInput>({ roles: ["FARMER"], body: assistantSettingsSchema }, async ({ user, body }) => {
  await db.farmerProfile.updateMany({
    where: { userId: user.id },
    data: {
      ...(body.welcomeSeen !== undefined && { assistantWelcomeSeen: body.welcomeSeen }),
      ...(body.autoVoice !== undefined && { assistantAutoVoice: body.autoVoice }),
      ...(body.autopilot !== undefined && { assistantAutopilot: body.autopilot }),
    },
  });
  // Sakhi acting on the farmer's orders is a choice worth a trail.
  if (body.autopilot !== undefined) await audit({ actorId: user.id, action: body.autopilot ? "AUTOPILOT_ON" : "AUTOPILOT_OFF", entity: "User", entityId: user.id });
  return view(user.id, user.area, user.language);
});
