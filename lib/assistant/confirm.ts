// Confirmation tokens for Sakhi. A consequential action is first
// returned as a short-lived signed token that encodes the exact payload the
// farmer saw; confirming runs it once. Replays return the stored result.
import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { jwtVerify, SignJWT } from "jose";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { secretKey } from "@/lib/auth/token";
import type { AssistantLang, ConfirmIntent } from "./intents";
import type { AssistantReply } from "./types";

const AUDIENCE = "foodflow:assistant-confirm";
export const CONFIRM_TTL_SECONDS = 5 * 60;

/** Resolved ids and values — what will actually be changed. */
export interface ConfirmPayload {
  intent: ConfirmIntent;
  lang: AssistantLang;
  draftId?: string;
  listingId?: string;
  demandId?: string;
  orderId?: string;
  qty?: number;
  price?: number;
  etaHours?: number;
}

/** Signs a single-use confirmation for `userId`. */
export async function signConfirm(userId: string, payload: ConfirmPayload): Promise<string> {
  return new SignJWT({ p: payload })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${CONFIRM_TTL_SECONDS}s`)
    .sign(secretKey());
}

/**
 * Verifies a token for `userId`. Expired, tampered or someone else's
 * tokens are rejected.
 */
export async function verifyConfirm(token: string, userId: string): Promise<{ jti: string; payload: ConfirmPayload }> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: AUDIENCE, algorithms: ["HS256"] });
    if (payload.sub !== userId || !payload.jti) throw new Error("wrong user");
    return { jti: payload.jti, payload: (payload as unknown as { p: ConfirmPayload }).p };
  } catch (e) {
    const expired = (e as { code?: string }).code === "ERR_JWT_EXPIRED";
    throw new HttpError(expired ? 410 : 403, expired ? "This confirmation expired, please ask again" : "This confirmation isn't valid");
  }
}

/**
 * Runs `action` at most once per token id. A second confirm of the same
 * token returns the first result without doing anything; if the action
 * fails, the token is released so the farmer can retry.
 */
export async function runOnce(jti: string, userId: string, intent: string, action: () => Promise<AssistantReply>): Promise<AssistantReply & { replayed?: boolean }> {
  try {
    await db.assistantAction.create({ data: { jti, userId, intent } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const prev = await db.assistantAction.findUnique({ where: { jti } });
      if (prev?.result) return { ...(prev.result as unknown as AssistantReply), replayed: true };
      throw new HttpError(409, "That action is already being done");
    }
    throw e;
  }
  try {
    const result = await action();
    await db.assistantAction.update({ where: { jti }, data: { result: result as unknown as Prisma.InputJsonValue } });
    return result;
  } catch (e) {
    await db.assistantAction.delete({ where: { jti } }).catch(() => {});
    throw e;
  }
}
