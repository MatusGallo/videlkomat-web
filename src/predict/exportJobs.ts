import type { JobLog } from "./types";

const COLUMNS: (keyof JobLog)[] = [
  "id", "calledAt", "segmentId", "direction", "standId",
  "travelMinutes", "kind", "result", "source", "entryId", "lat", "lng",
];

const cell = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const jobsToCSV = (jobs: JobLog[]): string =>
  [COLUMNS.join(","), ...jobs.map((j) => COLUMNS.map((c) => cell(j[c])).join(","))].join("\n") + "\n";

export const jobsToJSON = (jobs: JobLog[]): string => JSON.stringify(jobs, null, 2);
