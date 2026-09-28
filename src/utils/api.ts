import type { Entry, Fuel } from "../types";
import type { JobLog, ModelParams } from "../predict/types";
import { AUTH_PW_KEY } from "./auth";

const headers = (): HeadersInit => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem(AUTH_PW_KEY) ?? ""}`,
});

async function call(method: string, url: string, body?: unknown): Promise<Response> {
  const r = await fetch(url, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status}`);
  return r;
}

export type Resource<T> = {
  list: () => Promise<T[]>;
  upsert: (item: T) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

// Obě tabulky (/api/entries, /api/fuel) mají stejné REST rozhraní.
function resource<T>(path: string): Resource<T> {
  return {
    list: async () => (await (await call("GET", path)).json()) as T[],
    upsert: async (item) => {
      await call("POST", path, item);
    },
    remove: async (id) => {
      await call("DELETE", `${path}?id=${encodeURIComponent(id)}`);
    },
  };
}

export const entriesApi = resource<Entry>("/api/entries");
export const fuelApi = resource<Fuel>("/api/fuel");

// Kde čekat – výjezdy a verzované parametry modelu.
export const jobsApi = resource<JobLog>("/api/jobs");
export type ParamsRow = { id: string; params: ModelParams };
export const paramsApi = resource<ParamsRow>("/api/params");
