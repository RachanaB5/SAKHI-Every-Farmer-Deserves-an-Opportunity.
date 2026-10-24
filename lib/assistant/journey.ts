// The hand-off from the voice sign-up to the farmer app: the sign-up guide
// leaves a short note in this tab, and Sakhi picks it up on the
// farmer home to carry on, in the same language, with the first harvest.
"use client";

import type { AssistantLang } from "./intents";

const KEY = "ff-journey";
/** A note older than this is ignored (the farmer wandered off). */
const FRESH_MS = 15 * 60_000;

export interface Journey {
  lang: AssistantLang;
  name: string;
  at: number;
}

/** Called when a voice sign-up creates the account. */
export function startJourney(j: Omit<Journey, "at">) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...j, at: Date.now() }));
  } catch {
    /* no storage: the farmer still gets the normal welcome */
  }
}

/** Reads the note without using it up; null when there is none or it's stale. */
export function peekJourney(): Journey | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Journey;
    return Date.now() - j.at < FRESH_MS ? j : null;
  } catch {
    return null;
  }
}

/** Uses the note up, so the journey starts only once. */
export function clearJourney() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}
