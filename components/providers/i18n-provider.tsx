// Client i18n context: current UI language, `t()` and a setter that also
// persists the choice to the user's profile.
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { sendJSON } from "@/lib/fetcher";
import { translate, type Lang, type MessageKey } from "@/lib/i18n";

interface I18nValue {
  lang: Lang;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18nValue>({
  lang: "en",
  t: (key, vars) => translate("en", key, vars),
  setLang: () => {},
});

/**
 * @param initial - language from the user's profile
 * @param persist - save changes to /api/auth/me (off for roles that only use English)
 */
export function I18nProvider({
  initial,
  persist = true,
  children,
}: {
  initial: Lang;
  persist?: boolean;
  children: React.ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      if (persist) sendJSON("/api/auth/me", { language: next }, "PATCH").catch(() => {});
    },
    [persist],
  );
  // Lets screen readers and the browser pick the right voice and fonts.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Access the current language and translator. */
export function useI18n() {
  return useContext(I18nContext);
}
