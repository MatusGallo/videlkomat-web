// Páteřní síť Prahy (fáze 2) → src/predict/network.json
//
//   npm run build:network [-- --refresh] [-- --no-osrm]
//
// 1. Z OpenStreetMap (Overpass) stáhne dálnice a silnice pro motorová vozidla
//    v Praze (cache ve scripts/.osm-cache, --refresh stáhne znovu).
// 2. Pro každou silnici (MO, D0, radiály) složí osu. Radiály rozdělí na D0:
//    část uvnitř (id d1-01…) a za D0 až k okraji výřezu dat (id d1-x01…) –
//    policejní data pokrývají stejný výřez, takže i tam je reálná poptávka.
// 3. Osu rozdělí na úseky ~1,5–3,5 km u sjezdů a pojmenuje je podle sjezdů /
//    čtvrtí.
// 4. Dojezdy T0 ze stanovišť spočítá přes veřejný OSRM (routování nad OSM se
//    směrem jízdy). Posílají se jen souřadnice stanovišť a bodů na úsecích.
//
// Poptávka `annual` je zatím ODHAD z délky a typu silnice (DEMO) – reálná čísla
// dodá scripts/import-cdv.ts. Mapová data © přispěvatelé OpenStreetMap (ODbL).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CORRIDOR_PARAMS } from "../src/predict/corridorParams";
import type { DemandZone, Stand } from "../src/predict/types";

const args = process.argv.slice(2);
const REFRESH = args.includes("--refresh");
const NO_OSRM = args.includes("--no-osrm");
const CACHE = new URL("./.osm-cache/", import.meta.url);
const OUT = new URL("../src/predict/network.json", import.meta.url);
const BBOX = "49.93,14.20,50.19,14.73";
const [BOX_S, BOX_W, BOX_N, BOX_E] = BBOX.split(",").map(Number);
const inBox = (p: [number, number]) => p[0] >= BOX_S && p[0] <= BOX_N && p[1] >= BOX_W && p[1] <= BOX_E;
const CENTER: LatLng = [50.0835, 14.426];
const UA = "videlkomat-network/1.0";

type LatLng = [number, number];
type Way = { tags: Record<string, string>; geometry: { lat: number; lon: number }[] };
type OsmNode = { lat: number; lon: number; tags: Record<string, string> };

// ── Silnice ────────────────────────────────────────────────────────────────
type Group = { key: string; road: string; match: (t: Record<string, string>) => boolean; perKm: number; radial: boolean };
const GROUPS: Group[] = [
  { key: "mo", road: "MO", perKm: 60, radial: false, match: (t) => t.ref === "MO" || ["Jižní spojka", "Barrandovský most"].includes(t.name) },
  { key: "d0", road: "D0", perKm: 45, radial: false, match: (t) => t.ref === "D0" || t.name === "Pražský okruh" },
  { key: "d1", road: "D1", perKm: 45, radial: true, match: (t) => t.ref === "D1" || ["5. května", "Brněnská"].includes(t.name) },
  { key: "d5", road: "D5", perKm: 40, radial: true, match: (t) => t.ref === "D5" || t.ref === "5" || t.name === "Rozvadovská spojka" },
  { key: "d6", road: "D6", perKm: 40, radial: true, match: (t) => t.ref === "D6" || t.ref === "6" },
  { key: "d7", road: "D7", perKm: 40, radial: true, match: (t) => t.ref === "D7" || (t.ref === "7" && t.name !== "Pražský okruh") },
  { key: "d8", road: "D8", perKm: 40, radial: true, match: (t) => t.ref === "D8" || ["Cínovecká", "Liberecká", "V Holešovičkách"].includes(t.name) },
  { key: "d10", road: "D10", perKm: 40, radial: true, match: (t) => t.ref === "D10" || t.ref === "10M" || ["Novopacká", "Kbelská"].includes(t.name) },
  { key: "d11", road: "D11", perKm: 40, radial: true, match: (t) => t.ref === "D11" || ["Olomoucká", "Chlumecká"].includes(t.name) },
  { key: "r4", road: "R4", perKm: 40, radial: true, match: (t) => t.ref === "4" || (t.name === "Strakonická" && t.ref !== "MO") },
];

// Ukázková stanoviště pro celou síť (DEMO, přibližné polohy u sjezdů).
// A–D jsou z koridoru (fáze 1) a mají tam ruční dojezdy.
const NETWORK_STANDS: { id: string; name: string; lat: number; lng: number }[] = [
  { id: "E", name: "Zličín (D5 / D0)", lat: 50.0527, lng: 14.2915 },
  { id: "F", name: "Ruzyně – Lipská (D7)", lat: 50.1035, lng: 14.2905 },
  { id: "G", name: "Barrandovský most (MO / R4)", lat: 50.0395, lng: 14.4095 },
  { id: "H", name: "Pankrác – 5. května (D1)", lat: 50.0515, lng: 14.4395 },
  { id: "I", name: "Čestlice (D1 / D0)", lat: 50.0045, lng: 14.5705 },
  { id: "J", name: "Ďáblice – Cínovecká (D8)", lat: 50.1375, lng: 14.4805 },
  { id: "K", name: "Trojský most – Holešovice (MO)", lat: 50.1105, lng: 14.4285 },
  { id: "L", name: "Satalice – Novopacká (D10)", lat: 50.1215, lng: 14.5655 },
  { id: "M", name: "Strahovský tunel – Malovanka (MO)", lat: 50.0835, lng: 14.3845 },
  { id: "N", name: "Lahovice (R4 / D0)", lat: 49.9935, lng: 14.3945 },
  // Za D0: benzínky / odpočívky z OSM u radiál, na každé radiále místo s nejvyšší
  // poptávkou v dosahu (≥ ~3 km od ostatních). Id V1… se nepotkají s písmeny,
  // která dostávají vlastní stanoviště v editoru.
  { id: "V1", name: "Benzina Průhonice (D1)", lat: 50.01039, lng: 14.54266 },
  { id: "V2", name: "Benzina Dušníky (D5)", lat: 50.03354, lng: 14.2165 },
  { id: "V3", name: "Středokluky (D7)", lat: 50.13795, lng: 14.24395 },
  { id: "V4", name: "MOL Zdiby (D8)", lat: 50.16944, lng: 14.4604 },
  { id: "V5", name: "Orlen Chvaly (D10)", lat: 50.12472, lng: 14.61425 },
  { id: "V6", name: "Shell Xaverov (D11)", lat: 50.10958, lng: 14.6395 },
  { id: "V7", name: "Odpočívka Zbraslav (R4)", lat: 49.96729, lng: 14.37562 },
];

// ── Geometrie ──────────────────────────────────────────────────────────────
const km = (a: LatLng, b: LatLng) => {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = (((b[1] - a[1]) * Math.PI) / 180) * Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180);
  return 6371 * Math.hypot(dLat, dLon);
};
const lengthKm = (p: LatLng[]) => p.reduce((s, x, i) => (i ? s + km(p[i - 1], x) : 0), 0);
const round5 = (x: number) => Math.round(x * 1e5) / 1e5;

// Zhustit way na body po ~50 m (tunely mají v OSM dlouhé rovné úseky bez uzlů).
function densify(g: { lat: number; lon: number }[]): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < g.length; i++) {
    const b: LatLng = [g[i].lat, g[i].lon];
    if (i > 0) {
      const a: LatLng = [g[i - 1].lat, g[i - 1].lon];
      const steps = Math.floor(km(a, b) / 0.05);
      for (let k = 1; k < steps; k++) out.push([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
    }
    out.push(b);
  }
  return out;
}

// Body silnice → buňky ~100 m (slije oba jízdní pásy do jedné osy).
function thin(points: LatLng[]): LatLng[] {
  const cells = new Map<string, { lat: number; lng: number; n: number }>();
  for (const [lat, lng] of points) {
    const k = Math.round(lat / 0.0009) + ":" + Math.round(lng / 0.0014);
    const c = cells.get(k) ?? { lat: 0, lng: 0, n: 0 };
    c.lat += lat; c.lng += lng; c.n++;
    cells.set(k, c);
  }
  return [...cells.values()].map((c) => [c.lat / c.n, c.lng / c.n]);
}

// Souvislé části (hrany ≤ 260 m) → pro každou nejdelší cesta minimální kostry = osa.
function axes(pts: LatLng[]): LatLng[][] {
  const n = pts.length;
  const nb: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (Math.abs(pts[i][0] - pts[j][0]) < 0.003 && km(pts[i], pts[j]) <= 0.26) { nb[i].push(j); nb[j].push(i); }
  const seen = new Array(n).fill(false);
  const out: LatLng[][] = [];
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    // Prim nad komponentou
    const comp: number[] = [];
    const stack = [s]; seen[s] = true;
    while (stack.length) { const v = stack.pop()!; comp.push(v); for (const u of nb[v]) if (!seen[u]) { seen[u] = true; stack.push(u); } }
    if (comp.length < 8) continue;
    const inTree = new Set<number>([comp[0]]);
    const tree = new Map<number, number[]>(comp.map((v) => [v, []]));
    const best = new Map<number, { d: number; from: number }>();
    const relax = (v: number) => { for (const u of nb[v]) if (!inTree.has(u)) { const d = km(pts[v], pts[u]); const b = best.get(u); if (!b || d < b.d) best.set(u, { d, from: v }); } };
    relax(comp[0]);
    while (best.size) {
      let pick = -1, pd = Infinity;
      for (const [u, b] of best) if (b.d < pd) { pd = b.d; pick = u; }
      const { from } = best.get(pick)!; best.delete(pick);
      inTree.add(pick); tree.get(pick)!.push(from); tree.get(from)!.push(pick);
      relax(pick);
    }
    const far = (src: number) => {
      const dist = new Map<number, number>([[src, 0]]); const prev = new Map<number, number>();
      const q = [src];
      while (q.length) { const v = q.shift()!; for (const u of tree.get(v)!) if (!dist.has(u)) { dist.set(u, dist.get(v)! + km(pts[v], pts[u])); prev.set(u, v); q.push(u); } }
      let end = src; for (const [v, d] of dist) if (d > dist.get(end)!) end = v;
      return { end, prev };
    };
    const a = far(comp[0]).end;
    const { end: b, prev } = far(a);
    const path: LatLng[] = [];
    for (let v: number | undefined = b; v !== undefined; v = prev.get(v)) path.push(pts[v]);
    // Vyhlazení klouzavým průměrem (osa mezi pásy necuká).
    const smooth = path.map((p, i) => {
      const w = path.slice(Math.max(0, i - 1), i + 2);
      return [w.reduce((s, x) => s + x[0], 0) / w.length, w.reduce((s, x) => s + x[1], 0) / w.length] as LatLng;
    });
    out.push(smooth);
  }
  return out;
}

// ── Data ───────────────────────────────────────────────────────────────────
async function overpass(name: string, query: string): Promise<{ elements: unknown[] }> {
  const file = new URL(name, CACHE);
  if (!REFRESH && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  mkdirSync(CACHE, { recursive: true });
  for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(240_000),
      });
      const t = await r.text();
      if (r.ok && t.trimStart().startsWith("{")) { writeFileSync(file, t); return JSON.parse(t); }
      console.warn(`  ${url} → ${r.status}`);
    } catch (e) { console.warn(`  ${url} → ${String(e)}`); }
  }
  throw new Error("Overpass nedostupný – zkuste to později.");
}

console.log("OSM: silnice…");
const roads = (await overpass("roads.json", `[out:json][timeout:180];way(${BBOX})["highway"~"^(motorway|trunk)$"];out geom tags;`)).elements.filter((e) => (e as { type?: string }).type === "way") as Way[];
console.log("OSM: sjezdy a čtvrti…");
const named = (await overpass("places.json", `[out:json][timeout:120];(node(${BBOX})["highway"="motorway_junction"];node(${BBOX})["place"~"^(suburb|quarter|neighbourhood|village)$"];);out;`)).elements as OsmNode[];
const junctions = named.filter((n) => n.tags.highway === "motorway_junction" && n.tags.name);
const places = named.filter((n) => n.tags.place && n.tags.name);

// Úseky koridoru (fáze 1) necháváme, jak jsou – body sítě u nich vynecháme.
const corridorPts = CORRIDOR_PARAMS.zones.flatMap((z) => z.geo?.path ?? []) as LatLng[];
const nearCorridor = (p: LatLng) => corridorPts.some((c) => Math.abs(c[0] - p[0]) < 0.004 && km(c, p) < 0.25);

const byGroup = new Map<string, LatLng[][]>();
for (const g of GROUPS) {
  const pts = thin(roads.filter((w) => g.match(w.tags ?? {})).flatMap((w) => densify(w.geometry)))
    .filter((p) => !nearCorridor(p));
  byGroup.set(g.key, axes(pts));
}

// Radiály se dělí na D0: bod na radiále nejblíž D0 = křižovatka. Část blíž
// centru zůstává v byGroup (stejná id jako dřív), část za D0 jde do outer.
const d0pts = byGroup.get("d0")!.flat();
const outer = new Map<string, LatLng[][]>();
for (const g of GROUPS.filter((x) => x.radial)) {
  const clipped: LatLng[][] = [];
  const out: LatLng[][] = [];
  for (const axis of byGroup.get(g.key)!) {
    let limit = 9.5; // bez křížení s D0 (sever – D0 tam není): zhruba hranice Prahy
    let bestD = Infinity;
    for (const p of axis) {
      const d = Math.min(...d0pts.filter((q) => Math.abs(q[0] - p[0]) < 0.01).map((q) => km(p, q)), Infinity);
      if (d < 0.8 && d < bestD) { bestD = d; limit = km(p, CENTER) + 0.2; }
    }
    // Souvislé kusy uvnitř limitu (a zvlášť za ním)
    let cur: LatLng[] = [];
    let far: LatLng[] = [];
    for (const p of axis) {
      if (km(p, CENTER) <= limit) {
        cur.push(p);
        if (far.length) { out.push(far); far = []; }
      } else {
        far.push(p);
        if (cur.length) { clipped.push(cur); cur = []; }
      }
    }
    if (cur.length) clipped.push(cur);
    if (far.length) out.push(far);
  }
  byGroup.set(g.key, clipped);
  // Za D0 jen uvnitř výřezu dat (Overpass vrací celé silnice, které výřezem procházejí).
  outer.set(g.key, out.flatMap((axis) => {
    const runs: LatLng[][] = [];
    let run: LatLng[] = [];
    for (const p of axis) {
      if (inBox(p)) run.push(p);
      else if (run.length) { runs.push(run); run = []; }
    }
    if (run.length) runs.push(run);
    return runs;
  }));
}

// ── Úseky ──────────────────────────────────────────────────────────────────
const MIN_KM = 1.5, MAX_KM = 3.5, TAIL_KM = 1.0;
const nearestPlace = (p: LatLng): string => {
  let best = "", bd = 2.5;
  for (const n of places) { const d = km(p, [n.lat, n.lon]); if (d < bd) { bd = d; best = n.tags.name; } }
  return best;
};

const zones: DemandZone[] = [];
const usedNames = new Map<string, number>();
// Nejdřív úseky uvnitř D0 (id beze změny), pak úseky za D0 s vlastním prefixem.
const passes: { axes: Map<string, LatLng[][]>; prefix: string }[] = [
  { axes: byGroup, prefix: "" },
  { axes: outer, prefix: "x" },
];
for (const { axes: groupAxes, prefix } of passes)
for (const g of GROUPS) {
  let n = 0;
  for (const axis of groupAxes.get(g.key) ?? []) {
    const total = lengthKm(axis);
    if (total < 1.2) continue;
    const cum: number[] = [0];
    for (let i = 1; i < axis.length; i++) cum.push(cum[i - 1] + km(axis[i - 1], axis[i]));
    // Kandidáti řezu: sjezdy do 350 m od osy.
    const cands: { at: number; label: string }[] = [];
    for (const j of junctions) {
      let bi = -1, bd = 0.35;
      axis.forEach((p, i) => { if (Math.abs(p[0] - j.lat) < 0.005) { const d = km(p, [j.lat, j.lon]); if (d < bd) { bd = d; bi = i; } } });
      if (bi >= 0) cands.push({ at: cum[bi], label: j.tags.name });
    }
    cands.sort((a, b) => a.at - b.at);
    const cuts: { at: number; label: string }[] = [{ at: 0, label: "" }];
    const pushEven = (to: number) => {
      const from = cuts[cuts.length - 1].at;
      const parts = Math.ceil((to - from) / MAX_KM);
      for (let k = 1; k < parts; k++) cuts.push({ at: from + ((to - from) * k) / parts, label: "" });
    };
    for (const c of cands) {
      if (c.at - cuts[cuts.length - 1].at < MIN_KM || total - c.at < TAIL_KM) continue;
      if (c.at - cuts[cuts.length - 1].at > MAX_KM) pushEven(c.at);
      cuts.push(c);
    }
    if (total - cuts[cuts.length - 1].at > MAX_KM) pushEven(total);
    cuts.push({ at: total, label: "" });

    const pointAt = (at: number): LatLng => {
      const i = Math.max(1, cum.findIndex((c) => c >= at));
      const f = (at - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      return [axis[i - 1][0] + (axis[i][0] - axis[i - 1][0]) * f, axis[i - 1][1] + (axis[i][1] - axis[i - 1][1]) * f];
    };
    for (let s = 1; s < cuts.length; s++) {
      const a = cuts[s - 1], b = cuts[s];
      const inner = axis.filter((_, i) => cum[i] > a.at && cum[i] < b.at);
      const path = [pointAt(a.at), ...inner, pointAt(b.at)];
      // ≤ ~40 bodů na úsek stačí pro mapu
      const step = Math.max(1, Math.ceil(path.length / 40));
      const slim = path.filter((_, i) => i % step === 0 || i === path.length - 1).map((p) => [round5(p[0]), round5(p[1])] as [number, number]);
      const la = a.label || nearestPlace(path[0]);
      const lb = b.label || nearestPlace(path[path.length - 1]);
      let name = la && lb && la !== lb ? `${g.road} ${la}–${lb}` : `${g.road} ${la || lb || "úsek"}`;
      const dup = usedNames.get(name) ?? 0;
      usedNames.set(name, dup + 1);
      if (dup) name += ` (${dup + 1})`;
      const len = lengthKm(path);
      n++;
      zones.push({
        id: `${g.key}-${prefix}${String(n).padStart(2, "0")}`,
        name,
        road: g.road,
        annual: Math.round(len * g.perKm),
        weight: 1,
        geo: { path: slim },
      });
    }
  }
}
console.log(`Úseků: ${zones.length} (${GROUPS.map((g) => `${g.road} ${zones.filter((z) => z.road === g.road).length}`).join(", ")}), z toho za D0 ${zones.filter((z) => z.id.includes("-x")).length}`);

// ── Dojezdy (OSRM) ─────────────────────────────────────────────────────────
const corridorStands = CORRIDOR_PARAMS.stands;
const allStands = [
  ...corridorStands.map((s) => ({ id: s.id, lat: s.geo!.lat, lng: s.geo!.lng })),
  ...NETWORK_STANDS,
];
// Cílové body: 1/3 a 2/3 každého úseku (úseky koridoru i nové).
const targetZones = [...CORRIDOR_PARAMS.zones, ...zones];
const targets: { zone: string; p: LatLng }[] = [];
for (const z of targetZones) {
  const path = z.geo!.path as LatLng[];
  const L = lengthKm(path);
  for (const f of [1 / 3, 2 / 3]) {
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      const d = km(path[i - 1], path[i]);
      if (acc + d >= f * L) { const t = (f * L - acc) / (d || 1); targets.push({ zone: z.id, p: [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t] }); break; }
      acc += d;
    }
  }
}

const t0: Record<string, Record<string, number>> = Object.fromEntries(allStands.map((s) => [s.id, {}]));
if (NO_OSRM) {
  console.log("--no-osrm: dojezdy odhadnu ze vzdálenosti (vzdušnou čarou × 1,35 při 50 km/h + 2 min).");
  for (const s of allStands) for (const z of targetZones) {
    const pts = targets.filter((t) => t.zone === z.id);
    const d = pts.reduce((a, t) => a + km([s.lat, s.lng], t.p), 0) / pts.length;
    t0[s.id][z.id] = Math.round(((d * 1.35) / 50) * 60 + 2);
  }
} else {
  console.log(`OSRM: ${allStands.length} stanovišť × ${targets.length} bodů…`);
  const CHUNK = 80;
  const sums: Record<string, Record<string, number[]>> = Object.fromEntries(allStands.map((s) => [s.id, {}]));
  for (let off = 0; off < targets.length; off += CHUNK) {
    const chunk = targets.slice(off, off + CHUNK);
    const coords = [...allStands.map((s) => `${s.lng},${s.lat}`), ...chunk.map((t) => `${round5(t.p[1])},${round5(t.p[0])}`)].join(";");
    const src = allStands.map((_, i) => i).join(";");
    const dst = chunk.map((_, i) => i + allStands.length).join(";");
    const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=${src}&destinations=${dst}&annotations=duration`;
    let data: { code: string; durations: (number | null)[][] } | null = null;
    for (let attempt = 0; attempt < 4 && !data; attempt++) {
      try {
        const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
        const j = await r.json();
        if (j.code === "Ok") data = j; else console.warn("  OSRM", r.status, j.code);
      } catch (e) { console.warn("  OSRM", String(e)); }
      if (!data) await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
    if (!data) throw new Error("OSRM nedostupný – zkuste to později nebo --no-osrm.");
    allStands.forEach((s, si) => chunk.forEach((t, ti) => {
      const sec = data!.durations[si][ti];
      if (sec != null) (sums[s.id][t.zone] ??= []).push(sec);
    }));
    process.stdout.write(`  ${Math.min(off + CHUNK, targets.length)}/${targets.length}\n`);
    await new Promise((r) => setTimeout(r, 1100)); // šetrně k veřejnému serveru
  }
  // OSRM počítá volný provoz optimisticky: +10 % a +1 min na výjezd ze stanoviště.
  for (const s of allStands) for (const [zone, secs] of Object.entries(sums[s.id])) {
    const avg = secs.reduce((a, b) => a + b, 0) / secs.length;
    t0[s.id][zone] = Math.round(((avg / 60) * 1.1 + 1) * 10) / 10;
  }
}

// Stanoviště koridoru: dojezdy z OSRM na celou síť (i na koridor), ať se všechna
// stanoviště porovnávají stejně. Ruční hodnoty ze zadání zůstávají jen v CORRIDOR_PARAMS.
const corridorExtra: Record<string, Record<string, number>> = {};
for (const s of corridorStands) corridorExtra[s.id] = t0[s.id];
const stands: Stand[] = NETWORK_STANDS.map((s) => ({ id: s.id, name: s.name, t0: t0[s.id], geo: { lat: s.lat, lng: s.lng } }));

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      travel: NO_OSRM ? "odhad" : "osrm",
      note: "DEMO: annual je odhad z délky úseku. Mapová data © přispěvatelé OpenStreetMap (ODbL).",
      zones,
      stands,
      corridorStandT0: corridorExtra,
    },
    null,
    0,
  ) + "\n",
);
console.log(`Zapsáno: ${zones.length} úseků, ${stands.length} nových stanovišť → src/predict/network.json`);
