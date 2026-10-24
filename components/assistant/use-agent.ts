// Sakhi's order autopilot on the client. While the farmer has it on, the
// feed is polled (and refreshed on live order events); each new piece of
// order news opens the panel and is read aloud without being asked. Who is
// waiting at the farm comes back as tasks, which the farmer can answer by
// voice: "yes" hands the parcel to the rider, the buyer's six digits check
// their pickup code. The plaintext code only ever goes to the server check.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate as revalidate } from "swr";
import { useLive } from "@/hooks/use-live";
import { normaliseNumbers } from "@/lib/ai/fallback/numbers";
import { isOrderNotification, orderNotificationText } from "@/lib/assistant/agent-text";
import type { AgentFeed, AgentTask } from "@/lib/assistant/autopilot";
import { yesNo } from "@/lib/assistant/lexicon";
import { amount } from "@/lib/assistant/reply";
import { sendJSON } from "@/lib/fetcher";
import { translate } from "@/lib/i18n";
import type { useFarmerFriend } from "./use-farmer-friend";

type FF = ReturnType<typeof useFarmerFriend>;
type HandoverTask = Extract<AgentTask, { kind: "handover" }>;
type PickupTask = Extract<AgentTask, { kind: "pickup" }>;
type PickupResult = { ok: true; already: boolean; settlementNet?: number } | { ok: false; reason: "no_otp" | "expired" | "locked" | "mismatch" | "bad_qr"; attemptsLeft: number };

const POLL_MS = 30_000;
/** Said instead of "yes" once the parcel is with the rider (lower-case). */
const HANDED_WORDS = ["handed", "given", "gave", "ಕೊಟ್ಟೆ", "ಕೊಟ್ಟಾಯಿತು", "ಕೊಟ್ಟಿದ್ದೇನೆ", "ಕೊಟ್ಟಿದೀನಿ", "दे दिया", "दे दी", "दिया"];

/** True when the farmer said the parcel is handed over. */
function saidHanded(text: string) {
  const answer = yesNo(text);
  if (answer) return answer === "yes";
  const s = text.toLowerCase();
  return HANDED_WORDS.some((w) => s.includes(w));
}

/**
 * @param enabled - the farmer turned on "Let Sakhi handle my orders"
 * @param onWake - opens the panel when there's news
 */
export function useAgent({ enabled, ff, onWake }: { enabled: boolean; ff: FF; onWake: () => void }) {
  const { data, mutate } = useSWR<AgentFeed>(enabled ? "/api/assistant/agent" : null, { refreshInterval: POLL_MS });
  useLive(["notification.created", "order.updated", "delivery.updated"], () => {
    if (enabled) void mutate();
  });
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const announced = useRef(new Set<string>());
  const { agentSay, speakLang } = ff;
  const tasks = useMemo(() => data?.tasks ?? [], [data]);

  // Read out new order news once, oldest first, then mark it read (the bell keeps it).
  useEffect(() => {
    const fresh = (data?.messages ?? []).filter((m) => !announced.current.has(m.id));
    if (!fresh.length) return;
    fresh.forEach((m) => announced.current.add(m.id));
    onWake();
    fresh.forEach((m, i) => {
      if (!isOrderNotification(m.type)) return;
      // After "someone is at your farm", open the mic for the answer (when hands-free is on).
      const answerNext = i === fresh.length - 1 && (m.type === "RIDER_ARRIVED" || m.type === "BUYER_ARRIVED");
      agentSay(orderNotificationText(speakLang, m.type, m.data), { listenAfter: answerNext });
    });
    void sendJSON("/api/notifications/read", { ids: fresh.map((m) => m.id) }).then(() => revalidate("/api/notifications"), () => {});
  }, [data, agentSay, onWake, speakLang]);

  const failed = useCallback((e: unknown) => agentSay(`${translate(speakLang, "ff.say.error")} (${(e as Error).message})`, { ok: false }), [agentSay, speakLang]);

  /** The farmer gave the parcel to the rider: the order goes out for delivery and the buyer is told. */
  const handOver = useCallback(
    async (task: HandoverTask) => {
      setBusyOrder(task.orderId);
      try {
        const { already, ...names } = await sendJSON<{ already: boolean; code: string; rider: string; buyer: string }>("/api/assistant/agent/handover", { orderId: task.orderId });
        agentSay(translate(speakLang, already ? "ff.agent.already" : "ff.agent.handedOver", names));
        void mutate();
      } catch (e) {
        failed(e);
      } finally {
        setBusyOrder(null);
      }
    },
    [agentSay, failed, mutate, speakLang],
  );

  /**
   * Checks the code a self-pickup buyer read out; on a match the order is
   * collected and the buyer is told.
   * @returns whether the code matched
   */
  const checkCode = useCallback(
    async (task: PickupTask, otp: string): Promise<boolean> => {
      setBusyOrder(task.orderId);
      try {
        const r = await sendJSON<PickupResult>("/api/pickups/verify", { code: task.code, otp });
        if (r.ok) {
          agentSay(translate(speakLang, r.already ? "ff.agent.already" : "ff.agent.collected", { code: task.code, buyer: task.buyer, net: amount(r.settlementNet ?? 0) }));
          void mutate();
          return true;
        }
        const key = r.reason === "mismatch" ? "ff.agent.otp.mismatch" : r.reason === "expired" ? "ff.agent.otp.expired" : r.reason === "no_otp" ? "ff.agent.otp.none" : "ff.agent.otp.locked";
        agentSay(translate(speakLang, key, { buyer: task.buyer, left: r.attemptsLeft }), { ok: false, listenAfter: r.reason === "mismatch" });
        return false;
      } catch (e) {
        failed(e);
        return false;
      } finally {
        setBusyOrder(null);
      }
    },
    [agentSay, failed, mutate, speakLang],
  );

  /** Answers a typed or spoken request about the latest arrival; false lets Sakhi handle it as usual. */
  const intercept = useCallback(
    async (text: string) => {
      // The most recent arrival of each kind (older phones lack Array#findLast).
      const latest = [...tasks].reverse();
      const pickup = latest.find((t): t is PickupTask => t.kind === "pickup");
      const digits = normaliseNumbers(text).replace(/\D/g, "");
      if (pickup && digits.length === 6) {
        await checkCode(pickup, digits);
        return true;
      }
      const handover = latest.find((t): t is HandoverTask => t.kind === "handover");
      if (handover && saidHanded(text)) {
        await handOver(handover);
        return true;
      }
      return false;
    },
    [checkCode, handOver, tasks],
  );

  return { tasks, busyOrder, handOver, checkCode, intercept, refresh: mutate };
}

export type Agent = ReturnType<typeof useAgent>;
