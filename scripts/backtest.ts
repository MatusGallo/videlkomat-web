// Zpětný test modelu „Kde čekat" na historii nehod (src/predict/history.json).
//
//   npm run backtest [-- --split 2025-09-01]
//
// Model se naučí jen z nehod před datem --split (poptávka po úsecích, profily
// hodin, dny v týdnu) a porovná se s tím, co se stalo potom:
//   1. pořadí úseků (Spearman) a shoda top 10,
//   2. hodiny týdne – korelace předpovědi s realitou,
//   3. hodiny označené „Vysoká" – kolik nehod do nich opravdu spadlo,
//   4. stanoviště – předpověď vs. „realizované" zakázky (nehody × šance dorazit první),
// vždy proti naivnímu odhadu (poptávka podle délky úseku, rovnoměrně v čase).
import { DEMO_PARAMS } from "../src/predict/demoParams";
import { captureProb, corridorTravel, evaluate, weekGrid, peakThreshold } from "../src/predict/model";
import { pathLengthKm } from "../src/predict/geo";
import type { ModelParams } from "../src/predict/types";
import raw from "../src/predict/history.json";

type History = { from: string; daily: number[]; zones: string[]; events: number[][] };
const H = raw as History;
const args = process.argv.slice(2);
const split = args[args.indexOf("--split") + 1] && args.includes("--split") ? args[args.indexOf("--split") + 1] : "2025-09-01";

const [y0, m0, d0] = H.from.split("-").map(Number);
const dayAt = (i: number) => new Date(y0, m0 - 1, d0 + i);
const splitIdx = Math.round((new Date(split + "T00:00").getTime() - new Date(y0, m0 - 1, d0).getTime()) / 864e5);
const trainYears = splitIdx / 365.25;
const testYears = (H.daily.length - splitIdx) / 365.25;
const wd = (i: number) => (dayAt(i).getDay() + 6) % 7;

const zoneIds = DEMO_PARAMS.zones.map((z) => z.id);
const zi = new Map(zoneIds.map((id, i) => [id, i]));
type Ev = { day: number; h: number; z: number };
const events: Ev[] = H.events
  .map((e) => ({ day: e[0], h: e[1], z: zi.get(H.zones[e[2]]) ?? -1 }))
  .filter((e) => e.z >= 0);
const train = events.filter((e) => e.day < splitIdx);
const test = events.filter((e) => e.day >= splitIdx);

// ── Model z trénovacích dat (stejné vzorce jako import-cdv.ts) ──────────────
const smooth = (a: number[]) => a.map((_, h) => (a[(h + 23) % 24] + 2 * a[h] + a[(h + 1) % 24]) / 4);
const norm = (a: number[]) => { const s = a.reduce((x, y) => x + y, 0); return s > 0 ? a.map((x) => x / s) : a; };
const prof = (evs: Ev[]) => {
  const p = { weekday: new Array(24).fill(0), weekend: new Array(24).fill(0) };
  for (const e of evs) if (e.h >= 0) p[wd(e.day) >= 5 ? "weekend" : "weekday"][e.h]++;
  return { weekday: norm(smooth(p.weekday)), weekend: norm(smooth(p.weekend)) };
};
const perDay = new Array(7).fill(0);
const nDays = new Array(7).fill(0);
for (let i = 0; i < splitIdx; i++) nDays[wd(i)]++;
for (const e of train) perDay[wd(e.day)]++;
const perDayAvg = perDay.map((s, i) => s / nDays[i]);
const meanDay = perDayAvg.reduce((a, b) => a + b, 0) / 7;
const counts = new Array(zoneIds.length).fill(0);
for (const e of train) counts[e.z]++;
const common = prof(train);
const byRoad = new Map<string, Ev[]>();
for (const e of train) {
  const r = DEMO_PARAMS.zones[e.z].road ?? "?";
  byRoad.set(r, [...(byRoad.get(r) ?? []), e]);
}
const trained: ModelParams = {
  ...DEMO_PARAMS,
  calendar: undefined,
  profiles: common,
  dayFactor: perDayAvg.map((x) => x / meanDay),
  zones: DEMO_PARAMS.zones.map((z, i) => {
    const r = byRoad.get(z.road ?? "?") ?? [];
    return { ...z, annual: counts[i] / trainYears, learn: undefined, profiles: r.length >= 200 ? prof(r) : undefined };
  }),
};
// Naivní: poptávka úměrná délce úseku, rovnoměrně přes hodiny a dny.
const flat = new Array(24).fill(1 / 24);
const lenKm = DEMO_PARAMS.zones.map((z) => (z.geo ? pathLengthKm(z.geo.path) : 1));
const totalTrain = train.length / trainYears;
const naive: ModelParams = {
  ...trained,
  profiles: { weekday: flat, weekend: flat },
  dayFactor: new Array(7).fill(1),
  zones: trained.zones.map((z, i) => ({
    ...z,
    annual: (totalTrain * lenKm[i]) / lenKm.reduce((a, b) => a + b, 0),
    profiles: undefined,
  })),
};

// ── Metriky ────────────────────────────────────────────────────────────────
const rank = (a: number[]) => {
  const idx = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let k = 0; k < idx.length; ) {
    let j = k;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[k][0]) j++;
    for (let t = k; t <= j; t++) r[idx[t][1]] = (k + j) / 2;
    k = j + 1;
  }
  return r;
};
const pearson = (a: number[], b: number[]) => {
  const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? n / Math.sqrt(da * db) : 0;
};
const spearman = (a: number[], b: number[]) => pearson(rank(a), rank(b));
const top = (a: number[], n: number) => new Set(a.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).slice(0, n).map((x) => x[1]));
const pct = (x: number) => `${Math.round(x * 100)} %`;
const f2 = (x: number) => x.toFixed(2);

console.log(`Trénink: ${H.from} – ${split} (${train.length} nehod na síti), test: ${split} – konec (${test.length} nehod).\n`);

// 1. Úseky
const testCounts = new Array(zoneIds.length).fill(0);
for (const e of test) testCounts[e.z]++;
const predZ = trained.zones.map((z) => z.annual);
const naiveZ = naive.zones.map((z) => z.annual);
const t10 = top(testCounts, 10);
const overlap = (s: Set<number>) => [...s].filter((i) => t10.has(i)).length;
console.log("1) Pořadí úseků (Spearman ρ, 1 = stejné pořadí)");
console.log(`   model  ρ = ${f2(spearman(predZ, testCounts))}, top 10 shoda ${overlap(top(predZ, 10))}/10`);
console.log(`   naivní ρ = ${f2(spearman(naiveZ, testCounts))}, top 10 shoda ${overlap(top(naiveZ, 10))}/10`);

// 2. Hodiny týdne
const testHours = new Array(168).fill(0);
for (const e of test) if (e.h >= 0) testHours[wd(e.day) * 24 + e.h]++;
const hourPred = (p: ModelParams) => {
  const out: number[] = [];
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) out.push(evaluate(p, d, h).lam.reduce((a, b) => a + b, 0));
  return out;
};
console.log("\n2) Hodiny týdne (korelace předpovědi a skutečnosti, 168 hodin)");
console.log(`   model  r = ${f2(pearson(hourPred(trained), testHours))}`);
console.log(`   naivní r = ${f2(pearson(hourPred(naive), testHours))} (rovnoměrně – bez informace)`);

// 3. „Vysoká" hodiny
const grid = weekGrid(trained);
const hi = peakThreshold(grid, 0.75);
const hiCells = grid.flat().filter((c) => c.prob >= hi);
const inHi = hiCells.reduce((s, c) => s + testHours[c.d * 24 + c.h], 0);
const totalH = testHours.reduce((a, b) => a + b, 0);
console.log("\n3) Hodiny „Vysoká“ (horní čtvrtina týdne podle modelu)");
console.log(`   ${hiCells.length} ze 168 hodin (${pct(hiCells.length / 168)} času) → ${pct(inHi / totalH)} nehod v testu`);

// 4. Stanoviště: kolik zakázek by skutečně „chytilo" (nehody × p(T)).
const realized = trained.stands.map((st) => {
  let s = 0;
  for (const e of test) {
    const h = e.h >= 0 ? e.h : 12;
    s += captureProb(corridorTravel(trained, st, trained.zones[e.z], wd(e.day), h), trained.capture);
  }
  return s / testYears;
});
const predicted = (p: ModelParams) =>
  p.stands.map((_, j) => {
    let s = 0;
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) s += evaluate(p, d, h).scores[j];
    return (s * 365.25) / 7;
  });
const pm = predicted(trained), pn = predicted(naive);
const order = realized.map((_, i) => i).sort((a, b) => realized[b] - realized[a]);
console.log("\n4) Stanoviště – zachycené nehody za rok (test) vs. předpověď");
console.log(`   Spearman ρ: model ${f2(spearman(pm, realized))}, naivní ${f2(spearman(pn, realized))}`);
console.log(`   nejlepší v testu: ${trained.stands[order[0]].id} · ${trained.stands[order[0]].name}; model předpověděl ${trained.stands[pm.indexOf(Math.max(...pm))].id}`);
for (const i of order.slice(0, 6)) {
  const st = trained.stands[i];
  console.log(`   ${st.id.padEnd(3)} ${st.name.padEnd(34)} test ${realized[i].toFixed(1).padStart(5)}/rok · předpověď ${pm[i].toFixed(1).padStart(5)}/rok`);
}

// Proč vede nejlepší: kolik poptávky má do T_half.
const reach = (st: (typeof trained.stands)[number]) =>
  trained.zones.reduce((s, z) => ((st.t0[z.id] ?? Infinity) <= trained.capture.tHalf ? s + z.annual : s), 0);
console.log(`\n   Poptávka do ${trained.capture.tHalf} min (volný provoz) z top stanovišť:`);
for (const i of order.slice(0, 4)) console.log(`   ${trained.stands[i].id.padEnd(3)} ${reach(trained.stands[i]).toFixed(0).padStart(4)} nehod/rok`);
