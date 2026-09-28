import { useState, useCallback, type ReactNode } from "react";
import { type Settings, SettingsCtx, loadSettings, saveSettings } from "./settings";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const persist = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next);
  }, []);
  return (
    <SettingsCtx.Provider
      value={{
        settings,
        setSelectedYear: (year) => persist({ ...settings, selectedYear: year }),
      }}
    >
      {children}
    </SettingsCtx.Provider>
  );
}
