import type { Entry, Fuel } from "../types";
import { STORAGE_KEY, FUEL_STORAGE_KEY } from "../constants";

export const loadEntries = (): Entry[] => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? (JSON.parse(v) as Entry[]) : [];
  } catch {
    return [];
  }
};

export const saveEntries = (a: Entry[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    /* noop */
  }
};

export const loadFuels = (): Fuel[] => {
  try {
    const v = localStorage.getItem(FUEL_STORAGE_KEY);
    return v ? (JSON.parse(v) as Fuel[]) : [];
  } catch {
    return [];
  }
};

export const saveFuels = (a: Fuel[]): void => {
  try {
    localStorage.setItem(FUEL_STORAGE_KEY, JSON.stringify(a));
  } catch {
    /* noop */
  }
};
