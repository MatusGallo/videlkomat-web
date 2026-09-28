import { DEMO_PARAMS } from "./demoParams";
import { distanceKm, estimateT0 } from "./geo";
import type { DemandZone, JobDirection, JobKind, JobResult, JobSource, ModelParams, ParamsSource } from "./types";

export const DAY_SHORT = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
export const DAY_LONG = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];

export const hourLabel = (h: number): string => String(h).padStart(2, "0") + ":00";
export const hourRange = (h: number): string => `${hourLabel(h)}–${hourLabel((h + 1) % 24)}`;

export const KIND_LABEL: Record<JobKind, string> = { accident: "Nehoda", breakdown: "Porucha" };
export const RESULT_LABEL: Record<JobResult, string> = { won: "Získáno", lost: "Předběhnut" };
export const DIRECTION_LABEL: Record<JobDirection, string> = { to_center: "Do centra", from_center: "Z centra" };
export const SOURCE_LABEL: Record<JobSource, string> = {
  assistance: "Aplikace asistence",
  driver: "Řidič přímo",
  police: "Policie",
  other: "Jiné",
};
// Název úseku bez silnice na začátku – v seznamu seskupeném podle silnice je navíc.
export const shortZoneName = (z: DemandZone): string =>
  z.road && z.name.startsWith(z.road + " ") ? z.name.slice(z.road.length + 1) : z.name;

export const SOURCES: JobSource[] = ["assistance", "driver", "police", "other"];

export const PARAMS_SOURCE_LABEL: Record<ParamsSource, string> = {
  demo: "ukázková data",
  import: "import dat",
  calibration: "kalibrace z výjezdů",
  user: "úprava stanovišť",
};

// Ukázková stanoviště, která existovala, než se začalo evidovat demoStandsSeen.
const LEGACY_DEMO_STANDS = "ABCDEFGHIJKLMN".split("");

// Starší uložené verze (před mapou / před páteřní sítí) doplníme z demo dat:
// chybějící polohy, silnice, úseky sítě a nová ukázková stanoviště. Stanovištím dopočítáme dojezdy na
// úseky, které ještě nemají – z demo dat (pokud stanoviště nikdo nepřesunul),
// jinak odhadem z polohy.
export function upgradeParams(p: ModelParams, demo: ModelParams = DEMO_PARAMS): ModelParams {
  const demoZone = new Map(demo.zones.map((z) => [z.id, z]));
  const zones: DemandZone[] = p.zones.map((z) => {
    const d = demoZone.get(z.id);
    return { ...z, geo: z.geo ?? d?.geo, road: z.road ?? d?.road };
  });
  const have = new Set(zones.map((z) => z.id));
  for (const z of demo.zones) if (!have.has(z.id)) zones.push(z);

  const demoStand = new Map(demo.stands.map((s) => [s.id, s]));
  const seen = new Set(p.demoStandsSeen ?? LEGACY_DEMO_STANDS);
  const own = new Set(p.stands.map((s) => s.id));
  const fresh = demo.stands.filter((s) => !seen.has(s.id) && !own.has(s.id));
  const demoStandsSeen = [...new Set([...seen, ...demo.stands.map((s) => s.id)])];
  const stands = [...p.stands, ...fresh].map((s) => {
    const d = demoStand.get(s.id);
    const geo = s.geo ?? d?.geo;
    const samePlace = !!d?.geo && !!geo && distanceKm(d.geo, geo) < 0.3;
    const t0 = { ...s.t0 };
    for (const z of zones) {
      if (t0[z.id] != null) continue;
      const fromDemo = samePlace ? d?.t0[z.id] : undefined;
      const est = fromDemo ?? (geo && z.geo ? estimateT0(geo, z.geo.path) : null);
      if (est != null) t0[z.id] = est;
    }
    return { ...s, geo, t0 };
  });
  // Starší verze s odhadnutou poptávkou převezmou reálnou (stanoviště, učení a
  // kalibrace p(T) zůstanou). Vlastní import (source "import") se nepřepisuje.
  const adoptDemand = !!demo.dataSource && p.dataSource !== demo.dataSource && p.source !== "import";
  // Kalendář (svátky, měsíce) doplníme i starším verzím, které ho nemají.
  const calendar = p.calendar ?? demo.calendar;
  if (!adoptDemand) return { ...p, zones, stands, calendar, demoStandsSeen };
  return {
    ...p,
    isDemo: demo.isDemo,
    dataSource: demo.dataSource,
    profiles: demo.profiles,
    dayFactor: demo.dayFactor,
    calendar: demo.calendar ?? p.calendar,
    demoStandsSeen,
    zones: zones.map((z) => {
      const d = demoZone.get(z.id);
      return d ? { ...z, annual: d.annual, profiles: d.profiles } : z;
    }),
    stands,
  };
}

// Platné parametry = nejvyšší verze; bez verzí ukázková data.
export const latestParams = (rows: { params: ModelParams }[]): ModelParams =>
  upgradeParams(
    rows.reduce<ModelParams>((best, r) => (r.params && r.params.version > best.version ? r.params : best), DEMO_PARAMS),
  );
