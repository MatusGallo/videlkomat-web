import type { DemandZone, ModelParams, Stand } from "./types";
import { CORRIDOR_PARAMS } from "./corridorParams";
import { pathLengthKm } from "./geo";
import network from "./network.json";
import demand from "./demand.json";

// Výchozí parametry aplikace = koridor z fáze 1 + páteřní síť Prahy (fáze 2:
// Městský okruh, D0, radiály). Síť generuje scripts/build-network.ts z OSM,
// dojezdy přes OSRM. Poptávka je reálná z nehod Policie ČR (demand.json);
// ESTIMATE_PARAMS je záloha s odhadem z délky úseku. Stanoviště jsou ukázková.
const netZones = network.zones as DemandZone[];
const netStands = network.stands as Stand[];
const corridorStandT0 = network.corridorStandT0 as Record<string, Record<string, number>>;

// Události za rok na km – stejné sazby jako v build-network.ts, ať koridor
// (ručně odhadnutý ve fázi 1) nepřevažuje nad zbytkem sítě.
export const ROAD_RATE_PER_KM: Record<string, number> = { MO: 60, "Štěrboholská spojka": 45 };

const corridorZones = CORRIDOR_PARAMS.zones.map((z) => {
  const rate = z.road ? ROAD_RATE_PER_KM[z.road] : undefined;
  return rate && z.geo ? { ...z, annual: Math.round(pathLengthKm(z.geo.path) * rate) } : z;
});

// Síť s odhadnutou poptávkou (bez reálných dat).
export const ESTIMATE_PARAMS: ModelParams = {
  ...CORRIDOR_PARAMS,
  zones: [...corridorZones, ...netZones],
  // Všechna stanoviště mají dojezdy z OSRM (ruční ze zadání jen jako záloha).
  stands: [
    ...CORRIDOR_PARAMS.stands.map((s) => ({ ...s, t0: { ...s.t0, ...(corridorStandT0[s.id] ?? {}) } })),
    ...netStands,
  ],
};

// Reálná poptávka z nehod Policie ČR (scripts/fetch-police.ts → import-cdv.ts --bundle):
// roční počty po úsecích, profily hodin (i po silnicích), koeficienty dnů a kalendář (svátky, měsíce).
type Demand = {
  source: string;
  profiles: ModelParams["profiles"];
  dayFactor: number[];
  calendar?: ModelParams["calendar"];
  zones: Record<string, { annual: number; profiles?: ModelParams["profiles"] }>;
};
const real = demand as Demand;

export const DEMO_PARAMS: ModelParams = {
  ...ESTIMATE_PARAMS,
  source: "import",
  isDemo: false,
  dataSource: real.source,
  profiles: real.profiles,
  dayFactor: real.dayFactor,
  calendar: real.calendar,
  zones: ESTIMATE_PARAMS.zones.map((z) => {
    const r = real.zones[z.id];
    return r ? { ...z, annual: r.annual, profiles: r.profiles } : z;
  }),
};

// Pořadí silnic v seznamech.
export const ROAD_ORDER = ["MO", "Štěrboholská spojka", "D0", "D1", "D5", "D6", "D7", "D8", "D10", "D11", "R4"];
