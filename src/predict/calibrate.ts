import type { JobLog, JobSource, ModelParams } from "./types";
import { mondayIndex, zoneDemand } from "./model";

// Kalibrace z vlastních výjezdů. Čisté funkce – volá je UI (tlačítko
// „Kalibrovat") i scripts/calibrate.ts (ruční / periodické spuštění).

// Pod tímto počtem kalibraci nepouštíme vůbec, pod TARGET je jen orientační.
export const CALIBRATION_MIN = 30;
export const CALIBRATION_TARGET = 200;

export type LogisticFit = { b0: number; b1: number; iterations: number };

// Logistická regrese won ~ x (Newton–Raphson). Drobná ridge penalizace drží
// odhad konečný i u dokonale separovaných dat (všechno blízko = získáno).
export function fitLogistic(x: number[], y: number[], ridge = 1e-3, maxIter = 50): LogisticFit {
  let b0 = 0;
  let b1 = 0;
  let it = 0;
  for (; it < maxIter; it++) {
    let g0 = 0, g1 = -ridge * b1;
    let h00 = 0, h01 = 0, h11 = ridge;
    for (let i = 0; i < x.length; i++) {
      const p = 1 / (1 + Math.exp(-(b0 + b1 * x[i])));
      const w = p * (1 - p);
      g0 += y[i] - p;
      g1 += (y[i] - p) * x[i];
      h00 += w;
      h01 += w * x[i];
      h11 += w * x[i] * x[i];
    }
    const det = h00 * h11 - h01 * h01;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) break;
    const d0 = (h11 * g0 - h01 * g1) / det;
    const d1 = (h00 * g1 - h01 * g0) / det;
    b0 += d0;
    b1 += d1;
    if (Math.abs(d0) < 1e-8 && Math.abs(d1) < 1e-8) break;
  }
  return { b0, b1, iterations: it };
}

export type SourceStat = { n: number; wonRate: number };

export type CalibrationResult =
  | {
      ok: true;
      n: number;
      tHalf: number;
      k: number;
      // Orientační, dokud n < CALIBRATION_TARGET.
      preliminary: boolean;
      breakdownShare: number;
      bySource: Partial<Record<JobSource, SourceStat>>;
    }
  | { ok: false; n: number; reason: string };

export function calibrate(jobs: JobLog[]): CalibrationResult {
  const valid = jobs.filter((j) => Number.isFinite(j.travelMinutes) && j.travelMinutes >= 0);
  const n = valid.length;
  if (n < CALIBRATION_MIN) {
    return { ok: false, n, reason: `Potřeba aspoň ${CALIBRATION_MIN} výjezdů (zatím ${n}).` };
  }
  const won = valid.filter((j) => j.result === "won").length;
  if (won === 0 || won === n) {
    return { ok: false, n, reason: "Potřeba získané i předběhnuté zakázky." };
  }
  const { b0, b1 } = fitLogistic(
    valid.map((j) => j.travelMinutes),
    valid.map((j) => (j.result === "won" ? 1 : 0)),
  );
  // p = σ(b0 + b1·T) = 1 / (1 + exp((T − T_half) / k)) ⇒ k = −1/b1, T_half = −b0/b1
  if (!(b1 < 0)) {
    return { ok: false, n, reason: "Z dat nevychází, že by delší dojezd snižoval šanci." };
  }
  const k = -1 / b1;
  const tHalf = -b0 / b1;

  const bySource: Partial<Record<JobSource, SourceStat>> = {};
  for (const j of valid) {
    const s = (bySource[j.source] ??= { n: 0, wonRate: 0 });
    s.wonRate = (s.wonRate * s.n + (j.result === "won" ? 1 : 0)) / (s.n + 1);
    s.n += 1;
  }

  return {
    ok: true,
    n,
    tHalf,
    k,
    preliminary: n < CALIBRATION_TARGET,
    breakdownShare: valid.filter((j) => j.kind === "breakdown").length / n,
    bySource,
  };
}

// ── Učení poptávky po úsecích ──────────────────────────────────────────────
// Kolik výjezdů by mělo připadnout na úsek, kdyby model seděl: u každého
// výjezdu podíl úseku na celkové poptávce v danou hodinu (E). Skutečný počet O.
// Násobek (O + K) / (E + K) – K „pseudovýjezdů" drží úseky s málo daty u 1.
export const LEARN_MIN = 20;
const LEARN_PRIOR = 5;
const LEARN_CLAMP: [number, number] = [0.33, 3];

export type ZoneLearn = { zoneId: string; observed: number; expected: number; factor: number };
export type LearningResult = { ok: true; n: number; zones: ZoneLearn[] } | { ok: false; n: number; reason: string };

export function zoneLearning(params: ModelParams, jobs: JobLog[]): LearningResult {
  const idx = new Map(params.zones.map((z, i) => [z.id, i]));
  const valid = jobs.filter((j) => idx.has(j.segmentId) && !isNaN(new Date(j.calledAt).getTime()));
  if (valid.length < LEARN_MIN) {
    return { ok: false, n: valid.length, reason: `Potřeba aspoň ${LEARN_MIN} výjezdů na známých úsecích (zatím ${valid.length}).` };
  }
  // Počítá se z poptávky bez dřívějšího naučeného násobku (učení se nesčítá).
  const base = params.zones.map((z) => ({ ...z, learn: undefined }));
  const O = new Array(base.length).fill(0);
  const E = new Array(base.length).fill(0);
  for (const j of valid) {
    const t = new Date(j.calledAt);
    const d = mondayIndex(t), h = t.getHours();
    const lam = base.map((z) => zoneDemand(params, z, d, h));
    const tot = lam.reduce((a, b) => a + b, 0);
    if (tot > 0) lam.forEach((l, i) => (E[i] += l / tot));
    O[idx.get(j.segmentId)!] += 1;
  }
  const zones = base.map((z, i) => ({
    zoneId: z.id,
    observed: O[i],
    expected: E[i],
    factor: Math.min(LEARN_CLAMP[1], Math.max(LEARN_CLAMP[0], (O[i] + LEARN_PRIOR) / (E[i] + LEARN_PRIOR))),
  }));
  return { ok: true, n: valid.length, zones };
}

export const withZoneLearning = (params: ModelParams, result: { zones: ZoneLearn[] }, now = new Date()): ModelParams => {
  const f = new Map(result.zones.map((z) => [z.zoneId, z.factor]));
  return {
    ...params,
    version: params.version + 1,
    createdAt: now.toISOString(),
    source: "calibration",
    zones: params.zones.map((z) => ({ ...z, learn: f.get(z.id) ?? z.learn })),
  };
};

// Nová verze parametrů s kalibrovanou křivkou p(T). Ostatní parametry beze změny.
export const withCalibration = (
  params: ModelParams,
  fit: { tHalf: number; k: number },
  now = new Date(),
): ModelParams => ({
  ...params,
  version: params.version + 1,
  createdAt: now.toISOString(),
  source: "calibration",
  capture: { tHalf: fit.tHalf, k: fit.k },
});
