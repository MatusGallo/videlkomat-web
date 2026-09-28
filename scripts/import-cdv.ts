// Import nehod (nehody.cdv.cz / Policie ČR) → parametry modelu „Kde čekat".
//
//   npm run import:cdv -- udalosti.csv --years 3 [--base params.json] [--out params.json]
//                         [--bundle "popis zdroje"] [--upload] [--vcetne-chodcu]
//
// --bundle zapíše poptávku do src/predict/demand.json – aplikace ji pak
// používá jako výchozí (bez Supabase). --upload ji nahraje jako novou verzi.
//
// Vstup: CSV s jednou událostí na řádek (oddělovač , nebo ;). Sloupce:
//   čas:    datetime (ISO / "YYYY-MM-DD HH:MM"), nebo datum + cas
//   místo:  lat + lng (WGS84, desetinné stupně) → úsek se přiřadí sám
//           (nejbližší úsek do 150 m), nebo zone_id (id úseku ručně)
// Souřadnice S-JTSK (X/Y z policejních dat) je potřeba předem převést na WGS84.
//
// Výstup: annual po úsecích (průměr za rok), společné hodinové profily,
// koeficienty dnů v týdnu a – pro silnice s aspoň 200 událostmi – vlastní
// profil silnice (odpolední špička na D0 ≠ na Městském okruhu).
// Stanoviště, kongesce a p(T) se převezmou z --base nebo z demo parametrů.
// Z denních počtů (všechny nehody v souboru, ne jen na síti) spočítá násobky
// pro svátky, Vánoce, konec roku a měsíce; s --bundle zapíše i historii po
// dnech a události na síti (src/predict/history.json) pro záložku Historie.
import { readFileSync, writeFileSync } from "node:fs";
import { DEMO_PARAMS } from "../src/predict/demoParams";
import { dayKind, isoLocal } from "../src/predict/calendar";
import { pointToPathKm } from "../src/predict/geo";
import type { CalendarFactors, ModelParams } from "../src/predict/types";

const ASSIGN_KM = 0.15;
const ROAD_PROFILE_MIN = 200;

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const input = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const years = Number(opt("--years"));
if (!input || !(years > 0)) {
  console.error("Použití: npm run import:cdv -- udalosti.csv --years 3 [--base params.json] [--out params.json] [--upload]");
  process.exit(1);
}

const base: ModelParams = opt("--base") ? JSON.parse(readFileSync(opt("--base") as string, "utf8")) : DEMO_PARAMS;

const lines = readFileSync(input, "utf8").split(/\r?\n/).filter((l) => l.trim() !== "");
const sep = lines[0].includes(";") ? ";" : ",";
const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
const iDT = col("datetime");
const iDate = col("datum", "date");
const iTime = col("cas", "čas", "time");
const iZone = col("zone_id");
const iLat = col("lat", "latitude", "gps_lat");
const iLng = col("lng", "lon", "longitude", "gps_lng", "gps_lon");
// cas_znam = 0: hodina neznámá → počítá se do ročního počtu a dne, ne do profilu hodin.
const iKnown = col("cas_znam");
// Druh nehody (kódy Policie ČR): 4 = srážka s chodcem – odtah obvykle netřeba.
const iDruh = col("druh");
const withPedestrians = args.includes("--vcetne-chodcu");
let pedestrians = 0;
if (iDT < 0 && iDate < 0) {
  console.error("CSV musí mít sloupec datetime, nebo datum (+ cas).");
  process.exit(1);
}
if (iZone < 0 && (iLat < 0 || iLng < 0)) {
  console.error("CSV musí mít sloupce lat + lng, nebo zone_id.");
  process.exit(1);
}

const zoneIds = new Set(base.zones.map((z) => z.id));
const nearestZone = (lat: number, lng: number): string | null => {
  let best: string | null = null;
  let bd = ASSIGN_KM;
  for (const z of base.zones) {
    if (!z.geo) continue;
    const d = pointToPathKm({ lat, lng }, z.geo.path);
    if (d < bd) { bd = d; best = z.id; }
  }
  return best;
};

const perZone = new Map<string, number>();
const hours = () => ({ weekday: new Array(24).fill(0), weekend: new Array(24).fill(0) });
const all = hours();
const perRoad = new Map<string, ReturnType<typeof hours>>();
// Nehody po dnech (celý soubor) a události na síti pro historii.
const daily = new Map<string, number>();
const events: { iso: string; h: number; zone: string; lat: number; lng: number }[] = [];
let skippedTime = 0, offNetwork = 0;

for (const line of lines.slice(1)) {
  const c = line.split(sep).map((x) => x.trim());
  const raw = iDT >= 0 ? c[iDT] : `${c[iDate]} ${iTime >= 0 ? c[iTime] : "12:00"}`;
  const dt = new Date(raw.replace(" ", "T"));
  if (isNaN(dt.getTime())) { skippedTime++; continue; }
  if (!withPedestrians && iDruh >= 0 && c[iDruh] === "4") { pedestrians++; continue; }
  const iso = isoLocal(dt);
  daily.set(iso, (daily.get(iso) ?? 0) + 1);
  let zone: string | null = iZone >= 0 && zoneIds.has(c[iZone]) ? c[iZone] : null;
  const lat = iLat >= 0 ? Number(c[iLat].replace(",", ".")) : NaN;
  const lng = iLng >= 0 ? Number(c[iLng].replace(",", ".")) : NaN;
  if (!zone && Number.isFinite(lat) && Number.isFinite(lng)) zone = nearestZone(lat, lng);
  if (!zone) { offNetwork++; continue; }
  const d = (dt.getDay() + 6) % 7;
  const key = d >= 5 ? "weekend" : "weekday";
  perZone.set(zone, (perZone.get(zone) ?? 0) + 1);
  const hourKnown = iKnown < 0 || c[iKnown] !== "0";
  events.push({ iso, h: hourKnown ? dt.getHours() : -1, zone, lat, lng });
  if (hourKnown) {
    all[key][dt.getHours()]++;
    const road = base.zones.find((z) => z.id === zone)?.road ?? "?";
    const rp = perRoad.get(road) ?? hours();
    rp[key][dt.getHours()]++;
    perRoad.set(road, rp);
  }
}

const total = [...perZone.values()].reduce((a, b) => a + b, 0);
if (total === 0) {
  console.error("Žádná událost na síti – zkontrolujte souřadnice (WGS84) nebo zone_id.");
  process.exit(1);
}

const normalize = (a: number[]) => {
  const s = a.reduce((x, y) => x + y, 0);
  return s > 0 ? a.map((x) => x / s) : a;
};
// Málo dat v hodině by dalo nulu – vyhladíme sousedními hodinami (kruhově).
const smooth = (a: number[]) => a.map((_, h) => (a[(h + 23) % 24] + 2 * a[h] + a[(h + 1) % 24]) / 4);
const profileOf = (p: ReturnType<typeof hours>, fallback: ModelParams["profiles"]) => ({
  weekday: p.weekday.some((x) => x > 0) ? normalize(smooth(p.weekday)) : fallback.weekday,
  weekend: p.weekend.some((x) => x > 0) ? normalize(smooth(p.weekend)) : fallback.weekend,
});
// ── Kalendář ──────────────────────────────────────────────────────────────
// Všechny dny od prvního do posledního data (i dny bez nehody).
const dayList: Date[] = [];
{
  const isos = [...daily.keys()].sort();
  const [y0, m0, d0] = isos[0].split("-").map(Number);
  const last = isos[isos.length - 1];
  for (let t = new Date(y0, m0 - 1, d0); isoLocal(t) <= last; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1))
    dayList.push(t);
}
const wdOf = (t: Date) => (t.getDay() + 6) % 7;
const kindOf = (t: Date) => dayKind(t).kind;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
// Běžný den v týdnu = průměr dnů, které nejsou svátek / Vánoce / konec roku.
const baseCounts: number[][] = Array.from({ length: 7 }, () => []);
for (const t of dayList) if (!kindOf(t)) baseCounts[wdOf(t)].push(daily.get(isoLocal(t)) ?? 0);
const baseline = baseCounts.map(mean);
const ratio = (t: Date) => (baseline[wdOf(t)] > 0 ? (daily.get(isoLocal(t)) ?? 0) / baseline[wdOf(t)] : 1);
const monthRaw = Array.from(
  { length: 12 },
  (_, m) => mean(dayList.filter((t) => !kindOf(t) && t.getMonth() === m).map(ratio)) || 1,
);
const special = (k: string) => {
  const r = dayList.filter((t) => kindOf(t) === k).map((t) => ratio(t) / monthRaw[t.getMonth()]);
  return r.length ? mean(r) : 1;
};
const specialRaw = { holiday: special("holiday"), christmas: special("christmas"), yearEnd: special("yearEnd") };

// Den v týdnu na síti – jen z běžných dnů (svátky řeší kalendář), průměr na den.
const perDaySum = new Array(7).fill(0);
const perDayN = new Array(7).fill(0);
for (const t of dayList) if (!kindOf(t)) perDayN[wdOf(t)]++;
for (const e of events) {
  const [y, m, dd] = e.iso.split("-").map(Number);
  const t = new Date(y, m - 1, dd);
  if (!kindOf(t)) perDaySum[wdOf(t)]++;
}
const perDay = perDaySum.map((s, i) => (perDayN[i] > 0 ? s / perDayN[i] : 0));
const meanDay = perDay.reduce((a, b) => a + b, 0) / 7;
const dayFactor = meanDay > 0 ? perDay.map((x) => x / meanDay) : base.dayFactor;

// Normalizace: průměrný den v datech má dát annual / 365 (roční součet sedí).
const avgDF = mean(dayFactor);
const norm = mean(
  dayList.map((t) => {
    const k = kindOf(t);
    return (dayFactor[wdOf(t)] / avgDF) * monthRaw[t.getMonth()] * (k ? specialRaw[k] : 1);
  }),
);
const calendar: CalendarFactors = { month: monthRaw.map((x) => x / norm), ...specialRaw };
const profiles = profileOf(all, base.profiles);
const roadProfiles = new Map(
  [...perRoad.entries()]
    .filter(([, p]) => p.weekday.concat(p.weekend).reduce((a, b) => a + b, 0) >= ROAD_PROFILE_MIN)
    .map(([road, p]) => [road, profileOf(p, profiles)]),
);

const next: ModelParams = {
  ...base,
  version: base.version + 1,
  createdAt: new Date().toISOString(),
  source: "import",
  isDemo: false,
  zones: base.zones.map((z) => ({
    ...z,
    annual: (perZone.get(z.id) ?? 0) / years,
    learn: undefined, // nová data → učení z výjezdů začíná znovu
    profiles: z.road ? roadProfiles.get(z.road) : undefined,
  })),
  profiles,
  dayFactor,
  calendar,
};

console.log(`Událostí na síti: ${total} za ${years} r. (mimo síť ${offNetwork}, bez času ${skippedTime}${withPedestrians ? "" : `, vynecháno s chodcem ${pedestrians}`}).`);
const pctTxt = (x: number) => `${x >= 1 ? "+" : ""}${Math.round((x - 1) * 100)} %`;
console.log(
  `Svátky ${pctTxt(calendar.holiday)}, Vánoce ${pctTxt(calendar.christmas)}, konec roku ${pctTxt(calendar.yearEnd)}; ` +
    `měsíce ${calendar.month.map((m) => m.toFixed(2)).join(" ")}`,
);
console.log(`Vlastní profil silnice: ${[...roadProfiles.keys()].join(", ") || "žádná (málo dat)"}`);
for (const z of next.zones.filter((x) => x.annual > 0).sort((a, b) => b.annual - a.annual).slice(0, 15)) {
  console.log(`  ${z.id.padEnd(7)} ${z.annual.toFixed(1).padStart(6)} / rok  ${z.name}`);
}

const bundle = opt("--bundle");
if (bundle) {
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const r5 = (a: number[]) => a.map((x) => Math.round(x * 1e5) / 1e5);
  const demand = {
    source: bundle,
    generatedAt: new Date().toISOString(),
    events: total,
    years,
    profiles: { weekday: r5(next.profiles.weekday), weekend: r5(next.profiles.weekend) },
    dayFactor: next.dayFactor.map(r3),
    calendar: {
      month: calendar.month.map(r3),
      holiday: r3(calendar.holiday),
      christmas: r3(calendar.christmas),
      yearEnd: r3(calendar.yearEnd),
    },
    zones: Object.fromEntries(
      next.zones.map((z) => [
        z.id,
        { annual: r3(z.annual), ...(z.profiles ? { profiles: { weekday: r5(z.profiles.weekday), weekend: r5(z.profiles.weekend) } } : {}) },
      ]),
    ),
  };
  writeFileSync(new URL("../src/predict/demand.json", import.meta.url), JSON.stringify(demand) + "\n");
  console.log("Zapsáno do src/predict/demand.json – aplikace použije reálnou poptávku.");

  // Historie: nehody po dnech od `from` a události na síti
  // [den od from, hodina (−1 = neznámá), index úseku, lat×1e4 − 500000, lng×1e4 − 140000].
  const dayIdx = new Map(dayList.map((t, i) => [isoLocal(t), i]));
  const zoneList = base.zones.map((z) => z.id);
  const zi = new Map(zoneList.map((id, i) => [id, i]));
  const history = {
    source: bundle,
    from: isoLocal(dayList[0]),
    daily: dayList.map((t) => daily.get(isoLocal(t)) ?? 0),
    zones: zoneList,
    events: events
      .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng))
      .sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : a.h - b.h))
      .map((e) => [dayIdx.get(e.iso)!, e.h, zi.get(e.zone)!, Math.round(e.lat * 1e4) - 500000, Math.round(e.lng * 1e4) - 140000]),
  };
  writeFileSync(new URL("../src/predict/history.json", import.meta.url), JSON.stringify(history) + "\n");
  console.log(`Zapsáno do src/predict/history.json (${history.daily.length} dní, ${history.events.length} událostí na síti).`);
}

const out = opt("--out") ?? "params.import.json";
writeFileSync(out, JSON.stringify(next, null, 2));
console.log(`Zapsáno do ${out} (v${next.version}).`);

if (args.includes("--upload")) {
  const URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !KEY) {
    console.error("Pro --upload nastavte SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const r = await fetch(`${URL}/rest/v1/predict_params`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ id: crypto.randomUUID(), version: next.version, source: next.source, data: next }),
  });
  if (!r.ok) throw new Error(`upload → ${r.status} ${await r.text()}`);
  console.log("Nahráno do Supabase – aplikace ho načte při příštím spuštění.");
}
