"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { type UserPreferences, DEFAULT_PREFERENCES, loadPreferences, savePreferences } from "@/lib/shared/preferences";

function applyTheme(theme: "dark" | "light") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

interface PreferencesContextValue {
  prefs: UserPreferences;
  update: (patch: Partial<UserPreferences>) => void;
  reset: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  prefs: DEFAULT_PREFERENCES,
  update: () => {},
  reset: () => {},
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);

  // Load from localStorage after mount (SSR guard)
  useEffect(() => {
    const saved = loadPreferences();
    setPrefs(saved);
    applyTheme(saved.theme);
  }, []);

  const update = useCallback((patch: Partial<UserPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch, _version: 1 as const };
      savePreferences(next);
      if (patch.theme) applyTheme(patch.theme);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const defaults = { ...DEFAULT_PREFERENCES };
    setPrefs(defaults);
    savePreferences(defaults);
    applyTheme(defaults.theme);
  }, []);

  return <PreferencesContext.Provider value={{ prefs, update, reset }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
