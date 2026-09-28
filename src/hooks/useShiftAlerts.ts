import { useEffect, useMemo, useState } from "react";
import type { ModelParams } from "../predict/types";
import { peakThreshold, weekGrid } from "../predict/model";
import { shiftAlert, type ShiftAlert } from "../predict/alerts";
import type { AlertsState } from "../components/predict/ShiftPlan";

const ON_KEY = "odtah_upozorneni_v1";
const LAST_KEY = "odtah_upozorneni_posledni_v1";
const TICK_MS = 30_000;

const supported = () => typeof window !== "undefined" && "Notification" in window;

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* noop */
  }
};

async function notify(a: ShiftAlert) {
  const opts: NotificationOptions = { body: a.body, icon: "/icon-192.png", tag: "vk-shift" };
  const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
  if (reg) await reg.showNotification(a.title, opts);
  else new Notification(a.title, opts);
}

// Upozornění 15 min před přesunem na jiné stanoviště / začátkem špičky.
// Běží v App, takže funguje v kterékoli sekci, dokud je appka otevřená.
export function useShiftAlerts(params: ModelParams): AlertsState {
  const [on, setOn] = useState(() => read(ON_KEY) === "1" && supported() && Notification.permission === "granted");
  const [denied, setDenied] = useState(() => supported() && Notification.permission === "denied");
  const peak = useMemo(() => peakThreshold(weekGrid(params)), [params]);

  useEffect(() => {
    if (!on) return;
    const tick = () => {
      const a = shiftAlert(params, new Date(), peak);
      if (!a || read(LAST_KEY) === a.key) return;
      write(LAST_KEY, a.key);
      notify(a).catch(() => {});
    };
    tick();
    const t = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(t);
  }, [on, params, peak]);

  const toggle = () => {
    if (on) {
      setOn(false);
      write(ON_KEY, "0");
      return;
    }
    if (!supported()) return;
    Notification.requestPermission().then((perm) => {
      const ok = perm === "granted";
      setOn(ok);
      setDenied(perm === "denied");
      write(ON_KEY, ok ? "1" : "0");
    });
  };

  return { on, status: !supported() ? "unsupported" : denied ? "denied" : "ok", toggle };
}
