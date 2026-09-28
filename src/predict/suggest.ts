import type { GeoPoint, ModelParams } from "./types";
import { captureProb, congestionAt, evaluate, zoneDemand } from "./model";
import { distanceKm, estimateT0, pointAlong } from "./geo";

// Návrh nových stanovišť: kandidáti podél sítě (konce a středy úseků), pro
// každého odhad dojezdů z polohy. Řadí se podle očekávaných zakázek za týden,
// kdyby řidič čekal jen tam (`weekly`) – to jsou dobrá místa k prověření.
// `gainPerWeek` říká, o kolik by místo zvedlo týdenní součet max_j skóre
// proti stávajícím stanovištím (u jednoho vozu často 0, když vede „uzel").

export type Suggestion = {
  pos: GeoPoint;
  zoneId: string; // nejbližší úsek (pro popis)
  weekly: number; // očekávané zakázky za týden, kdyby se čekalo jen tady
  gainPerWeek: number; // o kolik by zvedlo týdenní součet nejlepších stanovišť
  t0: Record<string, number>;
};

const HOURS: [number, number][] = [];
for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) HOURS.push([d, h]);

// Odhad ze vzdálenosti vs. dojezdy stávajících stanovišť (OSRM / ruční):
// medián poměru srovná kandidáty se stávajícími, ať nevyhrávají jen díky vzorci.
function estimateBias(params: ModelParams): number {
  const r: number[] = [];
  for (const s of params.stands) {
    if (!s.geo) continue;
    for (const z of params.zones) {
      const t = s.t0[z.id];
      const e = z.geo ? estimateT0(s.geo, z.geo.path) : null;
      if (t != null && e != null && e > 0) r.push(t / e);
    }
  }
  if (r.length === 0) return 1;
  r.sort((a, b) => a - b);
  return r[Math.floor(r.length / 2)];
}

export function suggestStands(params: ModelParams, n = 3, spacingKm = 2.5, minFromExistingKm = 1): Suggestion[] {
  const zones = params.zones.filter((z) => z.geo && z.geo.path.length > 1);
  if (zones.length === 0) return [];
  const bias = estimateBias(params);
  const lam = HOURS.map(([d, h]) => params.zones.map((z) => zoneDemand(params, z, d, h)));
  const cong = HOURS.map(([d, h]) => 1 + params.congestionImpact * congestionAt(params, d, h));
  const cur = HOURS.map(([d, h]) => {
    const ev = evaluate(params, d, h);
    return ev.best === -1 ? 0 : ev.scores[ev.best];
  });

  // Kandidáti: začátek a střed každého úseku, bez duplicit do 500 m.
  const cands: { pos: GeoPoint; zoneId: string }[] = [];
  for (const z of zones) {
    for (const t of [0, 0.5]) {
      const p = pointAlong(z.geo!.path, t);
      if (p && !cands.some((c) => distanceKm(c.pos, p) < 0.5)) cands.push({ pos: p, zoneId: z.id });
    }
  }
  const existing = params.stands.flatMap((s) => (s.geo ? [s.geo] : []));
  const scored = cands
    .filter((c) => existing.every((g) => distanceKm(g, c.pos) >= minFromExistingKm))
    .map((c) => {
      const t0: Record<string, number> = {};
      params.zones.forEach((z) => {
        const e = z.geo ? estimateT0(c.pos, z.geo.path) : null;
        if (e != null) t0[z.id] = Math.round(e * bias * 10) / 10;
      });
      const score = HOURS.map((_, k) =>
        params.zones.reduce((s, z, i) => (t0[z.id] == null ? s : s + lam[k][i] * captureProb(t0[z.id] * cong[k], params.capture)), 0),
      );
      return { ...c, t0, score };
    });

  const ranked = scored
    .map((c) => ({ ...c, weekly: c.score.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.weekly - a.weekly);
  const picks: Suggestion[] = [];
  const best = cur.slice();
  for (const c of ranked) {
    if (picks.length >= n) break;
    if (picks.some((p) => distanceKm(p.pos, c.pos) < spacingKm)) continue;
    const gain = c.score.reduce((s, v, k) => s + Math.max(0, v - best[k]), 0);
    picks.push({ pos: c.pos, zoneId: c.zoneId, weekly: c.weekly, gainPerWeek: gain, t0: c.t0 });
    c.score.forEach((v, k) => (best[k] = Math.max(best[k], v)));
  }
  return picks;
}

// Slepá místa: úseky, kam v běžném provozu (všední den 10:00) žádné stanoviště
// nedojede do T_half – tam zakázky skoro jistě získá někdo jiný. (Ve špičce
// kongesce prodlouží dojezd až 2,3× a slepá by byla většina sítě.)
export function blindZones(params: ModelParams, d = 2, h = 10): string[] {
  const k = 1 + params.congestionImpact * congestionAt(params, d, h);
  return params.zones
    .filter((z) => {
      const tmin = Math.min(...params.stands.map((s) => (s.t0[z.id] ?? Infinity) * k));
      return tmin > params.capture.tHalf;
    })
    .map((z) => z.id);
}
