// Kalibrace křivky p(T) z výjezdů v Supabase → nová verze parametrů.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run calibrate [-- --dry-run]
//
// Dá se pustit ručně nebo periodicky (cron / GitHub Actions). Stejný výpočet
// jako tlačítko „Použít kalibraci" v aplikaci (src/predict/calibrate.ts).
import { calibrate, withCalibration } from "../src/predict/calibrate";
import { DEMO_PARAMS } from "../src/predict/demoParams";
import type { JobLog, ModelParams } from "../src/predict/types";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

if (!URL || !KEY) {
  console.error("Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = async (path: string, init?: RequestInit) => {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r;
};

type Row = Record<string, unknown>;

const jobs: JobLog[] = ((await (await sb("jobs?select=*")).json()) as Row[]).map((r) => ({
  id: String(r.id),
  calledAt: String(r.called_at),
  segmentId: String(r.segment_id),
  direction: (r.direction ?? null) as JobLog["direction"],
  standId: String(r.stand_id),
  travelMinutes: Number(r.travel_minutes),
  kind: r.kind as JobLog["kind"],
  result: r.result as JobLog["result"],
  source: r.source as JobLog["source"],
  entryId: (r.entry_id ?? null) as string | null,
  lat: r.lat == null ? null : Number(r.lat),
  lng: r.lng == null ? null : Number(r.lng),
}));

const latest = ((await (await sb("predict_params?select=data&order=version.desc&limit=1")).json()) as { data: ModelParams }[])[0];
const params = latest?.data ?? DEMO_PARAMS;

const result = calibrate(jobs);
if (!result.ok) {
  console.log(`Kalibrace neproběhla: ${result.reason}`);
  process.exit(0);
}

console.log(`Výjezdů: ${result.n}${result.preliminary ? " (orientační)" : ""}`);
console.log(`T_half: ${params.capture.tHalf.toFixed(2)} → ${result.tHalf.toFixed(2)} min`);
console.log(`k:      ${params.capture.k.toFixed(2)} → ${result.k.toFixed(2)}`);
console.log(`Podíl poruch: ${(result.breakdownShare * 100).toFixed(0)} %`);
for (const [src, s] of Object.entries(result.bySource)) {
  console.log(`  ${src}: ${s.n}× · získáno ${(s.wonRate * 100).toFixed(0)} %`);
}

if (dryRun) {
  console.log("--dry-run: nic se neuložilo.");
  process.exit(0);
}

const next = withCalibration(params, result);
await sb("predict_params", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({ id: crypto.randomUUID(), version: next.version, source: next.source, data: next }),
});
console.log(`Uloženo jako parametry v${next.version}.`);
