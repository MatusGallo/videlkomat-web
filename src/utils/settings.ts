import { createContext, useContext } from "react";

export type Settings = {
  selectedYear: number;
};

const SETTINGS_KEY = "vydelkomat_settings_v1";

const DEFAULT_SETTINGS: Settings = {
  selectedYear: new Date().getFullYear(),
};

export const loadSettings = (): Settings => {
  try {
    const v = localStorage.getItem(SETTINGS_KEY);
    if (!v) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(v) as Partial<Settings>;
    return {
      selectedYear: typeof parsed.selectedYear === "number" ? parsed.selectedYear : DEFAULT_SETTINGS.selectedYear,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (s: Settings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
};

export type SettingsCtxValue = {
  settings: Settings;
  setSelectedYear: (year: number) => void;
};

export const SettingsCtx = createContext<SettingsCtxValue | null>(null);

export function useSettings(): SettingsCtxValue {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
