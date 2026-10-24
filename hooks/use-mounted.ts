// True only after hydration on the client — for UI that depends on the
// browser's clock, time zone or storage and must not be server-rendered.
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** false during SSR and hydration, true afterwards. */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
