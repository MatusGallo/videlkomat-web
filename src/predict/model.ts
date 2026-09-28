import type { DemandZone, Evaluation, ModelParams, Stand, TravelFn } from "./types";
import { moveMinutes } from "./geo";

// Čistý model poptávky a šance na získání zakázky (bez Reactu, bez I/O).
// Den d: 0 = Po … 6 = Ne, hodina h: 0–23.

export const isWeekend = (d: number): boolean => d >= 5;

const sum = (a: number[]): number => a.reduce((s, x) => s + x, 0);

// Profil normalizovaný na součet 1 (podíl hodiny na denní poptávce).
export const normalizeProfile = (profile: number[]): number[] => {
  const total = sum(profile);
  return total > 0 ? profile.map((x) => x / total) : profile.map(() => 0);
};

// Vlastní profil úseku (z importu dat, když je jich dost), jinak společný.
export const hourShare = (params: ModelParams, d: number, h: number, zone?: DemandZone): number => {
  const src = zone?.profiles ?? params.profiles;
  const prof = isWeekend(d) ? src.weekend : src.weekday;
  const total = sum(prof);
  return total > 0 ? prof[h] / total : 0;
};

export const congestionAt = (params: ModelParams, d: number, h: number): number =>
  (isWeekend(d) ? params.weekendCongestion : 1) * params.congestion[h];

// p(T) – šance, že zakázku získám při dojezdu T minut (logistická křivka).
export const captureProb = (T: number, capture: ModelParams["capture"]): number =>
  1 / (1 + Math.exp((T - capture.tHalf) / capture.k));

// Fáze 1: dojezd = T0 × (1 + impact × kongesce). Chybějící T0 = nedosažitelné.
export const corridorTravel: TravelFn = (params, stand, zone, d, h) => {
  const t0 = stand.t0[zone.id];
  if (t0 == null || !Number.isFinite(t0)) return Infinity;
  return t0 * (1 + params.congestionImpact * congestionAt(params, d, h));
};

// λ(s, d, h) = A_s × W_s / 365 × DF[d] / mean(DF) × share(d, h) × datum(d)
// datum(d) = svátek × měsíc pro konkrétní týden (withCalendar), jinak 1.
export const zoneDemand = (params: ModelParams, zone: DemandZone, d: number, h: number): number => {
  const avgDF = sum(params.dayFactor) / params.dayFactor.length;
  return (
    ((zone.annual * zone.weight * (zone.learn ?? 1)) / 365) *
    (params.dayFactor[d] / avgDF) *
    hourShare(params, d, h, zone) *
    (params.dateScale?.[d] ?? 1)
  );
};

export const standScore = (
  params: ModelParams,
  stand: Stand,
  lam: number[],
  d: number,
  h: number,
  travel: TravelFn = corridorTravel,
): number =>
  params.zones.reduce(
    (s, zone, i) => s + lam[i] * captureProb(travel(params, stand, zone, d, h), params.capture),
    0,
  );

export function evaluate(params: ModelParams, d: number, h: number, travel: TravelFn = corridorTravel): Evaluation {
  const lam = params.zones.map((z) => zoneDemand(params, z, d, h));
  const scores = params.stands.map((st) => standScore(params, st, lam, d, h, travel));
  let best = -1;
  scores.forEach((s, i) => {
    if (best === -1 || s > scores[best]) best = i;
  });
  return { lam, scores, best };
}

// Počet zakázek je Poissonův → P(aspoň jedna) = 1 − e^(−skóre).
export const probAtLeastOne = (score: number): number => 1 - Math.exp(-score);

// Hodina h + offset → [den, hodina] s přechodem přes půlnoc (i z neděle na pondělí).
export const addHours = (d: number, h: number, offset: number): [number, number] => {
  const total = d * 24 + h + offset;
  const wrapped = ((total % 168) + 168) % 168;
  return [Math.floor(wrapped / 24), wrapped % 24];
};

const bestScore = (params: ModelParams, d: number, h: number, travel: TravelFn): number => {
  const ev = evaluate(params, d, h, travel);
  return ev.best === -1 ? 0 : ev.scores[ev.best];
};

// Očekávané zakázky za směnu: Σ přes `hours` hodin od (d, h) max_j skóre(j).
// Předpoklad: řidič se každou hodinu přesune na nejlepší stanoviště.
export function shiftExpectation(
  params: ModelParams,
  d: number,
  h: number,
  hours = 8,
  travel: TravelFn = corridorTravel,
): number {
  let total = 0;
  for (let i = 0; i < hours; i++) {
    const [dd, hh] = addHours(d, h, i);
    total += bestScore(params, dd, hh, travel);
  }
  return total;
}

export type WeekCell = { d: number; h: number; prob: number; best: number };

// Mřížka 7 × 24: nejlepší dosažitelná P(≥1 zakázka) v dané hodině.
export function weekGrid(params: ModelParams, travel: TravelFn = corridorTravel): WeekCell[][] {
  return Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 24 }, (_, h) => {
      const ev = evaluate(params, d, h, travel);
      return { d, h, best: ev.best, prob: ev.best === -1 ? 0 : probAtLeastOne(ev.scores[ev.best]) };
    }),
  );
}

export const topWindows = (grid: WeekCell[][], n = 5): WeekCell[] =>
  grid
    .flat()
    .slice()
    .sort((a, b) => b.prob - a.prob || a.d - b.d || a.h - b.h)
    .slice(0, n);

// Pondělí = 0 (Date.getDay() má neděli = 0).
export const mondayIndex = (date: Date): number => (date.getDay() + 6) % 7;

// Poptávka jedné zóny přes 24 hodin dne d (pro graf u detailu úseku).
export const zoneDayProfile = (params: ModelParams, zone: DemandZone, d: number): number[] =>
  Array.from({ length: 24 }, (_, h) => zoneDemand(params, zone, d, h));

// Dosah stanoviště: šance, že na zónu dorazím první, a dojezd v minutách.
export const standReach = (params: ModelParams, stand: Stand, d: number, h: number, travel: TravelFn = corridorTravel) =>
  params.zones.map((zone) => {
    const T = travel(params, stand, zone, d, h);
    return { zoneId: zone.id, minutes: T, capture: captureProb(T, params.capture) };
  });

export type PlanHour = { d: number; h: number; best: number; score: number; moveMinutes: number };
export type PlanBlock = { d: number; h: number; hours: number; best: number; expected: number; moveMinutes: number };
// Doba přesunu mezi stanovišti [min].
export type MoveFn = (from: Stand, to: Stand) => number;

export const defaultMove: MoveFn = (a, b) => (a.id !== b.id && a.geo && b.geo ? moveMinutes(a.geo, b.geo) : 0);

// Plán směny s cenou přesunu: pro každou hodinu stanoviště tak, aby součet
// očekávaných zakázek byl co největší. Hodina, ve které se přesouvám M minut,
// vynese na novém místě jen (1 − M/60) svého skóre – přesun přes půl Prahy se
// tedy vyplatí, jen když tam poptávka vydrží. Řeší se dynamickým programováním
// přes hodiny. Přechází přes půlnoc i z neděle na pondělí.
// `startMove` = minuty z aktuální polohy ke každému stanovišti: první hodina se
// pak počítá i s cenou cesty odsud (po zakázce za Prahou nemusí vyjít návrat).
export function shiftPlan(
  params: ModelParams,
  d: number,
  h: number,
  hours: number,
  opts: { travel?: TravelFn; move?: MoveFn; startMove?: number[] } = {},
): { hours: PlanHour[]; blocks: PlanBlock[]; expected: number } {
  const travel = opts.travel ?? corridorTravel;
  const move = opts.move ?? defaultMove;
  const S = params.stands.length;
  const slots = Array.from({ length: hours }, (_, i) => addHours(d, h, i));
  if (S === 0 || hours <= 0) {
    const empty = slots.map(([dd, hh]) => ({ d: dd, h: hh, best: -1, score: 0, moveMinutes: 0 }));
    return { hours: empty, blocks: empty.length ? [{ ...empty[0], hours: empty.length, expected: 0 }] : [], expected: 0 };
  }
  const scores = slots.map(([dd, hh]) => evaluate(params, dd, hh, travel).scores);
  const M = params.stands.map((a) => params.stands.map((b) => move(a, b)));
  const keep = (j: number, k: number) => Math.max(0, 1 - M[j][k] / 60);
  const start = opts.startMove;
  const keepStart = (k: number) => (start ? Math.max(0, 1 - (start[k] ?? Infinity) / 60) : 1);

  // dp[i][k] = nejlepší součet do hodiny i, když hodinu i končím na k
  const dp: number[][] = [scores[0].map((s, k) => s * keepStart(k))];
  const from: number[][] = [scores[0].map(() => -1)];
  for (let i = 1; i < hours; i++) {
    dp.push(new Array(S).fill(-Infinity));
    from.push(new Array(S).fill(-1));
    for (let k = 0; k < S; k++)
      for (let j = 0; j < S; j++) {
        const v = dp[i - 1][j] + scores[i][k] * keep(j, k);
        if (v > dp[i][k]) { dp[i][k] = v; from[i][k] = j; }
      }
  }
  let k = 0;
  for (let j = 1; j < S; j++) if (dp[hours - 1][j] > dp[hours - 1][k]) k = j;
  const path: number[] = new Array(hours);
  for (let i = hours - 1; i >= 0; i--) { path[i] = k; k = from[i][k]; }

  const list: PlanHour[] = slots.map(([dd, hh], i) => {
    const moved = i > 0 ? (path[i] !== path[i - 1] ? M[path[i - 1]][path[i]] : 0) : start ? start[path[0]] ?? 0 : 0;
    const score = i > 0 ? scores[i][path[i]] * keep(path[i - 1], path[i]) : scores[0][path[0]] * keepStart(path[0]);
    return { d: dd, h: hh, best: path[i], score, moveMinutes: moved };
  });
  const blocks: PlanBlock[] = [];
  for (const p of list) {
    const last = blocks[blocks.length - 1];
    if (last && last.best === p.best) {
      last.hours += 1;
      last.expected += p.score;
    } else {
      blocks.push({ d: p.d, h: p.h, hours: 1, best: p.best, expected: p.score, moveMinutes: p.moveMinutes });
    }
  }
  return { hours: list, blocks, expected: list.reduce((s, p) => s + p.score, 0) };
}

// Hranice špičky: kvantil q z nejlepších šancí v týdnu (výchozí horní čtvrtina).
export function peakThreshold(grid: WeekCell[][], q = 0.75): number {
  const all = grid.flat().map((c) => c.prob).sort((a, b) => a - b);
  if (all.length === 0) return 1;
  return all[Math.min(all.length - 1, Math.floor(q * all.length))];
}
