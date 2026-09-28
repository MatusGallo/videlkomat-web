import type { Entry, Fuel } from "../types";
import type { JobLog } from "../predict/types";
import type { ParamsRow } from "./api";
import { STORAGE_KEY, FUEL_STORAGE_KEY, JOBS_STORAGE_KEY, PARAMS_STORAGE_KEY } from "../constants";

const loader = <T>(key: string) => (): T[] => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T[]) : [];
  } catch {
    return [];
  }
};

const saver = <T>(key: string) => (a: T[]): void => {
  try {
    localStorage.setItem(key, JSON.stringify(a));
  } catch {
    /* noop */
  }
};

export const loadEntries = loader<Entry>(STORAGE_KEY);
export const saveEntries = saver<Entry>(STORAGE_KEY);
export const loadFuels = loader<Fuel>(FUEL_STORAGE_KEY);
export const saveFuels = saver<Fuel>(FUEL_STORAGE_KEY);
export const loadJobs = loader<JobLog>(JOBS_STORAGE_KEY);
export const saveJobs = saver<JobLog>(JOBS_STORAGE_KEY);
export const loadParamRows = loader<ParamsRow>(PARAMS_STORAGE_KEY);
export const saveParamRows = saver<ParamsRow>(PARAMS_STORAGE_KEY);
