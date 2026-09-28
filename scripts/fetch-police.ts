// Reálné nehody z Mapy dopravních nehod Policie ČR (nehody.policie.gov.cz)
// → CSV pro scripts/import-cdv.ts.
//
//   npm run fetch:police [-- --months 36] [-- --to 202608]
//
// Stahuje stejné měsíční soubory, jaké mapa načítá při zobrazení a tlačítku
// „Stáhnout" (/api/v1/data/RRRRMM.pbf, formát Geobuf, WGS84, celá ČR ~0,3 MB).
// Šetrně: jeden soubor naráz s pauzou, při 429 počká; stažené měsíce jsou v
// cache (scripts/.police-cache), takže se znovu nestahují.
// Výstup: scripts/.police-cache/praha.csv – jen nehody v okolí Prahy (bbox sítě).
//
// Zdroj dat: Policie ČR. Jsou to nehody evidované policií – drobné nehody
// sepsané bez policie (euroformulář) a poruchy v datech nejsou.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import geobuf from "geobuf";
import Pbf from "pbf";

const BASE = "https://nehody.policie.gov.cz/api/v1/";
const CACHE = new URL("./.police-cache/", import.meta.url);
const UA = "videlkomat-kde-cekat/1.0 (osobni pouziti, analyza poptavky po odtazich)";
const BBOX = { minLat: 49.93, maxLat: 50.19, minLng: 14.2, maxLng: 14.73 }; // stejný jako build-network
const PAUSE_MS = 1500;

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const MONTHS = Number(opt("--months") ?? 36);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, binary: boolean): Promise<ArrayBuffer | unknown> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) });
    if (r.status === 429) {
      console.warn("  429 – server žádá pauzu, čekám 2,5 min…");
      await sleep(150_000);
      continue;
    }
    if (!r.ok) throw new Error(`${url} → ${r.status}`);
    return binary ? r.arrayBuffer() : r.json();
  }
  throw new Error(`${url}: opakovaně 429`);
}

// Rozbalení atributů (stejně jako mapa policie): p[0] = kategorie 1–4, zbytek
// znaky − 5 → dvoumístná čísla; značka \x04 = lichá délka (poslední bez nuly).
function decodeCode(p: string): { cat: number; code: string } {
  const cat = parseInt(p.slice(0, 1), 10);
  let d = p.slice(1);
  let odd = false;
  if (d[0] === String.fromCharCode(4)) { odd = true; d = d.slice(1); }
  let code = "";
  for (let i = 0; i < d.length; i++) {
    const v = d.charCodeAt(i) - 5;
    code += String(v).length < 2 && !(odd && i === d.length - 1) ? "0" + v : String(v);
  }
  return { cat, code };
}
const num = (code: string, at: number, len?: number) => parseInt(len == null ? code.slice(at) : code.substr(at, len), 10);

// ── Měsíce ─────────────────────────────────────────────────────────────────
mkdirSync(CACHE, { recursive: true });
const latestInData = ((await get(BASE + "latest", false)) as { data: { latest: string } }).data.latest;
// Nejnovější měsíc v datech bývá rozpracovaný → bereme jen uzavřené měsíce.
const prevMonth = (ym: string) => {
  const y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(4, 6), 10);
  return m === 1 ? `${y - 1}12` : `${y}${String(m - 1).padStart(2, "0")}`;
};
const latest = opt("--to") ?? prevMonth(latestInData);
const months: string[] = [];
{
  let y = parseInt(latest.slice(0, 4), 10), m = parseInt(latest.slice(4, 6), 10);
  for (let i = 0; i < MONTHS; i++) {
    months.unshift(`${y}${String(m).padStart(2, "0")}`);
    if (--m === 0) { m = 12; y--; }
  }
}
console.log(`Měsíce ${months[0]}–${months[months.length - 1]} (${months.length}), nejnovější v datech ${latestInData}.`);

const rows: string[] = ["datetime,cas_znam,lat,lng,kategorie,druh,usmrceno,tezce,lehce,skoda_kc"];
let total = 0, inBox = 0, noHour = 0;
for (const ym of months) {
  const file = new URL(`${ym}.pbf`, CACHE);
  let buf: Uint8Array;
  if (existsSync(file)) buf = readFileSync(file);
  else {
    buf = new Uint8Array((await get(`${BASE}data/${ym}.pbf`, true)) as ArrayBuffer);
    writeFileSync(file, buf);
    await sleep(PAUSE_MS);
  }
  const gj = geobuf.decode(new Pbf(buf)) as { features: { geometry: { coordinates: [number, number] }; properties: { p: string } }[] };
  let n = 0;
  for (const f of gj.features) {
    total++;
    const [lng, lat] = f.geometry.coordinates;
    if (lat < BBOX.minLat || lat > BBOX.maxLat || lng < BBOX.minLng || lng > BBOX.maxLng) continue;
    const { cat, code } = decodeCode(f.properties.p);
    const day = num(code, 6, 2);
    const hour = num(code, 8, 2); // 24 = neznámá hodina
    if (!(day >= 1 && day <= 31)) continue;
    const known = hour >= 0 && hour <= 23;
    if (!known) noHour++;
    const dt = `${ym.slice(0, 4)}-${ym.slice(4, 6)}-${String(day).padStart(2, "0")} ${String(known ? hour : 12).padStart(2, "0")}:00`;
    rows.push([dt, known ? 1 : 0, lat.toFixed(6), lng.toFixed(6), cat, num(code, 26, 1), num(code, 0, 2) - 10, num(code, 2, 2), num(code, 4, 2), num(code, 30) * 100].join(","));
    n++;
    inBox++;
  }
  console.log(`  ${ym}: ${gj.features.length} v ČR, ${n} v okolí Prahy`);
}
const out = new URL("praha.csv", CACHE);
writeFileSync(out, rows.join("\n") + "\n");
console.log(`Hotovo: ${inBox} nehod v okolí Prahy z ${total} v ČR (bez hodiny ${noHour}) → scripts/.police-cache/praha.csv`);
console.log(`Další krok: npm run import:cdv -- scripts/.police-cache/praha.csv --years ${(months.length / 12).toFixed(2)}`);
