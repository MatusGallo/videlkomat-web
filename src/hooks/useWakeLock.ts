import { useEffect, useState } from "react";

const KEY = "odtah_nezhasinat_v1";

const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const write = (on: boolean) => {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* noop */
  }
};

export type WakeState = { supported: boolean; on: boolean; toggle: () => void };

// Nezhasínat displej, dokud je `active` (řidič čeká s otevřenou záložkou Teď).
// Prohlížeč zámek pustí při skrytí stránky – po návratu ho vezmeme znovu.
export function useWakeLock(active: boolean): WakeState {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [on, setOn] = useState(read);

  useEffect(() => {
    if (!supported || !on || !active) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) l.release().catch(() => {});
          else lock = l;
        })
        .catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, [supported, on, active]);

  const toggle = () =>
    setOn((v) => {
      write(!v);
      return !v;
    });

  return { supported, on, toggle };
}
