import { useState } from "react";

const KEY = "odtah_vyjezd_bezi_v1";

// Rozjetý výjezd: kdy jsem vyjel a odkud. Drží se v zařízení (přežije zavření
// appky), do cloudu jde až hotový záznam výjezdu.
export type ActiveJob = { startedAt: string; standId: string };

const read = (): ActiveJob | null => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v.startedAt === "string" && typeof v.standId === "string" ? v : null;
  } catch {
    return null;
  }
};
const write = (v: ActiveJob | null) => {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
};

export type ActiveJobState = {
  job: ActiveJob | null;
  start: (standId: string) => void;
  clear: () => void;
};

export function useActiveJob(): ActiveJobState {
  const [job, setJob] = useState<ActiveJob | null>(read);
  const start = (standId: string) => {
    const v = { startedAt: new Date().toISOString(), standId };
    write(v);
    setJob(v);
  };
  const clear = () => {
    write(null);
    setJob(null);
  };
  return { job, start, clear };
}
