import { useEffect, useState } from "react";
import type { GeoPoint } from "../predict/types";

const KEY = "odtah_gps_v1";

export type GeoState = {
  supported: boolean;
  on: boolean;
  pos: { pos: GeoPoint; accuracy: number; at: number } | null;
  error: string | null;
  toggle: () => void;
};

const read = () => {
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

// Moje poloha (GPS) – jen po zapnutí řidičem; volba si pamatuje zařízení.
// Poloha zůstává v zařízení, nikam se neposílá.
export function useGeoPosition(): GeoState {
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const [on, setOn] = useState(() => supported && read());
  const [pos, setPos] = useState<GeoState["pos"]>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!on || !supported) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError(null);
        setPos({ pos: { lat: p.coords.latitude, lng: p.coords.longitude }, accuracy: p.coords.accuracy, at: p.timestamp });
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          setError("Přístup k poloze je v prohlížeči zakázaný.");
          setOn(false);
          write(false);
        } else setError("Polohu se nedaří zjistit.");
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [on, supported]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    write(next);
    if (!next) setPos(null);
    setError(null);
  };

  return { supported, on, pos: on ? pos : null, error, toggle };
}
