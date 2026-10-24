// Live updates on the client: one shared EventSource per tab feeding every
// subscriber. If the stream errors (offline, serverless timeout), we fall
// back to calling subscribers every 5 seconds so views keep refreshing.
"use client";

import { useEffect, useRef } from "react";
import type { LiveEvent, LiveEventType } from "@/lib/events";

type Handler = (event: LiveEvent | { type: "poll" }) => void;
interface Sub {
  types: string[];
  fn: Handler;
}

const POLL_MS = 5000;
const subs = new Set<Sub>();
let source: EventSource | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => subs.forEach((s) => s.fn({ type: "poll" })), POLL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function connect() {
  if (source || typeof window === "undefined") return;
  if (typeof EventSource === "undefined") return startPolling();
  source = new EventSource("/api/events");
  source.onopen = stopPolling;
  source.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data) as LiveEvent;
      subs.forEach((s) => s.types.includes(event.type) && s.fn(event));
    } catch {
      /* ignore malformed frames */
    }
  };
  // EventSource retries on its own; poll meanwhile so nothing goes stale.
  source.onerror = startPolling;
}

function disconnect() {
  source?.close();
  source = null;
  stopPolling();
}

/**
 * Calls `onEvent` for matching live events (and on fallback poll ticks).
 * Typical use: `useLive(["order.updated"], () => mutate())`.
 * @param types - event types to listen for
 */
export function useLive(types: LiveEventType[], onEvent: Handler) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  const key = types.join(",");
  useEffect(() => {
    const sub: Sub = { types: key.split(","), fn: (e) => handler.current(e) };
    subs.add(sub);
    connect();
    return () => {
      subs.delete(sub);
      if (subs.size === 0) disconnect();
    };
  }, [key]);
}
